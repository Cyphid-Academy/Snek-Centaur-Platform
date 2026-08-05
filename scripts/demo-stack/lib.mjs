// Shared plumbing for the identity demo stack (`pnpm demo`, `pnpm demo:seed`).
//
// Everything here is environment tooling, not platform behaviour: it stands the
// three runtimes up on one machine — the self-hosted Convex backend the
// end-to-end harness already drives, a SpacetimeDB host, and the reference app
// — and performs the documented operator acts (`convex run` with the
// deployment's admin key) against them. On Replit the browser-facing origins
// are the repl's external port addresses; anywhere else they are loopback.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const repoRoot = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

/** Everything the stack persists between runs, gitignored. */
export const demoDir = join(repoRoot, ".demo");

/** Fixed local ports. The .replit port map exposes them externally. */
export const PORTS = {
  convex: 3210,
  convexSite: 3211,
  stdb: 3000,
  app: 5000,
};

/** External port each local port is published on by .replit's port map. */
const REPLIT_EXTERNAL = { convex: 3002, convexSite: 3003, stdb: 3001, app: 80 };

/**
 * Which Convex the demo targets.
 *
 * A `CONVEX_DEPLOY_KEY` in the environment (on Replit: a Secret) selects the
 * **hosted** deployment it belongs to — the repo's own provisioning strategy,
 * a personal least-privilege dev deployment — and the stack then runs no
 * backend of its own. Without one, the stack runs the pinned self-hosted
 * backend locally. `SNEK_DEMO_CONVEX=local` forces local even when a key is
 * set.
 */
export function platformTarget() {
  const deployKey = process.env["CONVEX_DEPLOY_KEY"];
  if (!deployKey || process.env["SNEK_DEMO_CONVEX"] === "local") return { kind: "local" };
  // A deployment-scoped key is `dev:<name>|…` (or `prod:<name>|…`); the name
  // pins the deployment's addresses. A key shaped any other way still drives
  // the CLI, but the addresses then come from what the push writes back —
  // see `capturedDeploymentUrl`.
  const named = /^(?:dev|prod):([a-z0-9-]+)\|/.exec(deployKey);
  const url = named ? `https://${named[1]}.convex.cloud` : undefined;
  return {
    kind: "hosted",
    deployKey,
    ...(url ? { convexUrl: url, siteUrl: url.replace(".convex.cloud", ".convex.site") } : {}),
  };
}

/**
 * The origins browsers and tokens use. On Replit these must be the external
 * addresses: the deployment's own origin is its token issuer (`iss`), Better
 * Auth's base URL, and the base of Google's redirect URI — none of which a
 * browser or Google can reach at loopback. A hosted deployment brings its own
 * two addresses, stable and TLS-terminated, whatever the machine.
 */
export function origins(target = platformTarget()) {
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  const at = (port) => (port === 80 ? `https://${domain}` : `https://${domain}:${port}`);
  const local = {
    stdbUrl: domain ? at(REPLIT_EXTERNAL.stdb) : `http://127.0.0.1:${PORTS.stdb}`,
    appOrigin: domain ? at(REPLIT_EXTERNAL.app) : `http://127.0.0.1:${PORTS.app}`,
  };
  if (target.kind === "hosted") {
    const convexUrl = target.convexUrl ?? capturedDeploymentUrl();
    if (!convexUrl) {
      throw new Error(
        "the deploy key names no deployment and no push has recorded one yet — run `pnpm demo` first",
      );
    }
    return {
      ...local,
      convexUrl,
      convexSiteUrl: convexUrl.replace(".convex.cloud", ".convex.site"),
    };
  }
  return {
    ...local,
    convexUrl: domain ? at(REPLIT_EXTERNAL.convex) : `http://127.0.0.1:${PORTS.convex}`,
    convexSiteUrl: domain ? at(REPLIT_EXTERNAL.convexSite) : `http://127.0.0.1:${PORTS.convexSite}`,
  };
}

/** A value persisted across runs, generated on first use. */
export function persisted(name, generate) {
  const path = join(demoDir, name);
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  const value = generate();
  mkdirSync(demoDir, { recursive: true });
  writeFileSync(path, value, { mode: 0o600 });
  return value;
}

