// The turn's claim sets. spec: 01 §2.8 — interaction rules are pure
// functions that only ever ADD claims here; the commit is the sole reader
// that turns claims into state. No rule can observe another rule's
// committed effect, which is what makes rule evaluation order-free.
import type {
  Cell,
  CellIndex,
  CentaurTeamId,
  DamageSource,
  DeathCause,
  EffectFamily,
  ItemId,
  ItemType,
  SnakeId,
} from "../types.js";

// spec: 01 §2.7 disruption claims — read by the derived cancellation rule.
export type DisruptionCause =
  | "wall_death"
  | "self_death"
  | "body_collision_death"
  | "severed"
  | "severing_other"
  | "body_collision_received"
  | "head_to_head_death"
  | "hazard_entry"
  | "health_depletion";

export interface CertainDeathClaim {
  readonly cause: Exclude<DeathCause, "health_depletion">;
  readonly killer: SnakeId | null;
}

export interface DamageClaim {
  readonly amount: number;
  readonly source: DamageSource;
}

export interface SeverRecord {
  readonly attackerSnakeId: SnakeId;
  readonly victimSnakeId: SnakeId;
  readonly contactCell: Cell;
  readonly segmentsLost: number;
}

export interface RebuildClaim {
  readonly team: CentaurTeamId;
  readonly family: EffectFamily;
  readonly collectorIds: Set<SnakeId>;
}

export interface PotionCollection {
  readonly snakeId: SnakeId;
  readonly itemId: ItemId;
  readonly cell: Cell;
  readonly potionType: typeof ItemType.InvulnPotion | typeof ItemType.InvisPotion;
  readonly family: EffectFamily;
}

// spec: 01-REQ-046c, 01-REQ-047 — the commit removes the entry from the
// present-items map (01-REQ-007); rules never write it.
export interface ConsumptionClaim {
  readonly itemId: ItemId;
  readonly cellIndex: CellIndex;
}

export interface CancelPair {
  readonly team: CentaurTeamId;
  readonly family: EffectFamily;
}

export const teamFamilyKey = (team: CentaurTeamId, family: EffectFamily): string =>
  `${team} ${family}`;

// Canonical DamageSource reporting order (see damageSources()).
const DAMAGE_SOURCE_ORDER: ReadonlyArray<DamageSource> = ["tick", "hazard"];

export class ClaimSet {
  private readonly certainDeathMap = new Map<SnakeId, CertainDeathClaim[]>();
  private readonly damageMap = new Map<SnakeId, DamageClaim[]>();
  private readonly healed = new Set<SnakeId>();
  private readonly grown = new Set<SnakeId>();
  private readonly severMinIndex = new Map<SnakeId, number>();
  readonly severRecords: SeverRecord[] = [];
  readonly disruptions: Array<{ readonly snakeId: SnakeId; readonly cause: DisruptionCause }> = [];
  private readonly rebuildMap = new Map<string, RebuildClaim>();
  readonly potionCollections: PotionCollection[] = [];
  readonly foodEaten = new Map<SnakeId, { readonly cell: Cell; readonly itemId: ItemId }>();
  private readonly consumptionList: ConsumptionClaim[] = [];
  // Derived-stage outputs (01 §2.8 stage 4) — still claims, written before
  // the commit runs.
  private readonly resolvedHealthMap = new Map<SnakeId, number>();
  private readonly healthDeathMap = new Map<SnakeId, ReadonlyArray<DamageSource>>();
  private readonly cancelKeys = new Set<string>();
  private readonly cancelPairs: CancelPair[] = [];

  // ---- recording (interaction rules) ----

  certainDeath(id: SnakeId, claim: CertainDeathClaim, disruption: DisruptionCause): void {
    const list = this.certainDeathMap.get(id);
    if (list === undefined) this.certainDeathMap.set(id, [claim]);
    else list.push(claim);
    this.disrupt(id, disruption);
  }

  damage(id: SnakeId, amount: number, source: DamageSource): void {
    const list = this.damageMap.get(id);
    if (list === undefined) this.damageMap.set(id, [{ amount, source }]);
    else list.push({ amount, source });
  }

  disrupt(id: SnakeId, cause: DisruptionCause): void {
    this.disruptions.push({ snakeId: id, cause });
  }

  heal(id: SnakeId): void {
    this.healed.add(id);
  }

