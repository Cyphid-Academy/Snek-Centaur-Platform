// spec: centaur-server-runtime/forkable-reference-app#enumerated-surface-is-the-contract
// The drift check `WELL_KNOWN_PATHS` promises.
//
// The constant's own docstring says the three paths are read from it "rather
// than re-typing the strings, so the conformance suite and the drift check test
// what the platform actually calls" — and until now there was no drift check and
// no importer at all. Every consumer typed the strings out again, which is the
// precise thing the constant was written to prevent.
//
// This app is the one place the paths cannot be imported: SvelteKit derives a
// route from a *directory name*, so `src/routes/.well-known/snek-healthcheck/`
// is the endpoint's declaration and no constant can stand in for it. That is
// exactly why the check belongs here rather than anywhere else — a constant a
// directory tree cannot import is a constant only a test can hold to account.
// Rename a directory and the enumerated surface silently loses an endpoint; this
// fails instead.
//
// Both directions, deliberately. A missing route is a path the platform calls
// and nothing answers. An extra one under the same prefix is a path a fork
// would reasonably assume was its own to use — the converse half of the
// contract, which reserves nothing outside `/.well-known/snek-`.
// spec: centaur-server-runtime/forkable-reference-app#the-rest-of-the-path-space-is-the-forks
import { WELL_KNOWN_PATHS } from "@cyphid/snek-centaur-server-lib";
import { expect, it } from "vitest";

/**
 * The endpoints this app actually serves under the reserved prefix, read off
 * the route tree rather than listed. Eager: only the module's existence is
 * being asked about, and the glob's keys already answer that.
 */
const served = Object.keys(
  import.meta.glob("./routes/.well-known/*/+server.ts", { eager: false }),
).map((path) => path.replace(/^\.\/routes/, "").replace(/\/\+server\.ts$/, ""));

it("serves exactly the enumerated well-known surface, no more and no less", () => {
  expect(served.sort()).toEqual([...Object.values(WELL_KNOWN_PATHS)].sort());
});
