#!/usr/bin/env node
// The demo world's manual controls — `pnpm demo:seed`.
//
// Ordinary play needs none of this: signing in at `/play` seats a human
// automatically, through `roster.mjs`. These are the operator acts that have no
// place on a page.
//
//   pnpm demo:seed                        re-seed both snapshots as they stand
//   pnpm demo:seed --seat=<userId>        seat a human on the emptier team
//   pnpm demo:seed --admin=<userId>       designate a platform admin
//
// A platform admin is worth seeing: the role reads everything and holds
// implicit coach standing over every team, so an admin can obtain a coach token
// for a team they were never designated a coach of — and is still refused every
// mutating operation inside the game, because a game instance honours no
// platform-side role at all.
//
// Ids are the platform's own user ids — the `user:<id>` on a credential's
// subject, minus the prefix. `/play` shows yours.
import {
  adminKey,
  backendBinary,
  origins,
  platformTarget,
  readWorld,
  seatPlayer,
  seedInstance,
  seedWorld,
} from "./lib.mjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [name, ...value] = arg.replace(/^--/, "").split("=");
      return [name, value.join("=")];
    }),
);

const target = platformTarget();
const auth = target.kind === "hosted" ? target : adminKey(await backendBinary());

const world = readWorld();
const players = world?.players ? [...world.players] : [];
const admins = world?.admins ?? [];
if (args["seat"]) seatPlayer(players, args["seat"]);
if (args["admin"]) admins.push(args["admin"]);

const seeded = seedWorld(auth, origins(target).appOrigin, { players, admins });
seedInstance(seeded, target);
console.log("[demo:seed] world:");
console.log(JSON.stringify(seeded, null, 2));
