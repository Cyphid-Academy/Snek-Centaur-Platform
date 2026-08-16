// GET/POST /dev/game-config — the fetch surface the standalone
// /dev/game-config page polls and posts mutations to. Dev-only: not part of
// the enumerated fork-compatibility surface under `/.well-known/snek-`
// (apps/centaur-server-reference/AGENTS.md), and not spec'd itself — it
// exists to back the spec'd component (`GameConfigSurface`) with the pure
// state machine the platform will eventually wire through Convex.
// spec: game-configuration/self-contained-configuration-surface
import type { RequestHandler } from "@sveltejs/kit";
import { currentState, editBoardLock, editConfig, editRoster } from "./harness.js";

export const GET: RequestHandler = () => {
  return Response.json(currentState());
};

type MutationRequest =
  | { readonly op: "updateConfig"; readonly config: Parameters<typeof editConfig>[0] }
  | { readonly op: "updateRoster"; readonly teams: Parameters<typeof editRoster>[0] }
  | { readonly op: "setBoardLock"; readonly locked: boolean };

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as MutationRequest;
  const rejection =
    body.op === "updateConfig"
      ? editConfig(body.config)
      : body.op === "updateRoster"
        ? editRoster(body.teams)
        : editBoardLock(body.locked);
  return Response.json({ rejection });
};
