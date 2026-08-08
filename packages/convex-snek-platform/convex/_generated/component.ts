/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    functions: {
      actionsTakenFor: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{ at: number; capability: string; issuerId: string }>,
        Name
      >;
      claimAssertionId: FunctionReference<
        "mutation",
        "internal",
        { assertionId: string; expiresAt: number },
        boolean,
        Name
      >;
      createGame: FunctionReference<
        "mutation",
        "internal",
        {
          roster?: Array<{
            coachUserIds: Array<string>;
            memberUserIds: Array<string>;
            teamId: string;
          }>;
        },
        string,
        Name
      >;
      createHandoff: FunctionReference<
        "mutation",
        "internal",
        {
          challenge: string;
          expiresAt: number;
          issuerId: string;
          reference: string;
          userId: string;
        },
        null,
        Name
      >;
      designateAdmin: FunctionReference<
        "mutation",
        "internal",
        { designated: boolean; userId: string },
        null,
        Name
      >;
      gameConfiguration: FunctionReference<
        "query",
        "internal",
        { gameId: string },
        {
          boardPreview:
            | {
                board: { boardSize: number; cells: Array<number> };
                items: Array<{
                  cell: { x: number; y: number };
                  itemType: number;
                  spawnIndex: number;
                  spawnTurn: number;
                }>;
                kind: "generated";
                snakes: Array<{
                  activeEffects: Array<{
                    expiryTurn: number;
                    family: "invulnerability" | "invisibility";
                    state: "buff" | "debuff";
                  }>;
                  alive: boolean;
                  body: Array<{ x: number; y: number }>;
                  centaurTeamId: string;
                  health: number;
                  lastDirection: number | null;
                  letter: string;
                  snakeId: number;
                  turn: number;
                }>;
              }
            | {
                attemptsUsed: number;
                code:
                  | "HAZARD_CONNECTIVITY"
                  | "TERRITORY_PARITY_SHORTAGE"
                  | "INITIAL_FOOD_SHORTAGE";
                details: {
                  centaurTeamId?: string;
                  eligibleCellCount?: number;
                  innerCellCount: number;
                };
                kind: "infeasible";
              }
            | null;
          boardPreviewLocked: boolean;
          config: {
            generation: {
              boardSize: number;
              fertileGround: { clustering: number; density: number };
              hazardPercentage: number;
              snakesPerTeam: number;
            };
            runtime: {
              clock: {
                budgetIncrementMs: number;
                firstTurnTimeMs: number;
                initialBudgetMs: number;
                maxTurnTimeMs: number;
              };
              foodSpawnRate: number;
              hazardDamage: number;
              invisPotionSpawnRate: number;
              invulnPotionSpawnRate: number;
              maxGameDurationMs: number;
              maxHealth: number;
              maxTurns: number;
            };
          };
        } | null,
        Name
      >;
      gameForConfiguration: FunctionReference<
        "query",
        "internal",
        { gameId: string },
        {
          boardPreviewLocked: boolean;
          config: {
            generation: {
              boardSize: number;
              fertileGround: { clustering: number; density: number };
              hazardPercentage: number;
              snakesPerTeam: number;
            };
            runtime: {
              clock: {
                budgetIncrementMs: number;
                firstTurnTimeMs: number;
                initialBudgetMs: number;
                maxTurnTimeMs: number;
              };
              foodSpawnRate: number;
              hazardDamage: number;
              invisPotionSpawnRate: number;
              invulnPotionSpawnRate: number;
              maxGameDurationMs: number;
              maxHealth: number;
              maxTurns: number;
            };
          };
          roster: Array<{
            coachUserIds: Array<string>;
            memberUserIds: Array<string>;
            teamId: string;
          }>;
          status: "not-started" | "playing" | "finished";
        } | null,
        Name
      >;
      gameForIssuance: FunctionReference<
        "query",
        "internal",
        { gameId: string },
        {
          gameId: string;
          roster: Array<{
            coachUserIds: Array<string>;
            memberUserIds: Array<string>;
            teamId: string;
          }>;
          status: "not-started" | "playing" | "finished";
        } | null,
        Name
      >;
      isPlatformAdmin: FunctionReference<
        "query",
        "internal",
        { userId: string },
        boolean,
        Name
      >;
      issuer: FunctionReference<
        "query",
        "internal",
        { issuerId: string },
        {
          capabilityCeiling: Array<string>;
          issuerId: string;
          returnAddresses: Array<string>;
          verificationMaterialUrl: string;
        } | null,
        Name
      >;
      recordAttribution: FunctionReference<
        "mutation",
        "internal",
        {
          capability: string;
          expiresAt: number;
          issuerId: string;
          userId: string;
        },
        null,
        Name
      >;
      redeemHandoff: FunctionReference<
        "mutation",
        "internal",
        { proof: string; reference: string },
        { expiresAt: number; issuerId: string; userId: string } | null,
        Name
      >;
      registerIssuer: FunctionReference<
        "mutation",
        "internal",
        {
          capabilityCeiling: Array<string>;
          issuerId: string;
          returnAddresses: Array<string>;
          verificationMaterialUrl: string;
        },
        null,
        Name
      >;
      setConfiguration: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            generation: {
              boardSize: number;
              fertileGround: { clustering: number; density: number };
              hazardPercentage: number;
              snakesPerTeam: number;
            };
            runtime: {
              clock: {
                budgetIncrementMs: number;
                firstTurnTimeMs: number;
                initialBudgetMs: number;
                maxTurnTimeMs: number;
              };
              foodSpawnRate: number;
              hazardDamage: number;
              invisPotionSpawnRate: number;
              invulnPotionSpawnRate: number;
              maxGameDurationMs: number;
              maxHealth: number;
              maxTurns: number;
            };
          };
          gameId: string;
        },
        null,
        Name
      >;
      setConfigurationAndPreview: FunctionReference<
        "mutation",
        "internal",
        {
          boardPreview:
            | {
                board: { boardSize: number; cells: Array<number> };
                items: Array<{
                  cell: { x: number; y: number };
                  itemType: number;
                  spawnIndex: number;
                  spawnTurn: number;
                }>;
                kind: "generated";
                snakes: Array<{
                  activeEffects: Array<{
                    expiryTurn: number;
                    family: "invulnerability" | "invisibility";
                    state: "buff" | "debuff";
                  }>;
                  alive: boolean;
                  body: Array<{ x: number; y: number }>;
                  centaurTeamId: string;
                  health: number;
                  lastDirection: number | null;
                  letter: string;
                  snakeId: number;
                  turn: number;
                }>;
              }
            | {
                attemptsUsed: number;
                code:
                  | "HAZARD_CONNECTIVITY"
                  | "TERRITORY_PARITY_SHORTAGE"
                  | "INITIAL_FOOD_SHORTAGE";
                details: {
                  centaurTeamId?: string;
                  eligibleCellCount?: number;
                  innerCellCount: number;
                };
                kind: "infeasible";
              }
            | null;
          boardSeed: ArrayBuffer;
          config: {
            generation: {
              boardSize: number;
              fertileGround: { clustering: number; density: number };
              hazardPercentage: number;
              snakesPerTeam: number;
            };
            runtime: {
              clock: {
                budgetIncrementMs: number;
                firstTurnTimeMs: number;
                initialBudgetMs: number;
                maxTurnTimeMs: number;
              };
              foodSpawnRate: number;
              hazardDamage: number;
              invisPotionSpawnRate: number;
              invulnPotionSpawnRate: number;
              maxGameDurationMs: number;
              maxHealth: number;
              maxTurns: number;
            };
          };
          gameId: string;
        },
        null,
        Name
      >;
      setPreviewLock: FunctionReference<
        "mutation",
        "internal",
        { gameId: string; locked: boolean },
        null,
        Name
      >;
      status: FunctionReference<"query", "internal", {}, string, Name>;
      sweepExpired: FunctionReference<
        "mutation",
        "internal",
        { now: number },
        number,
        Name
      >;
      team: FunctionReference<
        "query",
        "internal",
        { teamId: string },
        { serverDomain: string | null } | null,
        Name
      >;
    };
  };
