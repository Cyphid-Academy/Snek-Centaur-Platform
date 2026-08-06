#!/usr/bin/env node
// Seat a human in the demo's game, and re-seed both snapshots that decide what
// they may do — `node scripts/demo-stack/roster.mjs --seat=<userId>[:<name>]`.
//
// **This is the one write path for roster state**, called by the play page's
// server when somebody signs in and by `seed.mjs` for manual seeding. Both
// snapshots are written here, in this order and in one process, because they
// answer two halves of the same question and must not disagree: the platform's
// roster snapshot decides who may be *issued* an operator token, and the
// instance's seeded snapshot decides who may be *admitted* on one. A seat
// recorded in only one of them is a player who is refused at whichever end was
// missed.
//
// It prints the resulting world as JSON on stdout, which is how the caller
// learns which team the player was seated on.
import { origins, platformTarget, readWorld, seatPlayer, seedInstance, seedWorld } from "./lib.mjs";
import { adminKey, backendBinary } from "./lib.mjs";

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

if (args["seat"]) {
  const [userId, ...name] = args["seat"].split(":");
  if (!userId) throw new Error("--seat needs a user id");
  seatPlayer(players, userId, name.join(":") || undefined);
}
if (args["admin"]) admins.push(args["admin"]);

const seeded = seedWorld(auth, origins(target).appOrigin, { players, admins });
seedInstance(seeded, target);
console.log(JSON.stringify(seeded));
