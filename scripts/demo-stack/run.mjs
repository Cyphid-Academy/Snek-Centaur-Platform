#!/usr/bin/env node
// The identity demo stack — `pnpm demo`.
//
// What comes up, in order: the Convex deployment — **hosted**, when a
// `CONVEX_DEPLOY_KEY` is in the environment (the repo's provisioning strategy:
// a personal dev deployment), or the pinned self-hosted backend locally when
// not — with the host's functions pushed and its environment set; the
// SpacetimeDB host, with both game modules published; the reference app on
// port 5000. Then the documented operator acts run against the deployment:
// the app is registered as a trusted issuer, and the demo world — two teams and
// one game being played — is seeded into the platform and into the game
// instance (`registrySeeding.ts` and `seed_game`, operator stand-ins until the
// changes that own those writers land).
//
// The demo itself is `/play`: sign in, get seated on a team, race the counter.
//
// Sign-in is the real Google flow. The deployment needs GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET (and ideally BETTER_AUTH_SECRET) in this process's
// environment — on Replit, set them as Secrets — and the Google OAuth client
// must list the callback address this script prints as an authorized redirect
// URI. With a hosted deployment that address is stable across restarts.
//
// One hosted-mode caveat: the deployment verifies this server's assertions
// against the keys published at the app's own origin, fetched from Convex's
// cloud — so the app origin must be publicly reachable (a running Replit
// workspace is; a laptop's loopback is not, and there the service-principal
// panels refuse while everything driven by the browser still works).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  DEMO_DATABASE,
  PORTS,
  adminKey,
  backendBinary,
  betterAuthSecret,
  convexCli,
  convexEnvGet,
  convexRun,
  demoDir,
  instanceSecret,
  origins,
  platformTarget,
  readWorld,
  ready,
  repoRoot,
  seedInstance,
  seedWorld,
  startChild,
  stopChild,
  worldFile,
} from "./lib.mjs";

const target = platformTarget();
const children = [];
const stopAll = () => {
  for (const child of children.reverse()) stopChild(child);
};
process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

// ---------------------------------------------------------------- preflight
if (!existsSync(join(repoRoot, "node_modules"))) {
  console.log("[demo] installing dependencies…");
  execFileSync("pnpm", ["install"], { cwd: repoRoot, stdio: "inherit" });
}

const googleConfigured = Boolean(
  process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"],
);

// ------------------------------------------------------------------- convex
let auth;
if (target.kind === "hosted") {
  console.log("[demo] using the hosted Convex deployment the deploy key names…");
  auth = target;
  // A prod-scoped key deploys; a dev key pushes exactly as `pnpm dev:convex`
  // would. Either way this validates the key before anything else starts.
  const push = target.deployKey.startsWith("prod:")
    ? ["deploy", "--yes", "--typecheck", "disable", "--codegen", "disable"]
    : ["dev", "--once", "--typecheck", "disable", "--codegen", "disable"];
  console.log("[demo] pushing functions…");
  try {
    convexCli(push, auth);
  } catch (failed) {
    console.error(`
[demo] !! The push to the hosted deployment failed. If the error above says
[demo] !! "Schema validation failed", the deployment holds documents written
[demo] !! under an older schema; this branch's schema cannot deploy over them.
[demo] !! Either clear the conflicting tables in the Convex dashboard, or use
[demo] !! a fresh dev deployment's key, or unset CONVEX_DEPLOY_KEY (or set
[demo] !! SNEK_DEMO_CONVEX=local) to run the local backend instead.`);
    throw failed;
  }
} else {
  const binary = await backendBinary();
  const convexData = join(demoDir, "convex");
  mkdirSync(join(convexData, "storage"), { recursive: true });
  const where = origins(target);
  children.push(
    startChild("convex", binary, [
      "--port",
      String(PORTS.convex),
      "--site-proxy-port",
      String(PORTS.convexSite),
      "--instance-name",
      "snek-demo",
      "--instance-secret",
      instanceSecret(),
      "--convex-origin",
      where.convexUrl,
      "--convex-site",
      where.convexSiteUrl,
      "--local-storage",
      join(convexData, "storage"),
      "--disable-beacon",
      join(convexData, "convex.sqlite3"),
    ]),
  );
  await ready(`http://127.0.0.1:${PORTS.convex}/version`);
  auth = adminKey(binary);
  console.log("[demo] pushing functions…");
  convexCli(["dev", "--once", "--typecheck", "disable", "--codegen", "disable"], auth);
}

