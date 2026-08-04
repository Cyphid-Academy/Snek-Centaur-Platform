#!/usr/bin/env node
// Capability-declaration totality for the Convex host (pnpm check:public-surface).
//
// spec: identity-and-authorization/capability-registry#unregistered-function-fails-the-build
//
// `publicQuery`/`publicMutation` make a declaration a *type* error to omit, but
// a type error is only reached by code that uses them: importing Convex's own
// `query`/`mutation` builds a public function that declares nothing and
// typechecks fine. This check closes that.
//
// Two rules, over `convex/` in the host package:
//   1. only `publicFunctions.ts` may import a function builder from
//      `_generated/server` or `convex/server` — those are the only ways a
//      public function can come into existence, so denying them everywhere
//      else means every public function passed through a declaration site;
//   2. an exported handler definition must be headed by a public builder,
//      which catches a hand-rolled registration that imported nothing.
// Internal builders (`internalQuery` and friends) are unrestricted: they are
// not publicly reachable, so no capability declares them.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "packages/convex-host/convex";
const BUILDERS_MODULE = "publicFunctions.ts";
const BUILDER_SOURCES = /(_generated\/server|^convex\/server)$/;
const BUILDERS = new Set(["query", "mutation", "action", "httpAction"]);
const PUBLIC_BUILDERS = new Set([
  "publicQuery",
  "publicMutation",
  "publicAction",
  "publicHttpAction",
]);
// Convex does not expose these to any caller, so no capability declares them
// and rule 2 has nothing to say about one — as the header above already claims.
// Named explicitly rather than matched on a prefix: `internalIshMutation` would
// otherwise buy an exemption by spelling.
const INTERNAL_BUILDERS = new Set(["internalQuery", "internalMutation", "internalAction"]);
// Deployed as their own entry points rather than as function modules, so the
// dot rule below does not reach them and they are named back in.
const CONFIG_ENTRY_POINTS = new Set(["convex.config.ts", "auth.config.ts"]);

// The files Convex actually deploys, which is the set these rules mean to
// cover: its bundler skips any function module whose filename contains more
// than one dot. That is what keeps the suites beside these functions
// (`*.test.ts`) and the harness they share (`harness.testing.ts`) out of the
// deployment, and out of scope here.
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === "_generated" ? [] : sources(path);
    if (!e.name.endsWith(".ts")) return [];
    return e.name.split(".").length === 2 || CONFIG_ENTRY_POINTS.has(e.name) ? [path] : [];
  });
}

const problems = [];
for (const path of sources(ROOT)) {
  if (path.endsWith(BUILDERS_MODULE)) continue;
  const text = readFileSync(path, "utf8");
  for (const [, names, from] of text.matchAll(/import\s*{([^}]*)}\s*from\s*"([^"]+)"/g)) {
    for (const name of names.split(",").map((n) => n.trim().replace(/^type\s+/, ""))) {
      if (BUILDER_SOURCES.test(from) && BUILDERS.has(name.split(/\s+as\s+/)[0])) {
        problems.push(
          `${path}: imports \`${name}\` from "${from}" — build it with ${BUILDERS_MODULE}`,
        );
      }
    }
  }
  // A namespace import evades both rules below at once: the named-import scan
  // above never sees the builder's name, and `server.query(...)` is not a
  // `(\w+)(` for rule 2 to match. Refused outright rather than parsed, because
  // the point of these rules is that the registry is complete by construction —
  // a spelling that slips past them is a public function reachable with no
  // capability check at all.
  for (const [, from] of text.matchAll(/import\s*\*\s*as\s+\w+\s*from\s*"([^"]+)"/g)) {
    if (BUILDER_SOURCES.test(from)) {
      problems.push(
        `${path}: imports all of "${from}" — name the builders you need, from ${BUILDERS_MODULE}`,
      );
    }
  }
  for (const match of text.matchAll(/export const (\w+)\s*=\s*(\w+)\(/g)) {
    const statement = text.slice(match.index).split("\nexport ")[0];
    if (
      statement.includes("handler:") &&
      !PUBLIC_BUILDERS.has(match[2]) &&
      !INTERNAL_BUILDERS.has(match[2])
    ) {
      problems.push(`${path}: \`${match[1]}\` defines a handler without a declared capability`);
    }
  }
}

// Anonymous reach is declared on the capability, and every capability that
// declares it must cite the scenario that says why it qualifies — the reason
// generalises ("exposes nothing principal-specific, or carries its own proof"),
// so a fourth entry needs a fourth scenario, which is a spec revision rather
// than a line of code. `pnpm spec:citations` already refuses a citation that
// does not resolve; what is added here is that the entry must carry one at all,
// and that two entries may not lean on the same justification.
// spec: identity-and-authorization/anonymous-reach
const registry = readFileSync(join(ROOT, "capabilities.ts"), "utf8");
const justifications = new Map();
for (const [, cited, name] of registry.matchAll(
  /\/\/ spec: identity-and-authorization\/anonymous-reach#([\w-]+)\s*\n\s*"([\w-]+)":/g,
)) {
  if (justifications.has(cited)) {
    problems.push(
      `capabilities.ts: \`${name}\` and \`${justifications.get(cited)}\` both cite #${cited}`,
    );
  }
  justifications.set(cited, name);
}
for (const [, name] of registry.matchAll(/"([\w-]+)":\s*{[^}]*\banonymous:\s*true/gs)) {
  if (![...justifications.values()].includes(name)) {
    problems.push(`capabilities.ts: \`${name}\` declares anonymous reach without citing why`);
  }
}

if (problems.length > 0) {
  console.error(`Public functions with no declared capability:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
