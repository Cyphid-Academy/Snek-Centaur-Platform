/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as auth_credential from "../auth/credential.js";
import type * as auth_deployment from "../auth/deployment.js";
import type * as auth_eligibility from "../auth/eligibility.js";
import type * as capabilities from "../capabilities.js";
import type * as crons from "../crons.js";
import type * as gameConfiguration from "../gameConfiguration.js";
import type * as http from "../http.js";
import type * as issuance from "../issuance.js";
import type * as platform from "../platform.js";
import type * as publicFunctions from "../publicFunctions.js";
import type * as registry from "../registry.js";
import type * as signIn from "../signIn.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "auth/credential": typeof auth_credential;
  "auth/deployment": typeof auth_deployment;
  "auth/eligibility": typeof auth_eligibility;
  capabilities: typeof capabilities;
  crons: typeof crons;
  gameConfiguration: typeof gameConfiguration;
  http: typeof http;
  issuance: typeof issuance;
  platform: typeof platform;
  publicFunctions: typeof publicFunctions;
  registry: typeof registry;
  signIn: typeof signIn;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  snekPlatform: import("../../../convex-snek-platform/convex/_generated/component.js").ComponentApi<"snekPlatform">;
  centaurState: import("../../../convex-centaur-state/convex/_generated/component.js").ComponentApi<"centaurState">;
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
