# Claude — Pointer File

Agent context is split by concern:

- **Implementation work** (TypeScript, packages, CI, infra): read root `AGENTS.md`.
- **Spec authoring** (editing `spec/` module files, REVIEW items): read `spec/AGENTS.md`.
- **Package-scoped work**: read the `AGENTS.md` inside the relevant `packages/*/` or `apps/*/` directory.

Any updates to agent context must be written to the appropriate `AGENTS.md` file — not here. This file is only for context genuinely specific to Claude's product environment.

## Cowork

### File Delivery

Each Cowork session has an opaque identifier (e.g. `laughing-focused-goldberg`, `practical-eager-keller`). Below, `<SESSION_ID>` stands in for whatever the current session's identifier is — substitute the live value from the session's own paths.

To make files accessible to Chris on his local filesystem, always write final outputs directly to:

```
/sessions/<SESSION_ID>/mnt/Team Snek Centaur Engine/
```

This maps to Chris's selected folder and files appear there immediately.

**Do not** write deliverables to the scratchpad (`/sessions/<SESSION_ID>/` outside of `mnt/`). The platform will copy scratchpad files to an obscure AppData path that Chris would have to hunt for manually.

Intermediate/temporary files (e.g. pipeline artifacts not intended for the user) can stay in the scratchpad.
