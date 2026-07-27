# adopt-federated-trust-invariants — Tasks

`global-invariants` is a constraint-defining meta-capability: it prescribes
nothing to build itself. Every invariant it states is discharged by the
concrete capabilities that depend on it — each its own change, each citing
these identifiers from its own spec and code and verifying enforcement at its
own archive. So this change has no implementation phase of its own: its
"implementation" is the reviewed delta text, and its gate is the spec
toolchain, not a code battery. The generic "implement the requirements / cite
them in the code written for this capability / verify the dependent
implementations enforce them" tasks do not apply here and are replaced below.

## Completion

- [x] 1.1 Confirm every added and modified invariant has at least one
  declared dependent among the open changes (none is an orphan), and that
  enforcement is each dependent's obligation verified at *that* dependent's
  own archive — never a precondition of archiving this change
- [x] 1.2 Re-point every open change citing a scenario slug this change
  removes (`ephemeral-game-credentials#game-credentials-expire`,
  `credential-confinement#game-credential-has-one-delivery-path`), and every
  identifier-map anchor pointing at one
- [x] 1.3 Confirm no code or `// spec:` citations are owed *by this change*:
  gi is enforced from the dependent capabilities' code, which cite these
  identifiers there — nothing is written "for" gi itself, and the
  `// design:` references its rationale warrants belong to those
  capabilities' own implementation tasks
- [x] 1.4 Run `pnpm spec:check` (strict validation, reference lint over the
  open-change overlay, seed-freshness, graph freshness, identifier-map audit)
  — green

## Archive

- [x] 2.1 On explicit author instruction, `pnpm spec:fold adopt-federated-trust-invariants` then `openspec archive --skip-specs -y adopt-federated-trust-invariants` at the tail of this PR (gi depends only on `game-engine`, already in `specs/`, so it folds ahead of the train changes that cite it; the capability already exists, so there is no `config.yaml` capability-list edit and no identifier-map edit)
- [x] 2.2 Re-run `pnpm spec:freshness` immediately before folding
- [x] 2.3 Run `pnpm spec:check` after archiving
