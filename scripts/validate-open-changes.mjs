#!/usr/bin/env node
// Strict OpenSpec validation of every OPEN change (pnpm spec:validate:changes).
//
// `pnpm spec:validate` covers only the binding specs/ corpus; a change's own
// artifacts and deltas are validated per change (`openspec validate <change>
// --strict`). With change trains — several per-capability changes open in
// one PR — that must run continuously for all of them as part of
// `pnpm spec:check`, not as a manual pre-archive step. With no open changes
// this is a no-op.
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const changesDir = join(root, "openspec", "changes");
const open = existsSync(changesDir)
  ? readdirSync(changesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "archive" && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort()
  : [];

if (open.length === 0) {
  console.log("Open-change validation passed (no open changes).");
  process.exit(0);
}
const failed = [];
for (const name of open) {
  try {
    execSync(`pnpm exec openspec validate ${JSON.stringify(name)} --strict`, {
      cwd: root,
      stdio: "inherit",
    });
  } catch {
    failed.push(name);
  }
}
if (failed.length > 0) {
  console.error(`Open-change validation FAILED for: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`Open-change validation passed (${open.length} open change(s)).`);
