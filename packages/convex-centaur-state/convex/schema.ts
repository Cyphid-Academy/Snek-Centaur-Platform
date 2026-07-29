// spec: global-invariants/centaur-state-boundary
// The component's schema — deliberately empty, for the reason given in the
// twin file in convex-snek-platform.
//
// This component exists separately from the platform's because the boundary is
// real: the state it will hold is private to the team that owns it, and a
// component is the unit Convex isolates at. That boundary is worth standing up
// before there is anything behind it — it is what the host's `components.*`
// access is checked against. `snake_config`, `snake_drives`, `heuristic_config`,
// `snake_heuristic_overrides`, `bot_params` and `centaur_action_log` arrive with
// migrate-operator-control, migrate-bot-configuration and migrate-replay-and-audit.
import { defineSchema } from "convex/server";

export default defineSchema({});
