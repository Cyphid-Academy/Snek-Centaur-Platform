// spec: centaur-server-runtime/forkable-reference-app#enumerated-surface-is-the-contract
// spec: centaur-server-runtime/forkable-reference-app#the-rest-of-the-path-space-is-the-forks
// The drift check `WELL_KNOWN_PATHS` promises and did not have.
//
// This app is the one consumer that cannot import the constant: SvelteKit
// derives a route from a *directory name*, so the tree is the declaration. Which
// is why the check belongs here — a constant a directory tree cannot import is
// one only a test can hold to account.
//
// Both directions. A missing route is a path the platform calls and nothing
// answers; an extra one under the reserved prefix is a path a fork would
// reasonably have assumed was its own.
import { WELL_KNOWN_PATHS } from "@cyphid/snek-centaur-server-lib";
import { expect, it } from "vitest";

/** What this app actually serves under the prefix, read off the route tree. */
const served = Object.keys(
  import.meta.glob("./routes/.well-known/*/+server.ts", { eager: false }),
).map((path) => path.replace(/^\.\/routes/, "").replace(/\/\+server\.ts$/, ""));

it("serves exactly the enumerated well-known surface, no more and no less", () => {
  expect(served.sort()).toEqual([...Object.values(WELL_KNOWN_PATHS)].sort());
});
