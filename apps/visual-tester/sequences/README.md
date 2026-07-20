# Test Sequence fixtures

Git-tracked, canonical-JSON Test Sequences — the promoted regression set. Each
`*.json` here is replayed against the module-01 turn resolver by
`src/lib/sequences.regression.test.ts`, so committing a file turns it into a
CI regression test.

- **Save as fixture** in the visual tester writes here (the only explicit save).
- The working session auto-persists to `scratch/` (gitignored) — no save action;
  see design D11 in the add-visual-tester change.
- Promotion is review + commit: an agent noticing untracked files here can
  offer to promote them (`git add`) after you review the diff.