// The push above is what records a keyless deployment's address, so the
// origins are final only from here on.
const where = origins(target);
console.log(`
[demo] convex           ${target.kind} (${where.convexUrl})
[demo] platform origin  ${where.convexSiteUrl}
[demo] app origin       ${where.appOrigin}
[demo] game instance    ${where.stdbUrl}
[demo] Google callback  ${where.convexSiteUrl}/api/auth/callback/google
${
  googleConfigured
    ? "[demo] Google client configured from the environment."
    : `[demo] !! GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set — sign-in will fail
[demo] !! at Google until they are. Set them (Replit: Secrets) and add the
[demo] !! callback address above to the Google client's authorized redirect URIs.`
}`);

convexCli(["env", "set", "SITE_URL", where.appOrigin], auth, { quiet: true });
// Never replaced once the deployment holds one: the signing-key store is
// encrypted under it, so overwriting an existing secret would discard the
// deployment's keys (and every session and credential they back).
if (convexEnvGet("BETTER_AUTH_SECRET", auth) === undefined) {
  convexCli(["env", "set", "BETTER_AUTH_SECRET", betterAuthSecret()], auth, { quiet: true });
}
if (googleConfigured) {
  convexCli(["env", "set", "GOOGLE_CLIENT_ID", process.env["GOOGLE_CLIENT_ID"]], auth, {
    quiet: true,
  });
  convexCli(["env", "set", "GOOGLE_CLIENT_SECRET", process.env["GOOGLE_CLIENT_SECRET"]], auth, {
    quiet: true,
  });
}

// -------------------------------------------------------------- spacetimedb
const stdbData = join(demoDir, "stdb");
mkdirSync(stdbData, { recursive: true });
children.push(
  startChild("stdb", "spacetime", [
    "start",
    "--data-dir",
    stdbData,
    "--listen-addr",
    `127.0.0.1:${PORTS.stdb}`,
    "--non-interactive",
  ]),
);
await ready(`http://127.0.0.1:${PORTS.stdb}/v1/ping`);
// Two modules, and both are the point. `snek-local` is the platform's own game
// instance, published exactly as it ships — it admits nobody until
// migrate-game-lifecycle lands `initialize_game`, and publishing it every run
// keeps that shipped module continuously proven buildable. `snek-demo-game` is
// the demo's playable instance: the same admission code, plus the seeding and
// gameplay reducers the real module is still waiting on.
const publish = (path, name) =>
  execFileSync(
    "spacetime",
    ["publish", "--server", `http://127.0.0.1:${PORTS.stdb}`, "--yes", "-p", path, name],
    { cwd: repoRoot, stdio: "inherit" },
  );
const publishBoth = () => {
  console.log("[demo] publishing the platform's game module…");
  publish("packages/stdb/spacetimedb", "snek-local");
  console.log("[demo] publishing the demo's game module…");
  publish("apps/demo-game", DEMO_DATABASE);
};
try {
  publishBoth();
} catch {
  console.log("[demo] publish failed — attempting a server-issued login and retrying…");
  execFileSync("spacetime", ["login", "--server-issued-login", `http://127.0.0.1:${PORTS.stdb}`], {
    stdio: "inherit",
  });
  publishBoth();
}

// ------------------------------------------------- operator acts: registry
console.log("[demo] registering this app as a trusted issuer…");
convexRun(
  "registry:registerIssuer",
  {
    issuerId: where.appOrigin,
    verificationMaterialUrl: `${where.appOrigin}/.well-known/snek-server-keys`,
    capabilityCeiling: [
      "read-platform-status",
      "issue-game-credential",
      "issue-game-token",
      "review-attributed-actions",
    ],
    returnAddresses: [`${where.appOrigin}/sign-in`, `${where.appOrigin}/play`],
  },
  auth,
);
if (target.kind === "hosted" && where.appOrigin.startsWith("http://127.0.0.1")) {
  console.log(
    "[demo] !! hosted deployment + loopback app: the deployment cannot fetch this",
    "\n[demo] !! app's published keys, so the service-principal panels will refuse.",
  );
}
console.log("[demo] seeding the demo world…");
// Players seated in an earlier run keep their teams: the world is re-seeded as
// it stands rather than emptied, so restarting the stack does not evict anyone.
const previous = readWorld();
const world = seedWorld(auth, where.appOrigin, {
  players: previous?.players ?? [],
  admins: previous?.admins ?? [],
});
seedInstance(world, target);

// ---------------------------------------------------------------------- app
children.push(
  startChild("app", "pnpm", ["--filter", "@cyphid/centaur-server-reference", "dev"], {
    env: {
      CONVEX_URL: where.convexUrl,
      CONVEX_SITE_URL: where.convexSiteUrl,
      SNEK_STDB_URL: where.stdbUrl,
      SNEK_STDB_URL_INTERNAL: `http://127.0.0.1:${PORTS.stdb}`,
      SNEK_STDB_DATABASE: DEMO_DATABASE,
      SNEK_WORLD_FILE: worldFile,
      SNEK_SERVER_DATA_DIR: join(demoDir, "server"),
      // Where the app finds the seating script it shells. Its absence is what
      // makes the play page's seating surface answer "no demo stack here",
      // which is the state a team's fork of this app runs in.
      SNEK_REPO_ROOT: repoRoot,
    },
  }),
);
await ready(`http://127.0.0.1:${PORTS.app}/.well-known/snek-healthcheck`, 180_000);

console.log(`
[demo] up. Open ${where.appOrigin}/play — in a real browser tab, not the
[demo] preview iframe: Google refuses to sign anyone in inside an iframe.
[demo] Signing in seats you on a team; open a second browser (or a private
[demo] window) as another person and race them.
`);
