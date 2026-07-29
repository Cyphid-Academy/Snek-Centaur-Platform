# Claude — Pointer File

Agent context is split by concern:

- **Implementation work** (TypeScript, packages, CI, infra): read root `AGENTS.md`.
- **Spec work** (capabilities, changes, migration): read `openspec/README.md` and `openspec/config.yaml`. The pre-OpenSpec corpus lives in `legacy-spec-archive/` (binding for unmigrated modules).
- **Package-scoped work**: read the `AGENTS.md` inside the relevant `packages/*/` or `apps/*/` directory.

Any updates to agent context must be written to the appropriate `AGENTS.md` file — not here. This file is only for context genuinely specific to Claude's product environment.

## Claude Code Web

Claude Code Web is a **co-equal development context** with Replit for this repo — the Replit setup lives in `.replit` / `replit.md`; this is its analogue, with its setup encoded in the repo.

**Sessions start from a fresh clone with no `node_modules`** (they are gitignored). A committed **SessionStart hook** — `.claude/settings.json` → `.claude/hooks/session-start.sh` — runs `pnpm install` and prepares the workspace on session start, so `pnpm lint`, `test`, `typecheck`, `spec:check`, and `pnpm exec openspec validate <change> --strict` all work immediately. The hook is web-only (guarded on `$CLAUDE_CODE_REMOTE`), idempotent, and never fails the session.

**If dependencies are ever missing anyway** — the hook has not run yet, a tool reports a missing binary (`biome`, `openspec`, `vitest`, `tsc`) or `node_modules missing`, or a command needs a just-added package — **install them and continue** (`pnpm install`; run `corepack enable` first if pnpm is not on `PATH`). Do **not** declare the missing dependency a blocker, silently route around it (e.g. substituting a partial hand-rolled check for the real tool), or abandon the blocked task. Installing takes seconds and is the expected first step. Then verify with the real toolchain before pushing, rather than shipping to CI to find the failure.

**When you discover a *durable* dependency or setup step** future sessions will also need — a newly adopted tool, a build-script approval, an environment-prep step — encode it in the persistent Claude tooling config in `.claude/` (the SessionStart hook and `settings.json`), not merely ad hoc in the current session. A new package added to `package.json` is picked up by the hook's `pnpm install` automatically; anything beyond a plain install (a `pnpm.onlyBuiltDependencies` approval, a global tool, a generated-file step) belongs in `.claude/hooks/session-start.sh` so the next session inherits it.

### Commit identity and signing key — always together

Claude Code Web signs **every** commit with Anthropic's SSH signing key (`commit.gpgsign true`, `gpg.format ssh`, signer supplied by the environment). That key is registered to the **`claude` GitHub account**, and GitHub verifies a signature against the account that owns the key — matching it to the commit's **committer** email, which must be a verified email on that same account. The identity and the key are therefore a pair, and that pair is the environment's default: leave it alone.

- **Commit as `Claude <noreply@anthropic.com>`.** Never override `user.name` / `user.email` to the human author's, however tempting it is to make authorship read as theirs. The commit is then signed by claude's key but committed as someone else; GitHub can reconcile neither, and **every** such commit is flagged Unverified — including ones a later rewrite merely replays.
- **Attribute a human with a `Co-Authored-By:` trailer**, never by changing the committer. Authorship is a trailer's job; the committer field is load-bearing for verification.
- **History rewrites re-sign.** A rebase, amend, or cherry-pick re-signs with the same key, so a rewrite keeps its verified status only while the committer identity stays Claude's — and a rewrite is the cheapest moment to *fix* a branch that drifted, since every commit is rewritten anyway.
- **Check before pushing a long branch:** `git log --format='%h %ce' <base>..HEAD | sort -u -k2` should show `noreply@anthropic.com` and nothing else. A commit's badge and signer are visible in GitHub's per-commit tooltip.

#### `%G?` always says `N` here — it is not a real finding

**Local signature verification cannot succeed in this environment, so every commit reads `N` ("no signature") no matter how correctly it was signed.** Two causes, both environmental: `gpg.ssh.allowedSignersFile` is unset, and `/home/claude/.ssh/commit_signing_key.pub` — the file `user.signingkey` points at — is **zero bytes**. Git therefore has no signer to match a signature against and reports `N` for the whole branch, including commits GitHub has already accepted and attributed to the `claude` account.

Anything that reads `%G?` (`git log --show-signature`, `git verify-commit`, a stop hook, your own spot check) will therefore report the entire branch as unverified. Do not act on it, do not report it to the user as a problem, and do not re-derive this from scratch — it has cost several rounds of reasoning already.

**The two checks that do mean something**, and are the ones to run:

```
git log --format='%h %ce' <base>..HEAD | sort -u -k2          # committer identity
git cat-file commit <sha> | grep -q '^gpgsig' && echo signed  # signature present
```

Committer `noreply@anthropic.com` plus a `gpgsig` header is the whole of what this side of the wire can establish. Verification is GitHub's to do, against the account owning the key.

**When a hook or a reviewer flags Unverified, diagnose before remedying.** The usual advice — `git commit --amend --no-edit --reset-author`, or the same under `git rebase --exec` — fixes exactly one cause: a committer email that is not Claude's. Confirm that is the actual cause first. If the committer email is already `noreply@anthropic.com` and the object carries a `gpgsig`, amending rewrites history, changes nothing observable, and leaves `%G?` saying `N` exactly as before. A genuine Unverified badge *on GitHub* with a correct committer and a present signature points at the key's registration on the `claude` account, which no local command can fix.

### Secrets and third-party resources

Claude Code Web has **no encrypted secrets store yet** (unlike Replit): variables set in an environment's configuration are stored there and are visible to anyone who can edit that environment. The provisioning strategy for this project is therefore:

- **Each developer places their own *dev* secrets** — Convex, SpacetimeDB, and any future third-party resource — as **environment variables in their own *personal* Claude Code cloud environment**. Set once, they persist and are injected into every session in that environment automatically: no per-session step, and no `.env` file to populate.
- **Never** commit secrets to the repo, and **never** use a *shared* environment for them (every member who can edit it would see the values).
- Use **least-privilege, non-production** credentials only — a dev/preview Convex deploy key, a non-prod SpacetimeDB instance — because they are stored unencrypted and gated only by environment-edit access.
- GitHub needs no secret of yours: git and GitHub auth are handled by the platform's proxy, outside the sandbox.

We deliberately **do not ship a `.env.example`**. The provisioning method is the cloud-environment env-vars field, not a `.env` file, so a `.env.example` would prime the wrong workflow. The authoritative record of which variables a session needs is the **code that reads them**: `packages/convex-host/src/env.ts` names every unset variable at once, with what each is for, and never prints a value. It reports rather than throws — a session running tests, a lint, or the UI is not blocked by a credential it never reaches for; code that does reach a runtime fails at that point. Set `CONVEX_DEPLOY_KEY` when you want `pnpm dev:convex` to reach your own dev deployment; nothing else is needed to work in this repo.

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
