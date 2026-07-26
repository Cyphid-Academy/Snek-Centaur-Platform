# migrate-bot-framework — Tasks

## Implementation

- [ ] 1.1 Review this change's artifacts with the author immediately before implementation begins, and refine this task breakdown then
- [ ] 1.2 Implement the capability's requirements per the delta
- [ ] 1.3 Add `// spec:` citations in the code written for it, and `// design:` references where this change's design rationale warrants them
- [ ] 1.4 Run `pnpm spec:check` and the full battery with the implementation

## Archive

- [ ] 2.1 On explicit author instruction, `pnpm spec:fold migrate-bot-framework` then `openspec archive --skip-specs -y migrate-bot-framework` at the tail of the PR that completes the implementation (fold enforces capability-dependency order)
- [ ] 2.2 Add the minted capability to `openspec/config.yaml`'s context capability list
- [ ] 2.3 Run `pnpm spec:check` after archiving
