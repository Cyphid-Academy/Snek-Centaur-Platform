// spec: global-invariants/single-convex-deployment
// The component's schema — deliberately empty.
//
// A `defineTable` is not a description of intended state, it is a schema the
// deployment then agrees to and validates every write against. The record
// interfaces in `src/index.ts` say what this component will eventually hold;
// the tables themselves arrive with the capability changes that own them
// (migrate-accounts-and-profiles for users, migrate-game-lifecycle for games,
// and so on), so that each table lands together with the requirements that fix
// its fields.
//
// An empty schema still pushes, so `pnpm dev:convex` exercises the whole
// deploy path — component mount, schema push, function push — with nothing
// asserted ahead of its spec.
import { defineSchema } from "convex/server";

export default defineSchema({});
