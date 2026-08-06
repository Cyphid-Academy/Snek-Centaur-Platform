// The demo's seating desk: who is playing, and how a human gets a seat.
//
// **All of this is demo scaffolding**, and it stands in for two capabilities
// that have no implementation yet — `team-management`, where a captain adds a
// member to a team, and `game-lifecycle`, where a game is created and takes the
// roster snapshot that binds it. Until those land there is no way for a human
// to become eligible to play, so the demo does the one thing it can: it treats
// signing in as joining, and re-seeds both snapshots through the stack's own
// operator path.
//
// What it deliberately does *not* do is decide anything about authorization.
// Being seated is what makes the platform willing to issue an operator token
// and the game instance willing to admit one; neither answer is given here, and
// this server holds nothing that could forge either.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** How long a seating run may take before it is abandoned. */
const SEAT_TIMEOUT_MS = 120_000;

/** One team of the demo world, as the platform recorded it. */
export interface WorldTeam {
  readonly label: string;
  readonly teamId: string;
}

/** A seated human. `name` is whatever the provider told the platform. */
export interface WorldPlayer {
  readonly userId: string;
  readonly name?: string;
  readonly team: string;
}

/** The demo world: the teams, the game being played, and who is seated where. */
export interface World {
  readonly teams: ReadonlyArray<WorldTeam>;
  readonly game: { readonly gameId: string; readonly status: string };
  readonly players: ReadonlyArray<WorldPlayer>;
  readonly admins: ReadonlyArray<string>;
}

/**
 * Where the stack wrote the world, and where its seating script lives.
 *
 * Both absent is the ordinary state of a fork of this app: it is a Snek Centaur
 * Server, not a demo stack, so the play page's seating surface answers that
 * there is nothing here to seat anyone in rather than failing.
 */
const worldFile = (): string | undefined => process.env["SNEK_WORLD_FILE"];
const rosterScript = (): string | undefined => {
  const root = process.env["SNEK_REPO_ROOT"];
  return root ? join(root, "scripts", "demo-stack", "roster.mjs") : undefined;
};

export const demoStackPresent = (): boolean =>
  worldFile() !== undefined && rosterScript() !== undefined;

export function readWorld(): World | null {
  const path = worldFile();
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as World;
  } catch {
    return null;
  }
}

/**
 * Seating runs one at a time.
 *
 * Two people signing in together would otherwise run two seatings at once, and
 * each reads the world, adds its own player and writes the result — so the
 * second to finish would erase the first's seat. The queue is this process's
 * alone, which is enough because this process is the only caller.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  // The queue must survive a failed run, so it advances on the settled result
  // rather than on `next` itself.
  queue = next.catch(() => undefined);
  return next;
}

/**
 * Seat this human — on whichever team has fewer players — and answer with the
 * world their seat is now part of. Seating somebody already seated changes
 * nothing and returns the same answer, so a page may say hello as often as it
 * likes.
 *
 * The work is the stack's `roster.mjs`, run as a child process. That script is
 * the one write path for roster state: it writes the platform's roster snapshot
 * and the instance's seeded snapshot in one pass, so the two cannot disagree
 * about who is playing. Reaching it by process rather than by importing the
 * seeding code keeps this app free of any credential — the deployment's admin
 * key stays in the stack's environment, and this server never sees it.
 */
export function seat(userId: string, name?: string): Promise<World> {
  const script = rosterScript();
  if (!script) throw new Error("no demo stack is running here");
  // The name rides in the argument after a colon, so a name containing one is
  // rejoined by the script rather than truncated.
  const seatArg = `--seat=${userId}${name ? `:${name}` : ""}`;
  return serialized(async () => {
    const { stdout } = await execFileAsync("node", [script, seatArg], {
      cwd: process.env["SNEK_REPO_ROOT"],
      timeout: SEAT_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    // The script prints the world as its last line; anything before it is the
    // Convex CLI's own chatter.
    const printed = stdout.trim().split("\n").at(-1) ?? "";
    return JSON.parse(printed) as World;
  });
}

/** The team a seated human plays for, or `undefined` if they hold no seat. */
export const teamOf = (world: World | null, userId: string): string | undefined =>
  world?.players.find((player) => player.userId === userId)?.team;
