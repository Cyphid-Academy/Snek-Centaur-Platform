#!/usr/bin/env node
// Boot an app and check it actually serves.
//
// The rest of the battery — lint, typecheck, unit and component tests,
// spec:check — never starts a server. Every one of them passed on a branch
// where `pnpm dev:tester` answered HTTP 500 on the first request, because the
// failure lived in wiring nothing imports: a workspace package resolved through
// its gitignored `dist/`, a route handler composing modules each of which was
// separately tested. This is the cheapest check that would have caught it, and
// it is deliberately shallow: it proves the app boots, renders, and answers its
// own API, and claims nothing about behaviour.
//
// Usage: node scripts/smoke-app.mjs [visual-tester|centaur-server-reference]
// (defaults to every app). Assumes the workspace packages are built — `pnpm
// smoke` does that first.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const APPS = {
  "visual-tester": {
    pkg: "@cyphid/visual-tester",
    port: 5191,
    // Paths that must answer, and what a healthy answer looks like.
    checks: [
      { path: "/", expect: (body) => body.includes("<!doctype html") || body.includes("<html") },
      { path: "/api/sequences", expect: (body) => Array.isArray(JSON.parse(body)) },
    ],
  },
  "centaur-server-reference": {
    pkg: "@cyphid/centaur-server-reference",
    port: 5192,
    checks: [
      { path: "/", expect: (body) => body.includes("<!doctype html") || body.includes("<html") },
    ],
  },
};

const READY_TIMEOUT_MS = 90_000;
// Vite reports a failed SSR module evaluation on stdout and still serves a 500
// page, so the log is part of the verdict, not just the status code.
const LOG_FAILURE = /Error when evaluating SSR module|Failed to resolve|\[500\]/;

async function smoke(name) {
  const app = APPS[name];
  if (!app) throw new Error(`unknown app ${name}; known: ${Object.keys(APPS).join(", ")}`);
  const base = `http://127.0.0.1:${app.port}`;
  const failures = [];
  let log = "";

  // `exec vite` rather than the app's `dev` script: the script's `predev`
  // rebuilds the workspace, which `pnpm smoke` has already done.
  const child = spawn(
    "pnpm",
    ["--filter", app.pkg, "exec", "vite", "dev", "--port", String(app.port), "--strictPort"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.on("data", (c) => {
    log += c;
  });
  child.stderr.on("data", (c) => {
    log += c;
  });

  try {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      if (child.exitCode !== null) throw new Error(`dev server exited early:\n${log}`);
      ready = await fetch(base).then(
        () => true,
        () => false,
      );
      if (!ready) await sleep(500);
    }
    if (!ready)
      throw new Error(`dev server never answered on ${base} within ${READY_TIMEOUT_MS}ms`);

    for (const check of app.checks) {
      const res = await fetch(base + check.path);
      const body = await res.text();
      if (!res.ok) {
        failures.push(`${check.path} -> HTTP ${res.status}\n${body.slice(0, 800)}`);
        continue;
      }
      let healthy = false;
      try {
        healthy = check.expect(body);
      } catch (err) {
        failures.push(`${check.path} -> 200 but unreadable: ${String(err)}`);
        continue;
      }
      if (!healthy)
        failures.push(`${check.path} -> 200 but the body is not what this route serves`);
    }
  } finally {
    child.kill("SIGTERM");
    await sleep(300);
    if (child.exitCode === null) child.kill("SIGKILL");
  }

  const logged = log.match(LOG_FAILURE);
  if (logged) {
    const line = log.split("\n").find((l) => LOG_FAILURE.test(l)) ?? logged[0];
    failures.push(`server logged a failure: ${line.trim()}`);
  }
  return failures;
}

const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : Object.keys(APPS);
let failed = false;
for (const name of names) {
  const failures = await smoke(name);
  if (failures.length === 0) {
    console.log(`smoke: ${name} boots and serves`);
  } else {
    failed = true;
    console.error(`smoke: ${name} FAILED`);
    for (const f of failures) console.error(`  - ${f}`);
  }
}
process.exit(failed ? 1 : 0);