  grow(id: SnakeId): void {
    this.grown.add(id);
  }

  // Multiple attackers severing one victim collapse to the head-closest
  // (minimum) contact index; every pair still gets its own record/event.
  // spec: 01-REQ-044c
  sever(record: SeverRecord, contactIndex: number): void {
    const prev = this.severMinIndex.get(record.victimSnakeId);
    this.severMinIndex.set(
      record.victimSnakeId,
      prev === undefined ? contactIndex : Math.min(prev, contactIndex),
    );
    this.severRecords.push(record);
    this.disrupt(record.attackerSnakeId, "severing_other");
    this.disrupt(record.victimSnakeId, "severed");
  }

  consume(itemId: ItemId, cellIndex: CellIndex): void {
    this.consumptionList.push({ itemId, cellIndex });
  }

  eatFood(id: SnakeId, cell: Cell, itemId: ItemId): void {
    this.healed.add(id);
    this.grown.add(id);
    this.foodEaten.set(id, { cell, itemId });
  }

  collectPotion(team: CentaurTeamId, collection: PotionCollection): void {
    const key = teamFamilyKey(team, collection.family);
    let rebuild = this.rebuildMap.get(key);
    if (rebuild === undefined) {
      rebuild = { team, family: collection.family, collectorIds: new Set() };
      this.rebuildMap.set(key, rebuild);
    }
    rebuild.collectorIds.add(collection.snakeId);
    this.potionCollections.push(collection);
  }

  // ---- recording (derived rules) ----

  setResolvedHealth(id: SnakeId, health: number): void {
    this.resolvedHealthMap.set(id, health);
  }

  healthDeath(id: SnakeId, sources: ReadonlyArray<DamageSource>): void {
    this.healthDeathMap.set(id, sources);
    this.disrupt(id, "health_depletion");
  }

  cancelFamily(team: CentaurTeamId, family: EffectFamily): void {
    const key = teamFamilyKey(team, family);
    if (this.cancelKeys.has(key)) return;
    this.cancelKeys.add(key);
    this.cancelPairs.push({ team, family });
  }

  // Canonical (team, family) order: cancellation claims form a set, so the
  // commit's iteration must not depend on rule evaluation order.
  cancellations(): CancelPair[] {
    return [...this.cancelPairs].sort(
      (a, b) => a.team.localeCompare(b.team) || a.family.localeCompare(b.family),
    );
  }

  // Canonical itemId order — same set discipline as cancellations().
  consumptions(): ConsumptionClaim[] {
    return [...this.consumptionList].sort((a, b) => a.itemId - b.itemId);
  }

  // ---- queries ----

  hasCertainDeath(id: SnakeId): boolean {
    return this.certainDeathMap.has(id);
  }

  certainDeathClaims(id: SnakeId): ReadonlyArray<CertainDeathClaim> {
    return this.certainDeathMap.get(id) ?? [];
  }

  diedHeadToHead(id: SnakeId): boolean {
    return this.certainDeathClaims(id).some((c) => c.cause === "head_to_head");
  }

  totalDamage(id: SnakeId): number {
    return (this.damageMap.get(id) ?? []).reduce((sum, d) => sum + d.amount, 0);
  }

  // Canonical source order: claims form a set, so reported source lists must
  // not depend on rule evaluation order (01-REQ-041 order independence).
  damageSources(id: SnakeId): DamageSource[] {
    const present = new Set((this.damageMap.get(id) ?? []).map((d) => d.source));
    return DAMAGE_SOURCE_ORDER.filter((src) => present.has(src));
  }

  hasHeal(id: SnakeId): boolean {
    return this.healed.has(id);
  }

  hasGrow(id: SnakeId): boolean {
    return this.grown.has(id);
  }

  severIndex(id: SnakeId): number | undefined {
    return this.severMinIndex.get(id);
  }

  resolvedHealth(id: SnakeId): number | undefined {
    return this.resolvedHealthMap.get(id);
  }

  healthDeathSources(id: SnakeId): ReadonlyArray<DamageSource> | undefined {
    return this.healthDeathMap.get(id);
  }

  rebuilds(): ReadonlyArray<RebuildClaim> {
    return [...this.rebuildMap.values()];
  }

  rebuildFor(team: CentaurTeamId, family: EffectFamily): RebuildClaim | undefined {
    return this.rebuildMap.get(teamFamilyKey(team, family));
  }
}
