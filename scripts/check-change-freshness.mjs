#!/usr/bin/env node
// Seed-freshness check for open changes (pnpm spec:freshness).
//
// Two-commit delta authoring makes the seed commit a durable record of the
// exact specs/ blocks a change was authored against. OpenSpec's archive
// machinery cannot detect a stale delta (it matches by header and replaces
// the block — body edits interleaved by another archive are silently
// clobbered), so this check closes the gap. For every open change's delta
// file it verifies:
//   1. TWO-COMMIT POLICY — every requirement in the CURRENT delta's
//      MODIFIED sections also appears in the SEED version of the file
//      (its first committed version): deltas revised without rewriting the
//      seed/edit pair are flagged.
//   2. FRESHNESS — every seeded MODIFIED block still matches the current
//      specs/ block verbatim, and REMOVED / RENAMED-from headers still
//      exist in specs/. specs/ advancing under an open change — the main
//      case being a PR rebased onto an advanced main, since archiving is
//      standardised as a PR's final commit — makes the change stale:
//      re-seed (rewrite the seed/edit pair against the new base) and
//      re-review the word-diff.
//   3. NEW-CAPABILITY SHAPE — a delta whose capability has no
//      specs/<capability>/spec.md is only well-formed as a mint: it must
//      open with a `## Purpose` preamble (the explicit mint marker —
//      without it the folder name is assumed to be a typo) and be
//      ADDED-only. Conversely a preamble whose capability already exists
//      is stale (another change minted the capability first, e.g. across
//      a rebase): the Purpose was never reconciled, so reconcile by hand
//      and drop the preamble. These checks need no git history, so they
//      run on uncommitted deltas too.
// Delta files not yet committed are skipped with a note (a change being
// authored right now has no seed to compare).
//
// The check is also the hard precondition of `pnpm spec:fold`
// (scripts/fold-change.mjs), which imports freshnessProblemsFor: folding
// replaces specs/ blocks wholesale, which is only sound while the seeded
// base still matches specs/.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { extractRequirementBlock, openChangeDeltaFiles, parseDeltaOps } from "./spec-index.mjs";

export const normalize = (s) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();

/** Current specs/ block for cap/slug, or null when absent. */
function liveSpecBlock(root, cap, slug) {
  const file = join(root, "openspec", "specs", cap, "spec.md");
  if (!existsSync(file)) return null;
  return extractRequirementBlock(readFileSync(file, "utf8"), cap, slug);
}

/**
 * Run the seed-freshness check. With `changeName`, only that open change's
 * delta files are checked (fold-change's precondition); without it, all open
 * changes are. Returns { problems, notes, checkedBlocks, checkedFiles,
 * skipped } — CLI presentation stays with the caller.
 */
export function freshnessProblemsFor(root, changeName) {
  const problems = [];
  const notes = [];
  let checkedBlocks = 0;
  let skipped = 0;
  const deltas = openChangeDeltaFiles(root).filter(
    ({ file }) => !changeName || file.includes(`/changes/${changeName}/`),
  );

  for (const { file, cap } of deltas) {
    const rel = relative(root, file);
    const change = rel.match(/changes\/([^/]+)\//)?.[1] ?? rel;

    // 3. New-capability shape (structural — independent of git history).
    const current = parseDeltaOps(readFileSync(file, "utf8"));
    const capExists = existsSync(join(root, "openspec", "specs", cap, "spec.md"));
    if (!capExists) {
      if (!current.preamble) {
        problems.push(
          `${change}: capability "${cap}" does not exist in specs/ and the delta has no "## Purpose" preamble — fix the capability folder name, or add a Purpose preamble to mint a new capability`,
        );
      } else if (!current.preamble.startsWith("## Purpose")) {
        problems.push(
          `${change}: "${cap}" delta preamble must begin with "## Purpose" to mint a new capability`,
        );
      }
      if (current.renamed.length > 0 || current.removed.length > 0 || current.modified.size > 0) {
        problems.push(
          `${change}: delta targets nonexistent capability "${cap}" with RENAMED/REMOVED/MODIFIED entries — a delta minting a capability must be ADDED-only`,
        );
      } else if (current.preamble && current.added.size === 0) {
        problems.push(`${change}: new capability "${cap}" has no ADDED requirements`);
      }
    } else if (current.preamble) {
      problems.push(
        `${change}: "${cap}" delta carries a new-capability "## Purpose" preamble but openspec/specs/${cap}/spec.md already exists — another change minted the capability first; reconcile the Purpose by hand and re-author the delta without the preamble`,
      );
    }

    let seedContent;
    try {
      const commits = execSync(`git log --reverse --format=%H -- "${rel}"`, {
        cwd: root,
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);
      if (commits.length === 0) {
        notes.push(`${rel} not committed yet — no seed to check`);
        skipped++;
        continue;
      }
      seedContent = execSync(`git show ${commits[0]}:"${rel}"`, { cwd: root, encoding: "utf8" });
    } catch {
      notes.push(`git unavailable for ${rel} — seed check skipped`);
      skipped++;
      continue;
    }
    const seed = parseDeltaOps(seedContent);

    // 1. Two-commit policy: current MODIFIED set must be seeded.
    for (const name of current.modified.keys()) {
      if (!seed.modified.has(name))
        problems.push(
          `${change}: MODIFIED "${name}" is not in the seed commit — rewrite the seed/edit pair instead of extending the delta in place`,
        );
    }
    // 2. Freshness: seeded blocks must match current specs/ verbatim.
    for (const [name, raw] of seed.modified) {
      const [cap, slug] = name.split("/");
      const live = liveSpecBlock(root, cap, slug);
      checkedBlocks++;
      if (live === null) {
        problems.push(
          `${change}: seeded base for "${name}" no longer exists in specs/ — the requirement was removed or renamed since seeding; re-seed the change`,
        );
      } else if (normalize(live) !== normalize(raw)) {
        problems.push(
          `${change}: specs/ has advanced since "${name}" was seeded — re-seed the change against the current base and re-review the word-diff`,
        );
      }
    }
    // REMOVED / RENAMED-from headers must still resolve in specs/.
    for (const name of [...current.removed, ...current.renamed.map(({ from }) => from)]) {
      const [cap, slug] = name.split("/");
      if (liveSpecBlock(root, cap, slug) === null)
        problems.push(
          `${change}: ${name} (REMOVED/RENAMED source) no longer exists in specs/ — re-seed the change`,
        );
    }
  }
  return { problems, notes, checkedBlocks, checkedFiles: deltas.length, skipped };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  const { problems, notes, checkedBlocks, checkedFiles, skipped } = freshnessProblemsFor(root);
  for (const n of notes) console.log(`note: ${n}`);
  if (problems.length > 0) {
    console.error(`Seed-freshness check FAILED (${problems.length}):`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(
    `Seed-freshness check passed (${checkedFiles - skipped} committed open delta file(s), ${checkedBlocks} seeded block(s) fresh${skipped ? `, ${skipped} uncommitted skipped` : ""}).`,
  );
}