export const instanceSecret = () =>
  persisted("instance-secret", () => randomBytes(32).toString("hex"));

export const betterAuthSecret = () =>
  process.env["BETTER_AUTH_SECRET"] ??
  persisted("better-auth-secret", () => randomBytes(32).toString("hex"));

/**
 * The pinned Convex backend binary, shared with the end-to-end harness's cache
 * (`apps/e2e/src/runtimes/convex.ts` holds the pin's rationale). Downloaded on
 * first use here, because this script is a bootstrap rather than a harness.
 */
const BACKEND_VERSION = "precompiled-2026-07-21-82d5e9f";

export async function backendBinary() {
  const dir = join(homedir(), ".cache", "convex", "binaries", BACKEND_VERSION);
  const binary = join(dir, "convex-local-backend");
  if (existsSync(binary)) return binary;

  const target =
    process.platform === "darwin"
      ? process.arch === "arm64"
        ? "aarch64-apple-darwin"
        : "x86_64-apple-darwin"
      : process.arch === "arm64"
        ? "aarch64-unknown-linux-gnu"
        : "x86_64-unknown-linux-gnu";
  const url = `https://github.com/get-convex/convex-backend/releases/download/${BACKEND_VERSION}/convex-local-backend-${target}.zip`;
  console.log(`[demo] fetching Convex backend ${BACKEND_VERSION}…`);
  mkdirSync(dir, { recursive: true });
  const zip = join(dir, "backend.zip");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`backend download failed: ${response.status} ${url}`);
  writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
  execFileSync("unzip", ["-oq", "backend.zip"], { cwd: dir });
  rmSync(zip);
  execFileSync("chmod", ["+x", binary]);
  return binary;
}

export function adminKey(binary) {
  return execFileSync(binary, [
    "keygen",
    "admin-key",
    "--instance-name",
    "snek-demo",
    "--instance-secret",
    instanceSecret(),
  ])
    .toString()
    .trim();
}

/**
 * Where the last hosted push recorded its deployment, for keys that do not
 * name one themselves. The CLI writes the deployment it targeted to
 * `packages/convex-host/.env.local`; `convexCli` captures the value before
 * restoring that file and persists it under `.demo/`.
 */
export function capturedDeploymentUrl() {
  const path = join(demoDir, "deployment-url");
  return existsSync(path) ? readFileSync(path, "utf8").trim() : undefined;
}

/**
 * Run the Convex CLI against the demo's deployment — hosted, via the deploy
 * key in `auth`, or the local self-hosted backend, via its admin key. Either
 * way the CLI writes the deployment it targeted back to
 * `packages/convex-host/.env.local` — a developer's own file, snapshotted and
 * restored around every invocation (the end-to-end harness does the same).
 */
export function convexCli(args, auth, opts = {}) {
  mkdirSync(demoDir, { recursive: true });
  const hosted = typeof auth === "object" && auth !== null && auth.kind === "hosted";
  const envFile = join(demoDir, "convex.env");
  writeFileSync(
    envFile,
    hosted
      ? `CONVEX_DEPLOY_KEY=${auth.deployKey}\n`
      : `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:${PORTS.convex}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${auth}\n`,
  );
  const envLocal = join(repoRoot, "packages/convex-host/.env.local");
  const before = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : undefined;
  try {
    // Stdin closed always: the CLI must fail on any prompt rather than wait
    // forever on input nothing will send.
    return execFileSync(
      "pnpm",
      ["--filter", "@cyphid/snek-convex-host", "exec", "convex", ...args, "--env-file", envFile],
      {
        cwd: repoRoot,
        maxBuffer: 16 * 1024 * 1024,
        stdio: opts.quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
      },
    )
      ?.toString()
      .trim();
  } finally {
    if (hosted && existsSync(envLocal)) {
      const url = /^CONVEX_URL=(.+)$/m.exec(readFileSync(envLocal, "utf8"))?.[1]?.trim();
      if (url) writeFileSync(join(demoDir, "deployment-url"), url);
    }
    if (before === undefined) rmSync(envLocal, { force: true });
    else writeFileSync(envLocal, before);
  }
}

