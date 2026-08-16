# @cyphid/convex-snek-platform

Convex Component for platform-wide state in the Team Snek Centaur Platform.

Implemented so far: the **`games`** table in its minimal form — the game's identity plus the configuration the `game-configuration` capability owns (config, roster, current preview, board lock, starting state) — and its full function surface (create / read / configure / lock / launch / conclude). The remaining platform tables (`users`, `centaur_teams`, `rooms`, `replays`, `webhooks`, ...) arrive with the stories that own them and extend this same component; auth tables live in the host schema per the identity change's local-install decision.

Mounted by `@cyphid/snek-convex-host` via `@cyphid/convex-snek-platform/convex.config`. See `AGENTS.md` for layout and toolchain.

**Spec**: `game-configuration` (open change `migrate-game-configuration`); modules 03/05 of `legacy-spec-archive/` for the unmigrated remainder.
