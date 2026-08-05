import { claimsOf, heldGameCredential, platformClient } from "$lib/server/serverPrincipal";
// spec: identity-and-authorization/participant-token-eligibility#bot-token-requires-team-credential,
//       identity-and-authorization/connect-time-validation
// This server acting as its team's bot: obtain a bot access token under the
// held game credential, and present it to the game's SpacetimeDB instance.
//
// The whole exchange happens server-side because it is the Server's own act —
// the game credential and the bot token are this process's to hold and
// present, never a page's. The response reports what happened at each step:
// the bot token's decoded claims, what the host's websocket-token exchange
// preserved of them, and the instance's admission answer. Against the shipped
// module the admission answer is a refusal — its seed tables have no writer
// until migrate-game-lifecycle lands `initialize_game`, so an uninitialised
// instance admits no one, which is the safe direction for that gap to fail in.
import { api } from "@cyphid/snek-convex-host/api";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { decodeJwt } from "jose";

/** Where this process reaches the SpacetimeDB host, and which database. */
const stdbUrl = () => process.env["SNEK_STDB_URL_INTERNAL"] ?? "http://127.0.0.1:3000";
const stdbDatabase = () => process.env["SNEK_STDB_DATABASE"] ?? "snek-local";

export const POST: RequestHandler = async () => {
  const credential = heldGameCredential();
  if (!credential) {
    return json({ ok: false, refused: "no game credential is held — begin custody first" });
  }
  const scope = claimsOf(credential);
  const [, teamId, gameId] = scope.subject.split(":");

  let botToken: string;
  try {
    botToken = await platformClient().action(api.issuance.issueGameToken, {
      credential,
      gameId: gameId ?? "",
      role: "bot",
    });
  } catch (refused) {
    return json({ ok: false, refused: refused instanceof Error ? refused.message : "refused" });
  }
  const claims = claimsOf(botToken);

  // The exchange every browser connection goes through: the host re-mints the
  // token under its own key. What admission then decides on must be the claims
  // the platform signed — established here by comparing them.
  // spec: identity-and-authorization/connect-time-validation#re-issuance-preserves-the-binding
  let exchangePreserved: { iss: boolean; aud: boolean; sub: boolean } | null = null;
  try {
    const exchanged = await fetch(new URL("/v1/identity/websocket-token", stdbUrl()), {
      method: "POST",
      headers: { authorization: `Bearer ${botToken}` },
    });
    if (exchanged.ok) {
      const reminted = decodeJwt(((await exchanged.json()) as { token: string }).token);
      exchangePreserved = {
        iss: reminted.iss === claims.issuer,
        aud: (typeof reminted.aud === "string" ? reminted.aud : reminted.aud?.[0]) === gameId,
        sub: reminted.sub === claims.subject,
      };
    }
  } catch {
    // The admission attempt below reports the host being unreachable.
  }

  // One connection attempt, presenting the token on the upgrade-equivalent
  // one-off call endpoint: the host verifies the signature, the module's
  // connect hook decides admission, and a refusal aborts before any state is
  // touched.
  let admission: { status: number; detail: string };
  try {
    const response = await fetch(new URL(`/v1/database/${stdbDatabase()}/call/ping`, stdbUrl()), {
      method: "POST",
      headers: { authorization: `Bearer ${botToken}`, "content-type": "application/json" },
      body: JSON.stringify(["console-act"]),
    });
    admission = { status: response.status, detail: (await response.text()).slice(0, 200) };
  } catch (unreachable) {
    admission = {
      status: 0,
      detail: unreachable instanceof Error ? unreachable.message : "host unreachable",
    };
  }

  return json({
    ok: true,
    teamId,
    gameId,
    botToken: { claims },
    exchangePreserved,
    admission,
  });
};
