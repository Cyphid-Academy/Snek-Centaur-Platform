#!/usr/bin/env node
// Strict OpenSpec validation of every OPEN change (pnpm spec:validate:changes).
//
// `pnpm spec:validate` covers only the binding specs/ corpus; a change's own
// artifacts and deltas are validated per change (`openspec validate <change>
// --strict`). With change trains — several per-capability changes open in
// one PR — that must run continuously for all of them as part of
// `pnpm spec:check`, not as a manual pre-archive step. With no open changes
// this is a no-op.
//
// The validations are independent, so they run concurrently against the
// resolved CLI binary rather than serially through `pnpm exec`. That matters
// out of proportion to how dull it sounds: the work per change is small and
// process startup dominates it, so the serial-through-pnpm shape spent ~20s of
// a ~25s `pnpm spec:check` on startup alone. `spec:check` runs once per commit
// when a branch's history is rebuilt and verified, which is where that stopped
// being a detail and became the cost of the exercise.
//
// Output is captured per change and printed only for failures: concurrent
// children would otherwise interleave their diagnostics into an unreadable
// stream, and a change that passes has nothing to say.
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const changesDir = join(root, "openspec", "changes");
const all = existsSync(changesDir)
  ? readdirSync(changesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "archive" && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort()
  : [];

// `--change <name>` (repeatable) narrows to the named changes. The per-commit
// gate (scripts/check-commit.mjs) derives that set from a commit's own diff:
// this work is ~160ms per change, so validating all of them at every commit
// spends most of its time on changes the commit did not touch. Unnamed, or
// with no `--change` at all, the full open set runs — which is what
// `pnpm spec:check` wants.
const requested = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--change") requested.push(process.argv[++i]);
}
const unknown = requested.filter((n) => !all.includes(n));
if (unknown.length > 0) {
  console.error(`Unknown open change(s): ${unknown.join(", ")}`);
  process.exit(1);
}
const open = requested.length > 0 ? [...new Set(requested)].sort() : all;

if (open.length === 0) {
  console.log("Open-change validation passed (no open changes).");
  process.exit(0);
}

// Prefer the resolved binary; fall back to `pnpm exec` where it is absent, so
// the check still runs in an environment that has not linked the workspace.
const bin = join(root, "node_modules", ".bin", "openspec");
const [cmd, lead] = existsSync(bin) ? [bin, []] : ["pnpm", ["exec", "openspec"]];

const validate = async (name) => {
  try {
    await run(cmd, [...lead, "validate", name, "--strict"], { cwd: root });
    return null;
  } catch (e) {
    return { name, output: `${e.stdout ?? ""}${e.stderr ?? ""}`.trimEnd() };
  }
};

const queue = [...open];
const failed = [];
const workers = Array.from({ length: Math.min(availableParallelism(), queue.length) }, async () => {
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    const failure = await validate(name);
    if (failure) failed.push(failure);
  }
});
await Promise.all(workers);

if (failed.length > 0) {
  failed.sort((a, b) => a.name.localeCompare(b.name));
  for (const { name, output } of failed) {
    console.error(`--- ${name}`);
    if (output) console.error(output);
  }
  console.error(`Open-change validation FAILED for: ${failed.map((f) => f.name).join(", ")}`);
  process.exit(1);
}
console.log(`Open-change validation passed (${open.length} open change(s)).`);
