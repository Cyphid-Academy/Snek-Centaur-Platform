// Host-level schema: the POLICY tables the identity capability owns. The
// auth substrate's own tables (users, sessions, provider linkages, signing
// material) live in the local-install Better Auth component
// (convex/betterAuth/schema.ts); every game table lives in the
// snek-platform component. What sits at the host level is exactly the
// application-owned authorization state: the trusted-issuer registry, the
// accepted-assertion identifiers, and the pending sign-in handoffs.
// spec: global-invariants/single-convex-deployment
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /**
   * The registry of issuers the platform trusts: zero or more registered
   * external principals, each recorded with an issuer identifier, where it
   * publishes its verification material, the ceiling of capabilities it
   * may confer, the addresses humans may be returned to after sign-in,
   * and a per-principal call-rate bound.
   *
   * EVERYTHING recorded here is public — an identifier, a URL, a ceiling,
   * return addresses, a rate number. The record has no field a secret
   * could occupy, deliberately: trust is anchored on where a principal
   * PUBLISHES its material, re-proven on every read, never on a secret
   * the registry would have to hold.
   * spec: identity-and-authorization/trusted-issuer-registry#registry-holds-no-secret
   *
   * Credential resolution always queries this table as a SET (by
   * issuerId), so registering a second issuer changes nothing about how
   * credentials are validated.
   * spec: identity-and-authorization/trusted-issuer-registry#the-set-is-never-assumed-singular
   */
  trusted_issuers: defineTable({
    /**
     * The issuer identifier a presented assertion's `iss` must equal.
     * For a Centaur Team's Snek Centaur Server registration, this IS the
     * team id — the registration is the team's. (How a registration is
     * homed to a server domain, and the two-sided consent around it,
     * belongs to the team-server-management story.)
     */
    issuerId: v.string(),
    // spec: identity-and-authorization/identity-kinds
    principalKind: v.union(v.literal("centaur-team"), v.literal("external-system")),
    /** Where this principal publishes its verification material (JWKS URL). */
    materialUrl: v.string(),
    /**
     * The ceiling of capabilities this issuer may confer — bare verbs,
     * the same closed vocabulary the capability claim uses.
     * spec: identity-and-authorization/trusted-issuer-registry
     */
    ceiling: v.array(v.string()),
    /**
     * The addresses humans may be returned to after a platform sign-in —
     * the ONLY addresses the handoff will ever redirect to.
     * spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
     */
    returnAddresses: v.array(v.string()),
    /**
     * Per-principal call-rate bound, recorded at registration.
     * spec: identity-and-authorization/peer-capability-ceiling
     * Enforcement wiring lands with the external-system surface; the
     * registry records the bound so registration carries it from day one.
     */
    callRateLimitPerMinute: v.number(),
  }).index("by_issuerId", ["issuerId"]),

  /**
   * Single-use record of accepted assertion identifiers (jti): each
   * assertion is accepted once, and rows are EXPIRED on the assertion
   * lifetime — swept opportunistically on insert — rather than retained
   * indefinitely.
   * spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
   */
  accepted_assertions: defineTable({
    jti: v.string(),
    expiresAt: v.number(),
  })
    .index("by_jti", ["jti"])
    .index("by_expiresAt", ["expiresAt"]),

  /**
   * Pending sign-in handoffs: an opaque reference naming one
   * authenticated human and one registered Server, accepted once,
   * expiring on the redirect it exists to survive (two minutes), and
   * conferring nothing on its own. Only the reference's HASH is stored —
   * the reference itself travels in a URL and is assumed seen — and
   * redemption takes the PKCE-shaped verifier whose hash was fixed at
   * creation, which the URL did not carry.
   * spec: identity-and-authorization/sign-in-handoff
   */
  handoff_references: defineTable({
    /** sha256(reference), hex. */
    refHash: v.string(),
    issuerRowId: v.id("trusted_issuers"),
    userId: v.string(),
    /** sha256(verifier), hex — fixed by the requesting page at creation. */
    challengeS256: v.string(),
    expiresAt: v.number(),
    used: v.boolean(),
  }).index("by_refHash", ["refHash"]),
});
