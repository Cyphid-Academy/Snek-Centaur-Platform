// The standalone mount is a development affordance and answers 404 anywhere
// else — a fork that builds this app for production does not serve a
// configuration surface wired to a deployment, and the guard is the build's
// rather than a reviewer's memory. Nothing this route needs is reachable in a
// production build: the page is the only importer of the handoff helper it uses.
//
// What the page needs of its environment is the same pair every client of the
// platform needs, read here and reported rather than required: a dev server that
// 500s over an unset variable makes local setup worse than a page that says
// which variable to set.
// spec: global-invariants/no-shared-secrets
//
// `process.env` rather than `$env/dynamic/private`, as `hooks.server.ts` and the
// sign-in page read it: this app's tsconfig excludes `.svelte-kit`, where the
// ambient declaration for that module lives.
import { dev } from "$app/environment";
import { CONVEX_CLIENT_ENV, describeMissing, missingEnv } from "@cyphid/snek-convex-host";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The two of the client contract this page actually reaches for. */
const NEEDED = ["CONVEX_URL", "CONVEX_SITE_URL"];

export const load: PageServerLoad = ({ url }) => {
  if (!dev) error(404, "not found");
  const serverOrigin = process.env["SNEK_SERVER_ORIGIN"] ?? url.origin;
  const missing = missingEnv(CONVEX_CLIENT_ENV.filter((req) => NEEDED.includes(req.name)));
  return {
    platform: {
      convexUrl: process.env["CONVEX_URL"] ?? "",
      convexSiteUrl: process.env["CONVEX_SITE_URL"] ?? "",
      issuerId: serverOrigin,
      returnAddress: `${serverOrigin}/dev/game-configuration`,
    },
    /** Empty when the environment names both — the page mounts only then. */
    unconfigured: missing.length === 0 ? "" : describeMissing(missing),
  };
};
