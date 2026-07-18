## 1. Capability authoring
- [x] 1.1 Author game-rules spec.md at intent grain (24 requirements, 64 scenarios) from the archived module
- [x] 1.2 Constraint-mine legacy Design/EI: #three-turn-expiry, #deterministic-order, #cross-runtime-expressibility, fertile-derivation clause on #eligibility
- [x] 1.3 Tombstone all 111 numeric identifiers via their identifier-map entries

## 2. Reference conversion
- [x] 2.1 Rewrite engine code citations to named identifiers
- [x] 2.2 Replace review-item references with encoding-scenario references
- [x] 2.3 Populate legacy-spec-archive/maps/identifier-map.json (requirements + reviews relations, provenance)

## 3. Cutover and verification
- [x] 3.1 Flip cutover table; add module 01 to the lint's migrated set
- [x] 3.2 pnpm spec:check (strict validation + reference lint) green
- [x] 3.3 Full test battery, typecheck, biome green
