// Better Auth in LOCAL INSTALL mode: the component is embedded in this
// package's Convex directory rather than consumed across a component
// boundary, so the schema it stores (linkage records in `account`, sessions,
// signing material in `jwks`) lives where this deployment can modify it.
// Forking the integration repository is explicitly rejected — local install
// buys the schema control without tracking upstream security fixes forever.
// design: openspec/changes/migrate-identity-and-authorization/design.md
//        ("Implementation substrate, and the boundary policy must not cross")
import { defineComponent } from "convex/server";

const component = defineComponent("betterAuth");

export default component;
