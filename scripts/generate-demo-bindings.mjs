#!/usr/bin/env node
// Regenerate the demo game's client bindings — `pnpm demo:codegen`.
//
// `spacetime generate` writes the client's view of a published module: the
// connection builder, the query builders for its *public* tables, and its
// reducers. `--include-private` is deliberately not passed, so the seed tables
// and `admitted_connection` do not appear — a client has no business holding
// types for tables it cannot read.
//
// **Why the output is stamped `@ts-nocheck`.** The generated code does not
// typecheck under this workspace's settings — `exactOptionalPropertyTypes`
// rejects the optional properties SpacetimeDB's own type builders produce, in
// its own library types rather than in anything the generator wrote. The
// alternatives were to loosen the app's tsconfig, which would stop those
// settings protecting the app's *own* code, or to exclude the directory, which
// does not work because an imported file is checked regardless. Stamping the
// generated files is the narrowest of the three: it suppresses checking exactly
// where the generator owns the code, and it is reapplied here on every
// regeneration rather than being a hand edit somebody must remember.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const modulePath = "apps/demo-game";
const outDir = "apps/centaur-server-reference/src/lib/game/_generated";

execFileSync(
  "spacetime",
  ["generate", "--lang", "typescript", "-p", modulePath, "-o", outDir, "-y"],
  {
    cwd: repoRoot,
    stdio: "inherit",
  },
);

const STAMP = "// @ts-nocheck — generated; see scripts/generate-demo-bindings.mjs\n";

function stamp(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      stamp(path);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const source = readFileSync(path, "utf8");
    if (!source.startsWith(STAMP)) writeFileSync(path, STAMP + source);
  }
}

stamp(join(repoRoot, outDir));
console.log(`[demo:codegen] wrote and stamped ${outDir}`);
