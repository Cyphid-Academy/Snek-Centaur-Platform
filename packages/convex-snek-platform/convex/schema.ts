// spec: identity-and-authorization/trusted-issuer-registry,
//       identity-and-authorization/service-principal-assertions,
//       identity-and-authorization/sign-in-handoff,
//       identity-and-authorization/platform-admin-role,
//       identity-and-authorization/peer-capability-ceiling
// The component's schema.
import { defineSchema, defineTable } from "convex/server";
import { type Infer, v } from "convex/values";

/**
 * A human, by the platform's own durable identifier for them.
 *
 * A plain string rather than `v.id("users")` because the user record belongs to
 * migrate-accounts-and-profiles: this change references the anchor without
 * asserting a shape it does not own.
 *
 * spec: identity-and-authorization/authentication-required#user-record-anchors-authorization
 */
const userId = v.string();

/**
 * One trusted issuer's registration, exported so the query that hands it to the
 * host declares the same four fields the table stores rather than a second
 * spelling of them that can drift.
 *
 * The ceiling is stored as bare capability identifiers rather than a union of
 * the host's `Capability` type: the host owns that type, and a component that
 * imported it would depend on its own consumer.
 *
 * spec: identity-and-authorization/trusted-issuer-registry
 */
export const issuerRegistration = {
  issuerId: v.string(),
  verificationMaterialUrl: v.string(),
  capabilityCeiling: v.array(v.string()),
  returnAddresses: v.array(v.string()),
};

/**
 * The same four fields as a type, inferred from the validator above rather than
 * written out beside it.
 *
 * The host reads registrations out of a `runQuery`, whose result it can only
 * type by annotation — so a hand-written interface there typechecks on both
 * sides of a field rename and fails at runtime. Inference is what makes the
 * rename a compile error instead.
 */
export type IssuerRegistration = Infer<ReturnType<typeof v.object<typeof issuerRegistration>>>;

/** spec: identity-and-authorization/live-game-issuance */
export const gameStatus = v.union(
  v.literal("not-started"),
  v.literal("playing"),
  v.literal("finished"),
);

/**
 * One participating team as the roster snapshot recorded it when the game was
 * initialized — the exact shape `convex-host`'s `auth/eligibility.ts` decides
 * from, so issuance reads the snapshot and never assembles one.
 *
 * spec: identity-and-authorization/roster-snapshot-binding
 */
export const participantSnapshot = v.object({
  teamId: v.string(),
  memberUserIds: v.array(userId),
  coachUserIds: v.array(userId),
});

export default defineSchema({
  // spec: identity-and-authorization/trusted-issuer-registry
  trusted_issuers: defineTable(issuerRegistration).index("by_issuer", ["issuerId"]),

  // Single-use needs a uniqueness guard that two concurrent presentations
  // cannot both pass, and Convex has no unique index. `claimAssertionId` reads
  // `by_assertion` and inserts in the same mutation, which puts the read in
  // that transaction's read set: if a concurrent mutation inserts the same
  // identifier first, this one's read is invalidated and it re-runs against the
  // row the other committed, and refuses. The guard is therefore inside the
  // transaction it protects rather than an earlier check a commit can outrun.
  // spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
  // spec: global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard
  accepted_assertions: defineTable({ assertionId: v.string(), expiresAt: v.number() })
    .index("by_assertion", ["assertionId"])
    .index("by_expiry", ["expiresAt"]),

  // There is no `redeemedAt`: redemption deletes the row, so single-use is the
  // same read-then-write guard as `accepted_assertions` and there is no second
  // state anyone has to remember to check. Nothing needs to tell a redeemed
  // reference from an expired one — both are refused, and both are absent.
  //
  // `challenge` is what redeeming takes that the URL did not carry. The browser
  // generates a verifier, keeps it, and sends only its hash here; redemption
  // presents the verifier, and the hash of it must equal what is stored. It is
  // required, not optional, and that is the security property rather than
  // tidiness: the return leg puts the reference in the Server's own address bar,
  // so a reference redeemable by anything the Server *has* — its signing key,
  // say — would let the Server take the human's credential for itself. A row
  // with no challenge would be exactly such a reference, so there is no way to
  // write one.
  //
  // It is compared and never returned. Nothing reads it back out.
  // spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
  // spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
  sign_in_handoffs: defineTable({
    reference: v.string(),
    userId,
    issuerId: v.string(),
    challenge: v.string(),
    expiresAt: v.number(),
  })
    .index("by_reference", ["reference"])
    .index("by_expiry", ["expiresAt"]),

  // Presence of a row *is* the designation, and there is no team or server
  // column, so a per-team or per-server admin is not expressible rather than
  // merely discouraged.
  // spec: identity-and-authorization/platform-admin-role#role-effective-without-reload
  platform_admins: defineTable({ userId }).index("by_user", ["userId"]),

  // One action taken on a human's behalf through a registered system. Only the
  // host writes here, and only from a mutation or an action.
  //
  // `expiresAt` is what the sweep walks. What the requirement asks to be
  // showable is what was done on the account, not a permanent ledger of who
  // acted through whom, and a record nobody will review is only a record
  // someone can later be made to produce.
  // spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
  system_actions: defineTable({
    userId,
    issuerId: v.string(),
    capability: v.string(),
    expiresAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_expiry", ["expiresAt"]),

  // NEIGHBOURING. migrate-game-lifecycle owns this table and will grow it; the
  // two fields here are what token issuance reads, with no lifecycle behaviour
  // on top of them. `roster` is stored *in the game record* rather than joined
  // onto team records, so there is no path from here back to `centaur_teams` to
  // follow.
  // spec: identity-and-authorization/live-game-issuance
  // spec: identity-and-authorization/roster-snapshot-binding#running-game-reads-only-the-snapshot
  games: defineTable({ status: gameStatus, roster: v.array(participantSnapshot) }),

  // NEIGHBOURING. migrate-team-management owns this table and will grow it; the
  // one field here is the domain of the server operating the team, which
  // issuance needs to decide that a Server asking for a team's game credential
  // is that team's. A team's identity is the record's own `_id`, and the domain
  // is an ordinary mutable column of it.
  // spec: identity-and-authorization/identity-kinds#server-domain-is-not-identity
  centaur_teams: defineTable({ serverDomain: v.union(v.string(), v.null()) }),
});
