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

/**
 * The snapshot as a type, inferred for the same reason as `IssuerRegistration`
 * — and read-only, because every consumer holds a snapshot to decide from,
 * never to change.
 */
export type ParticipantSnapshot = {
  readonly [K in keyof Infer<typeof participantSnapshot>]: Infer<
    typeof participantSnapshot
  >[K] extends Array<infer Element>
    ? ReadonlyArray<Element>
    : Infer<typeof participantSnapshot>[K];
};

// ---------------------------------------------------------------------------
// The configuration record on the game. Exactly two disjoint halves and
// nothing else: the engine's gameplay vocabulary, mirrored field-for-field so
// the half a game is played from is handed to the engine without translation,
// and this capability's own board-generation declaration, which mirrors
// nothing. `functions.mirror.test.ts` walks `DEFAULT_RUNTIME_CONFIG` against
// the gameplay validator below, so a field added to the engine and forgotten
// here fails the build rather than the game.
// spec: game-configuration/engine-schema-fidelity
// spec: game-configuration/closed-parameter-vocabulary
// spec: global-invariants/engine-mirrors-are-guarded
// ---------------------------------------------------------------------------

/**
 * The gameplay half — `GameRuntimeConfig`, field for field. Bounds are NOT
 * here: a `v.number()` is a type, and the ranges live in the one declaration
 * each half has, enforced by `validateGameConfig` inside the mutation that
 * writes (`game-configuration/parameter-bounds-sourcing`).
 */
export const gameplayConfig = v.object({
  maxHealth: v.number(),
  maxTurns: v.number(),
  maxGameDurationMs: v.number(),
  hazardDamage: v.number(),
  foodSpawnRate: v.number(),
  invulnPotionSpawnRate: v.number(),
  invisPotionSpawnRate: v.number(),
  clock: v.object({
    initialBudgetMs: v.number(),
    budgetIncrementMs: v.number(),
    firstTurnTimeMs: v.number(),
    maxTurnTimeMs: v.number(),
  }),
});

/** The board-generation half — this capability's own declaration. */
// spec: game-configuration/generation-parameters
export const generationConfig = v.object({
  boardSize: v.number(),
  snakesPerTeam: v.number(),
  hazardPercentage: v.number(),
  fertileGround: v.object({ density: v.number(), clustering: v.number() }),
});

/** A game's whole configuration: the two halves, and nothing else. */
export const gameConfig = v.object({ generation: generationConfig, runtime: gameplayConfig });

const cell = v.object({ x: v.number(), y: v.number() });

/**
 * The board preview as generation produced it — the wire contract for
 * `@cyphid/snek-game-configuration`'s `previewDocument`, whose output is the
 * only thing ever written here (`schema.mirror.test.ts` holds the two to the
 * same fields). Tagged, so the one preview slot can also hold the structured
 * reason generation gave up.
 *
 * The branded scalars of the engine's domain (`SnakeId`, `CentaurTeamId`,
 * `TurnNumber`, the `CellType`/`ItemType`/`Direction` enums) are numbers and
 * strings at runtime; a validator has no brands to carry, so they appear here
 * as what they are on the wire.
 *
 * spec: game-configuration/board-preview
 */
export const generatedBoardPreview = v.object({
  kind: v.literal("generated"),
  board: v.object({ boardSize: v.number(), cells: v.array(v.number()) }),
  snakes: v.array(
    v.object({
      snakeId: v.number(),
      letter: v.string(),
      centaurTeamId: v.string(),
      health: v.number(),
      activeEffects: v.array(
        v.object({
          family: v.union(v.literal("invulnerability"), v.literal("invisibility")),
          state: v.union(v.literal("buff"), v.literal("debuff")),
          expiryTurn: v.number(),
        }),
      ),
      alive: v.boolean(),
      turn: v.number(),
      body: v.array(cell),
      lastDirection: v.union(v.number(), v.null()),
    }),
  ),
  items: v.array(
    v.object({
      itemType: v.number(),
      spawnTurn: v.number(),
      spawnIndex: v.number(),
      cell,
    }),
  ),
});

