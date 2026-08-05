// What the platform console needs of the server it is served from: the two
// platform addresses from this process's environment, this server's identity
// derived from the request's own origin (as `/sign-in` derives it), where the
// game instance's host is reachable from a browser, and — where a stack script
// has recorded one — the seeded world's ids, so the console can name real
// teams and games instead of asking the operator to paste ids.
import { readFileSync } from "node:fs";
import type { PageServerLoad } from "./$types";

/** The seeded world, as `pnpm demo:seed` records it. Absent until seeding runs. */
export interface SeededWorld {
  teams: { label: string; teamId: string; serverDomain: string | null }[];
  games: { label: string; gameId: string; status: string }[];
  admins: string[];
}

function seededWorld(): SeededWorld | null {
  const path = process.env["SNEK_WORLD_FILE"];
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SeededWorld;
  } catch {
    return null;
  }
}

export const load: PageServerLoad = ({ url }) => ({
  convexUrl: process.env["CONVEX_URL"] ?? "",
  convexSiteUrl: process.env["CONVEX_SITE_URL"] ?? "",
  issuerId: url.origin,
  returnAddress: `${url.origin}/console`,
  /** Where a browser reaches the SpacetimeDB host (the external address on Replit). */
  stdbUrl: process.env["SNEK_STDB_URL"] ?? "http://127.0.0.1:3000",
  stdbDatabase: process.env["SNEK_STDB_DATABASE"] ?? "snek-local",
  world: seededWorld(),
});
