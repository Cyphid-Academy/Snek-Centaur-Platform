#!/usr/bin/env node
// Re-seed the identity demo's world around real humans — `pnpm demo:seed`.
//
// Run while the stack (`pnpm demo`) is up. Sign in first; the console shows
// your platform user id and this exact command.
//
//   pnpm demo:seed --member=<userId>   put this human on team Alpha's roster
//   pnpm demo:seed --coach=<userId>    designate them a coach of team Alpha
//   pnpm demo:seed --admin=<userId>    designate them a platform admin
//
// Flags combine. Ids are the platform's own user ids (`user:<id>` on a
// credential's subject, minus the prefix).
import { adminKey, backendBinary, origins, seedWorld } from "./lib.mjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [name, value] = arg.replace(/^--/, "").split("=");
      return [name, value ?? ""];
    }),
);

const key = adminKey(await backendBinary());
const world = seedWorld(key, origins().appOrigin, {
  member: args["member"],
  coach: args["coach"],
  admin: args["admin"],
});
console.log("[demo:seed] world:");
console.log(JSON.stringify(world, null, 2));
