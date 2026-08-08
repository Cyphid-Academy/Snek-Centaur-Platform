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
