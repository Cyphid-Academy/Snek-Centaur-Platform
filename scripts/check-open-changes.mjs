#!/usr/bin/env node
// Archive-due gate over open OpenSpec changes.
//
// An "open change" is any directory directly under `openspec/changes/` other
// than `archive/`. Open changes are a FIRST-CLASS state — approved spec work
// whose implementation has not landed — and any number may exist on main.
// What must never exist on main is a COMPLETED-BUT-UNARCHIVED change: the
// repo convention is that the PR whose head state leaves an open change
// with all implementation tasks checked must archive that change before
// merge (the dual of stock OpenSpec's warn-on-archiving-incomplete check).
//
// A change is ARCHIVE-DUE when its tasks.md has zero unchecked checkboxes
// OUTSIDE the final `## Archive` section. Tasks under `## Archive` are the
// bookkeeping performed BY the archive commit itself (fold, config.yaml
// capability list, identifier-map merge, cutover flips) — they can only
// ever be checked at archive time, so they are exempt from the completeness
// calculation. A change with no tasks.md, or no checkboxes at all outside
// `## Archive`, is treated as archive-due (a documentation-only change
// archives in its authoring PR).
//
// Used by the CI `archive-due-gate` job to post the
// `no-archive-due-changes` merge-readiness commit status: `pending` (a
// yellow "waiting" gate that blocks merge WITHOUT marking the commit
// failed — the archive step is simply not done yet) while any open change
// is archive-due, `success` otherwise. Also runnable locally.
//
// Modes:
//   (default)  human summary; exit 1 if any change is archive-due, else 0
//   --names    print archive-due change names, one per line; always exit 0
//   --json     print {"openChanges": [...], "archiveDue": [...]}; exit 0
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ARCHIVE_HEADING = /^#{2,}\s+archive\s*$/i;
const HEADING = /^#{2,}\s+/;
const UNCHECKED = /^\s*[-*] \[ \]/;
const CHECKED = /^\s*[-*] \[[xX]\]/;

/**
 * Parse a tasks.md body. Returns counts of unchecked/checked boxes outside
 * the `## Archive` section (implementation tasks) and inside it.
 */
export function taskProgress(md) {
  let inArchive = false;
  const p = { implUnchecked: 0, implChecked: 0, archiveUnchecked: 0, archiveChecked: 0 };
  for (const line of md.split("\n")) {
    if (HEADING.test(line)) inArchive = ARCHIVE_HEADING.test(line.trimEnd());
    if (UNCHECKED.test(line)) p[inArchive ? "archiveUnchecked" : "implUnchecked"]++;
    else if (CHECKED.test(line)) p[inArchive ? "archiveChecked" : "implChecked"]++;
  }
  return p;
}

/** Open change names with their archive-due verdicts. */
export function archiveDueReport(root) {
  const changesDir = join(root, "openspec", "changes");
  const open = [];
  if (existsSync(changesDir))
    for (const e of readdirSync(changesDir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === "archive" || e.name.startsWith(".")) continue;
      const tasksPath = join(changesDir, e.name, "tasks.md");
      const progress = existsSync(tasksPath)
        ? taskProgress(readFileSync(tasksPath, "utf8"))
        : { implUnchecked: 0, implChecked: 0, archiveUnchecked: 0, archiveChecked: 0 };
      open.push({ name: e.name, due: progress.implUnchecked === 0, progress });
    }
  open.sort((a, b) => a.name.localeCompare(b.name));
  return open;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] ?? "";
  const open = archiveDueReport(process.cwd());
  const due = open.filter((c) => c.due).map((c) => c.name);

  if (mode === "--names") {
    process.stdout.write(due.join("\n"));
    process.exit(0);
  }
  if (mode === "--json") {
    process.stdout.write(JSON.stringify({ openChanges: open.map((c) => c.name), archiveDue: due }));
    process.exit(0);
  }

  if (due.length === 0) {
    console.log(
      open.length === 0
        ? "No open OpenSpec changes."
        : `No archive-due changes (${open.length} open change(s) with unfinished implementation tasks).`,
    );
    process.exit(0);
  }
  console.error(
    `Archive-due change(s): ${due.join(", ")}.\nEvery implementation task is checked, so the PR completing the work must archive the change at its tail: \`pnpm spec:fold <change>\`, perform the tasks under its \`## Archive\` section, then \`openspec archive --skip-specs -y <change>\`.`,
  );
  process.exit(1);
}
