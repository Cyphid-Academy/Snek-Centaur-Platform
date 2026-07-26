# extend-global-invariants — Tasks

`global-invariants` is a constraint-defining meta-capability: it prescribes
nothing to build itself. Every invariant it states is discharged by the
concrete capabilities that depend on it — each its own train change, each
citing these identifiers from its own spec and code and verifying enforcement
at its own archive. So this change has no implementation phase of its own: its
"implementation" is the reviewed delta text, and its gate is the spec
toolchain, not a code battery. The generic "implement the requirements / cite
them in the code written for this capability / verify the dependent
implementations enforce them" tasks do not apply here and are replaced below.

## Completion

- [x] 1.1 Reconcile `proposal.md` and `design.md` with the actual delta
  (10 ADDED, 3 MODIFIED): document `team-private-centaur-state` and the
  `one-shared-engine` widening, and correct the requirement/extension counts
  and the legacy-id disposition breakdown against the identifier map
- [x] 1.2 Confirm no code or `// spec:` citations are owed *by this change*:
  gi is enforced from the dependent capabilities' code, which cite these
  identifiers there — nothing is written "for" gi itself
- [x] 1.3 Confirm every added and extended invariant has at least one
  declared dependent in the open train (none is an orphan), and that
  enforcement is each dependent's obligation verified at *that* dependent's
  own archive — never a precondition of archiving gi
- [x] 1.4 Run `pnpm spec:check` (strict validation, reference lint over the
  open-change overlay, seed-freshness, graph freshness, identifier-map audit)
  — green

## Archive

- [ ] 2.1 On explicit author instruction, `pnpm spec:fold extend-global-invariants`
  then `openspec archive --skip-specs -y extend-global-invariants` at the tail
  of this PR (gi depends only on `game-engine`, already in `specs/`, so it
  folds ahead of the train changes that cite it; the capability already exists,
  so there is no `config.yaml` capability-list edit and no identifier-map edit)
- [ ] 2.2 Re-run `pnpm spec:freshness` immediately before folding
- [ ] 2.3 Run `pnpm spec:check` after archiving
