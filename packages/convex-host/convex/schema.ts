// Host-level schema. Deliberately empty: every platform table lives inside
// the mounted components, and the host's own tables arrive with the identity
// change — Better Auth in local install mode puts its user/session/linkage
// tables HERE, in the host schema, per that change's local-install decision
// (see packages/convex-host/AGENTS.md, "Auth integration").
// spec: global-invariants/single-convex-deployment
import { defineSchema } from "convex/server";

// TODO(migrate-identity-and-authorization): Better Auth tables (local
// install), the issuer registry, and accepted-assertion records land here.
export default defineSchema({});