/**
 * Why generation gave up, after its bounded retry — the same structured
 * failure the generator returns, stored so it reaches the configuring user
 * reactively through the ordinary preview delivery rather than as a
 * transport-level error nobody can render.
 *
 * spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
 */
export const boardInfeasibility = v.object({
  kind: v.literal("infeasible"),
  code: v.union(
    v.literal("HAZARD_CONNECTIVITY"),
    v.literal("TERRITORY_PARITY_SHORTAGE"),
    v.literal("INITIAL_FOOD_SHORTAGE"),
  ),
  attemptsUsed: v.number(),
  details: v.object({
    centaurTeamId: v.optional(v.string()),
    innerCellCount: v.number(),
    eligibleCellCount: v.optional(v.number()),
  }),
});

/**
 * The game's ONE current-preview value: the latest candidate, the structured
 * reason there is none, or nothing generated yet. Overwritten by every
 * regeneration — prior candidates are not retained, so exploring candidates
 * writes no history the product never wanted recorded.
 *
 * spec: game-configuration/board-preview#one-slot-no-archive
 */
export const boardPreview = v.union(generatedBoardPreview, boardInfeasibility, v.null());

export default defineSchema({
  // spec: identity-and-authorization/trusted-issuer-registry
  trusted_issuers: defineTable(issuerRegistration).index("by_issuer", ["issuerId"]),

  // Single-use, guarded transactionally — how `by_assertion` makes two
  // concurrent presentations refusable is `claimAssertionId`'s comment in
  // `functions.ts`, where the read-and-insert lives.
  // spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
  accepted_assertions: defineTable({ assertionId: v.string(), expiresAt: v.number() })
    .index("by_assertion", ["assertionId"])
    .index("by_expiry", ["expiresAt"]),

  // There is no `redeemedAt`: redemption deletes the row, so single-use is the
  // same read-then-write guard as `accepted_assertions` and there is no second
  // state anyone has to remember to check. `challenge` is required, not
  // optional, and that is a security property rather than tidiness — a row
  // without one would be a reference redeemable by anything the Server has,
  // which is design.md's "removing the assertion path is a security property"
  // argument; how it is checked is `redeemHandoff`'s comment in `functions.ts`.
  // It is compared and never returned.
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

  // The game record, in its minimal form: the game's identity, the two fields
  // token issuance reads, and the configuration this capability owns. There is
  // no second record keyed to the game — the capabilities that own the rest of
  // a game's life (migrate-game-lifecycle, which owns `status`, launch and
  // succession) extend this same one. `roster` is stored *in the game record*
  // rather than joined onto team records, so there is no path from here back to
  // `centaur_teams` to follow.
  //
  // `boardSeed` is the seed every random choice generation makes is drawn from,
  // and **no query returns it**: `gameConfiguration` below selects the three
  // fields a configuration surface reads and this is not among them.
  // spec: identity-and-authorization/live-game-issuance
  // spec: identity-and-authorization/roster-snapshot-binding#running-game-reads-only-the-snapshot
  // spec: game-configuration/config-lives-on-the-game#the-game-record-starts-minimal
  // spec: game-configuration/board-generation-retry
  games: defineTable({
    status: gameStatus,
    roster: v.array(participantSnapshot),
    config: gameConfig,
    boardPreview,
    boardPreviewLocked: v.boolean(),
    boardSeed: v.optional(v.bytes()),
  }),

  // NEIGHBOURING. migrate-team-management owns this table and will grow it; the
  // one field here is the domain of the server operating the team, which
  // issuance needs to decide that a Server asking for a team's game credential
  // is that team's. A team's identity is the record's own `_id`, and the domain
  // is an ordinary mutable column of it.
  // spec: identity-and-authorization/identity-kinds#server-domain-is-not-identity
  centaur_teams: defineTable({ serverDomain: v.union(v.string(), v.null()) }),
});
