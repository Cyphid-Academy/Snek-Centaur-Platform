# Snek Centaur Server — Reference Implementation

The reference implementation of the Snek Centaur Server, built with Svelte 5 / SvelteKit.

This app is the canonical source in the monorepo. It is mirrored to `cyphid/snek-centaur-server` via `git subtree split` on every push to `main`. Teams fork the mirror to build their own Centaur Server. Do not edit the mirror directly.

## Development

```bash
pnpm dev        # start dev server on port 5000
pnpm build      # production build
pnpm typecheck  # TypeScript check
pnpm test       # run tests
```

**Spec module**: 08-centaur-server-app
