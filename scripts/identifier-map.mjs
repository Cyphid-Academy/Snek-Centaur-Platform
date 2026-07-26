// Identifier-map schema rules (legacy-spec-archive/maps/identifier-map.json).
//
// Every entry records its homes as a `carriedBy` array — one element per place
// the legacy id's substance now lives, each naming the requirement (`target`,
// optional) and the change that authored it (`change`). `disposition` says WHAT
// became of the id and constrains that array:
//
//   authored  — substance is one or more capability requirements: at least one
//               home, and every home names a resolving target.
//   mechanism — deliberately not a requirement, it lives in code: any number of
//               homes (a target where a requirement carries part of the intent,
//               none when it is pure code), and `reason` is mandatory.
//   dropped   — carried nowhere at all: `carriedBy` MUST be empty and `reason`
//               is mandatory. Nothing carries a dropped id — if its intent
//               survives anywhere, it is `mechanism`, not `dropped`. The
//               deciding authority for a drop is the legacy review item, which
//               the reason names.
//
// Review entries carry `carriedBy` for attribution but no disposition: a review
// item's substance is by construction folded into the scenarios it lists, so a
// disposition would be the same value on every entry and carry no information.
export const DISPOSITIONS = ["authored", "mechanism", "dropped"];

/**
 * Problems with one map entry, as human-readable strings. `resolves(ref)` and
 * `changeResolves(name)` are injected so this stays pure; `kind` is
 * "requirement" (disposition enforced) or "review" (attribution only).
 */
export function entryProblems(id, entry, { resolves, changeResolves, kind = "requirement" }) {
  const problems = [];
  const p = (msg) => problems.push(`identifier-map.json: ${id} ${msg}`);
  const homes = entry.carriedBy;
  if (!Array.isArray(homes)) {
    p("has no carriedBy array");
    return problems;
  }
  for (const h of homes) {
    if (h.target && !resolves(h.target)) p(`carriedBy target "${h.target}" does not resolve`);
    if (!h.change) p("carriedBy element has no change");
    else if (!changeResolves(h.change))
      p(`carriedBy change "${h.change}" matches no open change or archive folder`);
  }
  for (const sc of entry.scenarios ?? [])
    if (!resolves(sc)) p(`scenario anchor "${sc}" does not resolve`);
  if (kind !== "requirement") return problems;

  const d = entry.disposition;
  if (!DISPOSITIONS.includes(d)) {
    p(`disposition "${d}" is not one of ${DISPOSITIONS.join(", ")}`);
    return problems;
  }
  if (d === "authored") {
    if (homes.length === 0) p("is authored but names no home in carriedBy");
    for (const h of homes) if (!h.target) p("is authored but a carriedBy element has no target");
  }
  if (d === "dropped" && homes.length > 0)
    p(
      'is dropped but carriedBy is non-empty — nothing carries a dropped id; use "mechanism" if its intent survives somewhere',
    );
  if (d !== "authored" && !entry.reason) p(`is ${d} and must carry a "reason" explaining why`);
  return problems;
}

/** The entry's first home with a target — what a stale numeric citation points at. */
export function primaryTarget(entry) {
  return (entry.carriedBy ?? []).find((h) => h.target)?.target ?? null;
}
