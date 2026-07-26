#!/usr/bin/env node
// Run the per-module migration audit over every legacy module (pnpm spec:audit).
//
// The audit is the ONLY check that verifies the identifier map is COMPLETE
// against the legacy corpus: every id defined in (or cited by) a module file
// has an entry, every entry's homes resolve, and an id carried nowhere gives a
// reason. Without it, deleting a map entry would go unnoticed — the citation
// lint validates the entries that exist, not the ones that should. It ran
// per-module by hand during the migration; now that the corpus is retired and
// the map is the sole bridge to it, completeness is a standing invariant and
// belongs in `pnpm spec:check`.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const specDir = join(root, "legacy-spec-archive", "spec");
const modules = existsSync(specDir)
  ? [
      ...new Set(readdirSync(specDir).flatMap((f) => f.match(/^(\d{2})-/)?.slice(1, 2) ?? [])),
    ].sort()
  : [];

if (modules.length === 0) {
  console.log("Module audit passed (no legacy modules found).");
  process.exit(0);
}
const failed = [];
for (const mod of modules) {
  try {
    execFileSync("node", [join(root, "scripts", "spec-migration", "audit-module.mjs"), mod], {
      cwd: root,
      stdio: "inherit",
    });
  } catch {
    failed.push(mod);
  }
}
if (failed.length > 0) {
  console.error(`Module migration audit FAILED for module(s): ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`Module migration audit passed (${modules.length} module(s): ${modules.join(", ")}).`);
