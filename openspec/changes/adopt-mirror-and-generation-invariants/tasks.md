# adopt-mirror-and-generation-invariants — Tasks

`global-invariants` is a constraint-defining meta-capability: it prescribes
nothing to build itself. Every invariant it states is discharged by the
concrete capabilities that depend on it — each its own change, each citing
these identifiers from its own spec and code, each verifying enforcement at
its own archive. So this change has no implementation phase, and the generic
"implement the requirements / cite them in the code written for this
capability" tasks do not apply. Its "implementation" is the reviewed delta
text; its gate is the spec toolchain rather than a code battery.

That is also why it archives in the PR that opens it. An unfolded invariant
binds only the change carrying it, which is the defect this change exists to
correct.

## 1. Completion

- [ ] 1.1 Confirm both requirements moved **verbatim** from `mint-platform-persistence`: same identifiers, same scenario slugs, same prose, same `Depends on:` declarations — this is a change of folder, not of text (`global-invariants/engine-mirrors-are-guarded`, `global-invariants/one-shared-generation`)
- [ ] 1.2 Confirm no code or `// spec:` citations are owed *by this change*: gi is enforced from the dependent capabilities' code, which cite these identifiers there — nothing is written "for" gi itself. `packages/game-configuration` and `apps/visual-tester` already cite `one-shared-generation`, and those citations are theirs rather than this change's
- [ ] 1.3 Confirm every added invariant has at least one declared dependent in the open train, so neither is an orphan: `game-configuration/engine-schema-fidelity` declares the first; `game-configuration/generation-parameter-boundary`, `game-configuration/board-preview` and `visual-tester/generated-board-sessions` declare the second (`global-invariants/engine-mirrors-are-guarded`, `global-invariants/one-shared-generation`)
- [ ] 1.4 Confirm `mint-platform-persistence` is coherent without them: its delta is now `platform-persistence`-only, its `design.md` keeps the decisions that are its own, and its admission-test argument is undisturbed — the drift guard failing that capability's fourth prong is *why* the requirement is gi's, and that argument moved with the requirement
- [ ] 1.5 Run `pnpm spec:check` — strict validation, reference lint over the open-change overlay, seed-freshness, graph freshness, identifier-map audit

## Archive

- [ ] 2.1 `pnpm spec:fold adopt-mirror-and-generation-invariants`, then `openspec archive --skip-specs -y adopt-mirror-and-generation-invariants` — in this PR rather than a later one, because an unfolded invariant binds nothing outside the change that carries it
- [ ] 2.2 Run `pnpm spec:check` after archiving, and confirm the four declaring requirements now resolve against `specs/` rather than the overlay
- [ ] 2.3 No `openspec/config.yaml` capability-list edit is owed — `global-invariants` is already in it