/** `convex run` returning the function's parsed answer. */
export function convexRun(functionName, args, auth) {
  const printed = convexCli(["run", functionName, JSON.stringify(args ?? {})], auth, {
    quiet: true,
  });
  return printed === "" || printed === undefined ? undefined : JSON.parse(printed);
}

/** One deployment environment variable's value, or `undefined` where unset. */
export function convexEnvGet(name, auth) {
  try {
    const printed = convexCli(["env", "get", name], auth, { quiet: true });
    return printed === "" || printed === undefined ? undefined : printed;
  } catch {
    return undefined;
  }
}

/** Spawn a long-running child in its own process group, logging through a prefix. */
export function startChild(name, command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: opts.cwd ?? repoRoot,
    env: { ...process.env, ...opts.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const relay = (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim() !== "") console.log(`[${name}] ${line}`);
    }
  };
  child.stdout.on("data", relay);
  child.stderr.on("data", relay);
  child.on("exit", (code) => console.log(`[${name}] exited (${code})`));
  return child;
}

export function stopChild(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

/** Poll an HTTP address until it answers, or throw after `timeoutMs`. */
export async function ready(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) throw new Error(`nothing answered at ${url}`);
    await new Promise((settle) => setTimeout(settle, 500));
  }
}

/** The seeded world's record, beside the rest of the demo state. */
export const worldFile = join(demoDir, "world.json");

export function readWorld() {
  try {
    return JSON.parse(readFileSync(worldFile, "utf8"));
  } catch {
    return null;
  }
}

export function writeWorld(world) {
  mkdirSync(demoDir, { recursive: true });
  writeFileSync(worldFile, JSON.stringify(world, null, 2));
}

/**
 * Seed (or re-seed) the demo world: two teams, a playing game and a finished
 * one, with the given humans on team Alpha's roster. Ids are stable across
 * runs — previously seeded records are rewritten in place.
 */
export function seedWorld(auth, appOrigin, { member, coach, admin } = {}) {
  const existing = readWorld();
  const stillThere =
    existing &&
    convexRun(
      "registrySeeding:seededWorld",
      {
        teamIds: existing.teams.map((team) => team.teamId),
        gameIds: existing.games.map((game) => game.gameId),
      },
      auth,
    );
  const previous = stillThere ? existing : { teams: [], games: [], admins: [] };
  const teamId = (label) => previous.teams.find((team) => team.label === label)?.teamId;
  const gameId = (label) => previous.games.find((game) => game.label === label)?.gameId;

  const alpha = convexRun(
    "registrySeeding:seedTeam",
    { ...(teamId("Alpha") ? { teamId: teamId("Alpha") } : {}), serverDomain: appOrigin },
    auth,
  );
  const beta = convexRun(
    "registrySeeding:seedTeam",
    { ...(teamId("Beta") ? { teamId: teamId("Beta") } : {}), serverDomain: null },
    auth,
  );

  const roster = [
    {
      teamId: alpha,
      memberUserIds: member ? [member] : [],
      coachUserIds: coach ? [coach] : [],
    },
    { teamId: beta, memberUserIds: [], coachUserIds: [] },
  ];
  const playing = convexRun(
    "registrySeeding:seedGame",
    {
      ...(gameId("Demo match") ? { gameId: gameId("Demo match") } : {}),
      status: "playing",
      roster,
    },
    auth,
  );
  const finished = convexRun(
    "registrySeeding:seedGame",
    {
      ...(gameId("Finished match") ? { gameId: gameId("Finished match") } : {}),
      status: "finished",
      roster,
    },
    auth,
  );

  const admins = new Set(previous.admins ?? []);
  if (admin) {
    convexRun("registry:designateAdmin", { userId: admin, designated: true }, auth);
    admins.add(admin);
  }

  const world = {
    teams: [
      { label: "Alpha", teamId: alpha, serverDomain: appOrigin },
      { label: "Beta", teamId: beta, serverDomain: null },
    ],
    games: [
      { label: "Demo match", gameId: playing, status: "playing" },
      { label: "Finished match", gameId: finished, status: "finished" },
    ],
    admins: [...admins],
  };
  writeWorld(world);
  return world;
}
