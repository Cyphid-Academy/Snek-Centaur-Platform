#!/usr/bin/env node
// Detect OpenSpec changes that are still open (not archived).
//
// An "open change" is any directory directly under `openspec/changes/` other
// than `archive/`. Archiving a change (`openspec archive`) moves its folder
// into `openspec/changes/archive/<date>-<name>/`, so a clean `main` has none.
//
// Used by the CI `open-changes-gate` job to post the `no-open-changes`
// merge-readiness commit status: while any change is open the status is
// `pending` (a yellow "waiting" gate that blocks merge WITHOUT marking the
// commit failed — the archive step is simply not done yet), and it turns
// `success` once the change is archived. Also runnable locally to check the
// main-clean invariant before merging.
//
// Modes:
//   (default)  human summary; exit 1 if any change is open, else 0
//   --names    print open change names, one per line; always exit 0 (CI capture)
//   --json     print {"openChanges": [...]}; always exit 0
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CHANGES_DIR = join(process.cwd(), "openspec", "changes");

function openChanges() {
  if (!existsSync(CHANGES_DIR)) return [];
  return readdirSync(CHANGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "archive")
    .map((e) => e.name)
    .sort();
}

const mode = process.argv[2] ?? "";
const open = openChanges();

if (mode === "--names") {
  process.stdout.write(open.join("\n"));
  process.exit(0);
}
if (mode === "--json") {
  process.stdout.write(JSON.stringify({ openChanges: open }));
  process.exit(0);
}

if (open.length === 0) {
  console.log("No open OpenSpec changes — the main-clean invariant holds.");
  process.exit(0);
}
const hint =
  "Archive as the PR's final commit before merge: `pnpm spec:fold <change>`, add the capability to openspec/config.yaml, then `openspec archive --skip-specs -y <change>`.";
console.error(`Open (unarchived) OpenSpec change(s): ${open.join(", ")}.\n${hint}`);
process.exit(1);
