#!/usr/bin/env node
// The identity demo stack: the platform's three runtimes on one machine, wired
// for a browser — `pnpm demo`.
//
// What comes up, in order: the self-hosted Convex backend (the deployment),
// with the host's functions pushed and its environment set; the SpacetimeDB
// host, with the real game module published; the reference app on port 5000.
// Then the documented operator acts run against the deployment: the app is
// registered as a trusted issuer, and the demo world is seeded
// (`registrySeeding.ts` — an operator stand-in until the owning changes land).
//
// Sign-in is the real Google flow. The deployment needs GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET (and ideally BETTER_AUTH_SECRET) in this process's
// environment — on Replit, set them as Secrets — and the Google OAuth client
// must list the callback address this script prints as an authorized redirect
// URI.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  PORTS,
  adminKey,
  backendBinary,
  betterAuthSecret,
  convexCli,
  convexRun,
  demoDir,
  instanceSecret,
  origins,
  ready,
  repoRoot,
  seedWorld,
  startChild,
  stopChild,
  worldFile,
} from "./lib.mjs";

const where = origins();
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
console.log(`
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

// ------------------------------------------------------------------- convex
const binary = await backendBinary();
const convexData = join(demoDir, "convex");
mkdirSync(join(convexData, "storage"), { recursive: true });
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

const key = adminKey(binary);
console.log("[demo] pushing functions…");
convexCli(["dev", "--once", "--typecheck", "disable", "--codegen", "disable"], key);
convexCli(["env", "set", "SITE_URL", where.appOrigin], key, { quiet: true });
convexCli(["env", "set", "BETTER_AUTH_SECRET", betterAuthSecret()], key, { quiet: true });
if (googleConfigured) {
  convexCli(["env", "set", "GOOGLE_CLIENT_ID", process.env["GOOGLE_CLIENT_ID"]], key, {
    quiet: true,
  });
  convexCli(["env", "set", "GOOGLE_CLIENT_SECRET", process.env["GOOGLE_CLIENT_SECRET"]], key, {
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
console.log("[demo] publishing game module…");
try {
  execFileSync(
    "spacetime",
    [
      "publish",
      "--server",
      `http://127.0.0.1:${PORTS.stdb}`,
      "--yes",
      "-p",
      "packages/stdb/spacetimedb",
      "snek-local",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
} catch {
  console.log("[demo] publish failed — attempting a server-issued login and retrying…");
  execFileSync("spacetime", ["login", "--server-issued-login", `http://127.0.0.1:${PORTS.stdb}`], {
    stdio: "inherit",
  });
  execFileSync(
    "spacetime",
    [
      "publish",
      "--server",
      `http://127.0.0.1:${PORTS.stdb}`,
      "--yes",
      "-p",
      "packages/stdb/spacetimedb",
      "snek-local",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
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
    returnAddresses: [`${where.appOrigin}/sign-in`, `${where.appOrigin}/console`],
  },
  key,
);
console.log("[demo] seeding the demo world…");
seedWorld(key, where.appOrigin);

// ---------------------------------------------------------------------- app
children.push(
  startChild("app", "pnpm", ["--filter", "@cyphid/centaur-server-reference", "dev"], {
    env: {
      CONVEX_URL: where.convexUrl,
      CONVEX_SITE_URL: where.convexSiteUrl,
      SNEK_STDB_URL: where.stdbUrl,
      SNEK_STDB_URL_INTERNAL: `http://127.0.0.1:${PORTS.stdb}`,
      SNEK_STDB_DATABASE: "snek-local",
      SNEK_WORLD_FILE: worldFile,
      SNEK_SERVER_DATA_DIR: join(demoDir, "server"),
    },
  }),
);
await ready(`http://127.0.0.1:${PORTS.app}/.well-known/snek-healthcheck`, 180_000);

console.log(`
[demo] up. Open ${where.appOrigin}/console — in a real browser tab, not the
[demo] preview iframe: Google refuses to sign anyone in inside an iframe.
[demo] After signing in, the console shows the seeding command that puts you
[demo] on a team's roster: pnpm demo:seed --member=<your user id>
`);
