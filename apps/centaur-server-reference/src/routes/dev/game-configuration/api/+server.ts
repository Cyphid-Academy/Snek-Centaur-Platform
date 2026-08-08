// The dev mount's platform side: read the game record, write to it.
//
// spec: game-configuration/self-contained-configuration-surface#runs-with-no-host
// Three calls, no authentication, no deployment. They exist so the surface can
// be exercised end to end before there is a host to mount it in; the live
// binding against the real Convex deployment answers the same three shapes with
// the same document, and the component cannot tell which one it is reading.
//
// Dev only, and enforced rather than intended: a production build answers 404
// here, so a fork that ships this app does not ship an unauthenticated
// configuration write.
import { dev } from "$app/environment";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { readRecord, resetRecord, setPreviewLock, updateConfiguration } from "./record";

function devOnly(): void {
  if (!dev) error(404, "not found");
}

export const GET: RequestHandler = () => {
  devOnly();
  return json(readRecord());
};

export const POST: RequestHandler = async ({ request }) => {
  devOnly();
  const body: unknown = await request.json();
  if (typeof body !== "object" || body === null || !("action" in body)) {
    error(400, "an action is required");
  }
  const action = (body as { action: unknown }).action;

  if (action === "updateConfiguration") {
    const { generation, runtime } = body as { generation?: unknown; runtime?: unknown };
    // Only the halves the caller actually sent: carrying the generation subtree
    // is what tells the record that what a board is generated from has changed.
    // spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
    const rejection = updateConfiguration({
      ...(generation === undefined ? {} : { generation }),
      ...(runtime === undefined ? {} : { runtime }),
    });
    // A rejection is an answer, not a transport failure: it names the parameters
    // that failed so the caller can point at them.
    // spec: global-invariants/client-truthfulness#rejections-reach-the-user
    if (rejection !== null) return json(rejection, { status: 422 });
    return json(readRecord());
  }

  if (action === "setPreviewLock") {
    const { locked } = body as { locked?: unknown };
    if (typeof locked !== "boolean") error(400, "locked must be a boolean");
    setPreviewLock(locked);
    return json(readRecord());
  }

  // Start over from an untouched record — what a suite needs and a live
  // deployment has no counterpart for, which is why it is only here.
  if (action === "reset") {
    resetRecord();
    return json(readRecord());
  }

  error(400, `unknown action ${String(action)}`);
};
