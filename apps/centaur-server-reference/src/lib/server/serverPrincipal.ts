import {
  type CredentialHandle,
  type GameScope,
  type Renewal,
  type ServerIdentity,
  holdGameCredential,
  renewalAction,
  signAssertion,
} from "@cyphid/snek-centaur-server-lib";
// spec: identity-and-authorization/service-principal-assertions,
//       identity-and-authorization/client-credential-custody
// This server acting as itself: the service-principal side of the platform's
// issuance, held in process memory and nowhere else.
//
// What lives here is custody state — the platform credential this server last
// earned by assertion, and the handle holding a per-team game credential with
// its proactive renewal — shared by the console's server routes. Credentials
// are module-scope variables on purpose: a restart drops them and the signing
// key earns fresh ones, which is exactly the custody rule
// (`#own-key-is-the-only-thing-at-rest`). Nothing here returns a raw
// credential to a page; the console shows decoded claims alone.
import { api } from "@cyphid/snek-convex-host/api";
import { ConvexHttpClient } from "convex/browser";
import { type JWTPayload, decodeJwt } from "jose";
import { serverKeys } from "./serverKeys";

/** This server's identity toward the platform, derived per request origin. */
export async function serverIdentity(origin: string): Promise<ServerIdentity> {
  const { signingKey } = await serverKeys();
  return {
    signingKey,
    domain: origin,
    issuanceEndpoint: process.env["CONVEX_SITE_URL"] ?? "",
  };
}

/** A client for the platform's functions, from this process's environment. */
export function platformClient(): ConvexHttpClient {
  return new ConvexHttpClient(process.env["CONVEX_URL"] ?? "");
}

/** The claims of a held credential, as the console displays them. */
export interface HeldClaims {
  readonly subject: string;
  readonly audience: string;
  readonly issuer: string;
  readonly capabilities: ReadonlyArray<string>;
  readonly actingSystem?: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export function claimsOf(credential: string): HeldClaims {
  const payload = decodeJwt(credential) as JWTPayload & {
    cap?: ReadonlyArray<{ capability: string }>;
    act?: string;
  };
  return {
    subject: payload.sub ?? "",
    audience: typeof payload.aud === "string" ? payload.aud : (payload.aud?.[0] ?? ""),
    issuer: payload.iss ?? "",
    capabilities: (payload.cap ?? []).map((entry) => entry.capability),
    ...(payload.act === undefined ? {} : { actingSystem: payload.act }),
    issuedAt: payload.iat ?? 0,
    expiresAt: payload.exp ?? 0,
  };
}

/** The platform credential this server last earned as itself, in memory only. */
let heldPlatformCredential: string | undefined;

export function holdPlatformCredential(credential: string): void {
  heldPlatformCredential = credential;
}

export function platformCredentialClaims(): HeldClaims | null {
  return heldPlatformCredential ? claimsOf(heldPlatformCredential) : null;
}

/** The game-credential custody: one held scope at a time, renewed proactively. */
interface GameCustody {
  readonly scope: GameScope;
  readonly handle: CredentialHandle;
  lapse?: string;
}

let gameCustody: GameCustody | undefined;

/**
 * Redeem an assertion for this team's game credential: the assertion earns a
 * platform credential naming this server, and the game credential is issued
 * under it. Called afresh on every renewal, so renewal is a new exchange on
 * the strength of the registration — never a refresh of the old credential.
 *
 * spec: identity-and-authorization/token-lifetime-and-refresh#refresh-without-reauth
 */
async function redeemGameCredential(assertion: string, scope: GameScope): Promise<string> {
  const client = platformClient();
  const platformCredential: string = await client.action(api.issuance.exchangeAssertion, {
    assertion,
    capabilities: ["issue-game-credential"],
  });
  return await client.action(api.issuance.issueGameCredential, {
    credential: platformCredential,
    teamId: scope.teamId,
    gameId: scope.gameId,
  });
}

/**
 * Begin (or replace) custody of one team's credential for one game. The first
 * acquisition is performed here so its refusal is legible to the caller; the
 * handle then renews ahead of expiry until replaced.
 */
export async function beginGameCustody(identity: ServerIdentity, scope: GameScope): Promise<void> {
  // A first redemption outside the handle, so a refusal ("does not operate
  // team …", "game … is finished") reaches the caller legibly — the handle's
  // own first failure is deliberately quiet.
  await redeemGameCredential(await signAssertion(identity), scope);
  gameCustody?.handle.stop();
  const custody: GameCustody = {
    scope,
    handle: holdGameCredential(identity, scope, redeemGameCredential, (cause) => {
      custody.lapse = cause instanceof Error ? cause.message : String(cause);
    }),
  };
  gameCustody = custody;
  // The handle acquires on its own first tick, which is already in flight;
  // wait for it briefly so the caller sees custody actually held.
  const deadline = Date.now() + 10_000;
  while (custody.handle.credential() === undefined && Date.now() < deadline) {
    await new Promise((settle) => setTimeout(settle, 100));
  }
}

export function endGameCustody(): void {
  gameCustody?.handle.stop();
  gameCustody = undefined;
}

export interface GameCustodyStatus {
  readonly scope: GameScope;
  readonly claims: HeldClaims | null;
  readonly renewal: Renewal | null;
  readonly lapse?: string;
}

export function gameCustodyStatus(): GameCustodyStatus | null {
  if (!gameCustody) return null;
  const credential = gameCustody.handle.credential();
  const claims = credential ? claimsOf(credential) : null;
  return {
    scope: gameCustody.scope,
    claims,
    renewal: claims
      ? renewalAction(claims.issuedAt, claims.expiresAt - claims.issuedAt, Date.now() / 1000)
      : null,
    ...(gameCustody.lapse === undefined ? {} : { lapse: gameCustody.lapse }),
  };
}

/** The held game credential itself — for this server's own use, never a page's. */
export function heldGameCredential(): string | undefined {
  return gameCustody?.handle.credential();
}
