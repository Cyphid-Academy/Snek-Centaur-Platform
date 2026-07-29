// spec: global-invariants/no-shared-secrets, global-invariants/credential-confinement
// The environment contract for reaching this deployment.
//
// The project ships no `.env.example` on purpose (CLAUDE.md → "Secrets and
// third-party resources"): dev credentials live as environment variables in
// each developer's own cloud environment, not in a file in the repo. That makes
// *this code* the contract — the authoritative statement of which variables a
// session needs is the code that reads them, and a missing one has to be named
// rather than surface later as a confusing connection error.
//
// Nothing here throws. A variable is missing until someone actually reaches for
// the runtime it configures, and a local session that is only running tests, a
// lint, or the UI should not be stopped by a credential it never uses. Code
// that does reach for a runtime fails at that point, on its own terms.

export interface EnvRequirement {
  /** Primary variable name. */
  readonly name: string;
  /** What breaks without it — shown in the report. */
  readonly why: string;
  /** Names that satisfy the requirement instead of `name`. */
  readonly alternatives?: ReadonlyArray<string>;
}

export const CONVEX_ENV: ReadonlyArray<EnvRequirement> = [
  {
    name: "CONVEX_URL",
    why: "the deployment a client connects to",
    alternatives: ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT"],
  },
];

// The name is the one the platform already uses for this value — see
// docs/external-setup.md and legacy-spec-archive/spec/05-convex-platform.md,
// where it is the base URL of the STDB host both database provisioning and the
// warm-up dispatch address. Locally it is the host `pnpm dev:stdb` starts.
export const STDB_ENV: ReadonlyArray<EnvRequirement> = [
  {
    name: "STDB_MANAGEMENT_BASE_URL",
    why: "the SpacetimeDB host games are provisioned on (locally, `pnpm dev:stdb`)",
  },
];

function isSatisfied(req: EnvRequirement, env: Record<string, string | undefined>): boolean {
  if ((env[req.name] ?? "") !== "") return true;
  return (req.alternatives ?? []).some((name) => (env[name] ?? "") !== "");
}

/**
 * Which of `requirements` the environment does not satisfy.
 *
 * Reports every one at once rather than short-circuiting: naming them one per
 * run turns a two-variable setup into two failed starts. Reports only *whether*
 * a variable is set — never its value.
 */
export function missingEnv(
  requirements: ReadonlyArray<EnvRequirement>,
  env: Record<string, string | undefined> = process.env,
): ReadonlyArray<EnvRequirement> {
  return requirements.filter((req) => !isSatisfied(req, env));
}

/** A human-readable report of what `missingEnv` returned. Never prints a value. */
export function describeMissing(missing: ReadonlyArray<EnvRequirement>): string {
  const line = (req: EnvRequirement): string => {
    const alts = req.alternatives ?? [];
    const names = alts.length > 0 ? `${req.name} (or ${alts.join(", ")})` : req.name;
    return `  ${names} — ${req.why}`;
  };
  return [
    "Environment variables not set:",
    ...missing.map(line),
    "",
    "Set these in your own Claude Code cloud environment or as Replit Secrets",
    '(CLAUDE.md → "Secrets and third-party resources"). This project ships no',
    ".env.example on purpose: this list is the contract.",
  ].join("\n");
}
