// Shared fast-check arbitraries for the generation property suite.
//
// Configuration parameters are generated from their FULL documented ranges
// (game-configuration/generation-parameters, mirrored in GENERATION_RANGES):
// fast-check biases toward range boundaries, so narrowing ranges by hand hides
// exactly the extreme cases property testing is best at finding. Not part of
// the package's public API.
import type { GameRuntimeConfig } from "@cyphid/snek-engine";
import { DEFAULT_RUNTIME_CONFIG } from "@cyphid/snek-engine";
import * as fc from "fast-check";
import type { BoardGenerationConfig, GameConfig } from "./config.js";
import { tid } from "./testkit.js";

// Full documented generation-parameter ranges.
// spec: game-configuration/generation-parameters
export const GENERATION_RANGES = {
  boardSize: { min: 7, max: 32 },
  snakesPerTeam: { min: 1, max: 10 },
  hazardPercentage: { min: 0, max: 30 },
  fertileDensity: { min: 0, max: 90 },
  fertileClustering: { min: 1, max: 20 },
} as const;

const int = (r: { min: number; max: number }) => fc.integer({ min: r.min, max: r.max });

export const generationConfigArb: fc.Arbitrary<BoardGenerationConfig> = fc.record({
  boardSize: int(GENERATION_RANGES.boardSize),
  snakesPerTeam: int(GENERATION_RANGES.snakesPerTeam),
  hazardPercentage: int(GENERATION_RANGES.hazardPercentage),
  fertileGround: fc.record({
    density: int(GENERATION_RANGES.fertileDensity),
    clustering: int(GENERATION_RANGES.fertileClustering),
  }),
});

// Generation reads exactly one gameplay parameter — `maxHealth`, which the
// snakes it places are initialised to — so that is the only one worth varying
// here. spec: game-configuration/initial-snakes
export const runtimeConfigArb: fc.Arbitrary<GameRuntimeConfig> = fc
  .integer({ min: 1, max: 500 })
  .map((maxHealth) => ({ ...DEFAULT_RUNTIME_CONFIG, maxHealth }));

export const gameConfigArb: fc.Arbitrary<GameConfig> = fc.record({
  generation: generationConfigArb,
  runtime: runtimeConfigArb,
});

/** Any 32-byte game seed — not just the fill-byte seeds of testkit's seed(). */
export const gameSeedArb: fc.Arbitrary<Uint8Array> = fc.uint8Array({
  minLength: 32,
  maxLength: 32,
});

// Team count is not a configuration parameter (teams are registrations);
// the supported range exercised by the suites is 2-6 teams.
export const TEAM_POOL = ["red", "blue", "green", "gold", "violet", "cyan"].map((name) => ({
  centaurTeamId: tid(name),
  name: name[0]?.toUpperCase() + name.slice(1),
}));
export const teamsArb = fc
  .integer({ min: 2, max: TEAM_POOL.length })
  .map((n) => TEAM_POOL.slice(0, n));
