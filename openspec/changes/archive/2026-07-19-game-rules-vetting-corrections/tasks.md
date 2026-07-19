## 1. Spec corrections (this change's deltas)
- [x] 1.1 Seed the delta file with the affected requirement blocks verbatim (two-commit authoring, seed commit)
- [x] 1.2 Apply the review-directed corrections to the deltas (edit commit — the reviewable word-level diff)
- [x] 1.3 Update identifier-map anchors for renamed/removed scenarios

## 2. Implementation to match
- [x] 2.1 boardgen: snakesPerTeam initial food per territory, fertile-unrestricted; per-territory shortage failure condition
- [x] 2.2 items/types/spawn: composite (turn, index) item identity replacing the 256-stride arithmetic
- [x] 2.3 Replace the superseded fuzz/example tests with fast-check property suites; update remaining tests
- [x] 2.4 pnpm spec:check, module-01 migration audit, and the full battery green

## 3. At archive (human-initiated)
- [x] 3.1 Archive as this PR's final commit, on the author's explicit instruction — `pnpm spec:fold game-rules-vetting-corrections` folded the deltas into specs/, then `openspec archive --skip-specs -y` moved the folder (the documented flow: openspec/README.md)
- [x] 3.2 Date-prefix the change name in identifier-map notes to the archived folder name
