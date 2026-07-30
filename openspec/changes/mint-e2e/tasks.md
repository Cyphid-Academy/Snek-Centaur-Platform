# mint-e2e — Tasks

## 1. Substrate orchestration

- [x] 1.1 Add the workspace member holding the harness under `apps/`, with its own agent context recording why it is not under `packages/` and why its test config is not discovered by the root glob (`e2e/hermetic-substrate`)
- [x] 1.2 Implement the process fixtures — start, health-wait, stop — for each runtime kind the platform deploys, allocating ports per run and tearing down on pass, fail and interrupt alike (`e2e/hermetic-substrate#teardown-does-not-leak-into-the-next-run`)
- [x] 1.3 Add a root script that invokes the harness, and leave it out of the fast battery (`e2e/hermetic-substrate`)
- [ ] 1.4 Fix the SpacetimeDB module's top-level export that the runtime rejects at publish (`e2e/hermetic-substrate#real-runtimes-not-doubles`) — the export it names is introduced by migrate-identity-and-authorization and does not exist on this branch, so the fix belongs with that change and is still open there
- [ ] 1.5 Put publishing the module behind a gate, so its rejection cannot regress unobserved once a scenario is not already publishing it (`e2e/hermetic-substrate#real-runtimes-not-doubles`)
- [x] 1.6 Record in the root agent context that a new runtime the platform deploys is a runtime the harness must start (`e2e/hermetic-substrate`)

## 2. Identity substitution

- [ ] 2.1 Add the configuration-gated verification hook to the deployment's sign-in provider, absent unless configured (`e2e/substituted-identity-verification#absence-of-configuration-is-production-behaviour`)
- [ ] 2.2 Implement harness-side assertion minting and session acquisition, carrying the issued session into a browser context (`e2e/substituted-identity-verification#only-verification-is-substituted`)
- [ ] 2.3 Confirm a deployment with no such configuration refuses a harness-signed assertion (`e2e/substituted-identity-verification#absence-of-configuration-is-production-behaviour`)

## 3. Browser layer

- [x] 3.1 Add the browser driver, resolving the already-present browser rather than downloading one (`e2e/browser-exercised-surfaces`)
- [x] 3.2 Implement multi-session support so two identities can be live at once (`e2e/browser-exercised-surfaces#concurrent-operators-are-concurrent-sessions`)

## 4. Scenarios

- [ ] 4.1 Once a game can be provisioned and resolved, drive one end to end and assert its turn stream against a recorded run (`e2e/hermetic-substrate#real-runtimes-not-doubles`)
- [ ] 4.2 Once an operator surface exists, exercise exclusive snake selection through two concurrent sessions (`e2e/browser-exercised-surfaces#concurrent-operators-are-concurrent-sessions`)
- [ ] 4.3 Confirm authorization reads a harness-established human exactly as any other (`e2e/substituted-identity-verification#substituted-subjects-carry-no-privilege`)

## 5. Validation

- [x] 5.1 Add `// spec:` citations to the code this change touches, and `// design:` references where a decision's rationale is worth loading before it is reconsidered
- [x] 5.2 Run `pnpm spec:check`

## Archive

- [ ] 6.1 On explicit author instruction, `pnpm spec:fold mint-e2e` then `openspec archive --skip-specs -y mint-e2e` at the tail of the PR that completes the implementation
- [ ] 6.2 Add `e2e` to the capability list in `openspec/config.yaml`'s context block
