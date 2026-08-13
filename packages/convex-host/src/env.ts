// spec: global-invariants/no-shared-secrets, global-invariants/credential-confinement
// The environment contract for reaching this deployment: the project ships no
// `.env.example`, so this code is the authoritative list. See
// docs/external-setup.md.
//
// Nothing here throws — reporting is separate from requiring, so a session only
// running tests or a lint is not stopped by a credential it never uses.

export interface EnvRequirement {
  /** Primary variable name. */
  readonly name: string;
  /** What breaks without it — shown in the report. */
  readonly why: string;
  /** Names that satisfy the requirement instead of `name`. */
  readonly alternatives?: ReadonlyArray<string>;
}

// What a *client* needs in order to open a connection. `CONVEX_URL` has no
// alternatives on purpose: `CONVEX_DEPLOY_KEY` and `CONVEX_DEPLOYMENT` address
// a deployment for the CLI, and neither is a URL a `ConvexClient` can be
// constructed with. Accepting them here would silence this warning in exactly
// the setup that later fails to connect — which is the case the report exists
// to catch.
export const CONVEX_CLIENT_ENV: ReadonlyArray<EnvRequirement> = [
  {
    name: "CONVEX_URL",
    why: "the deployment URL a client connects to",
  },
];

// What the Convex *CLI* needs in order to address a deployment (`convex dev`,
// `convex run`, `convex env`). Either name is genuinely sufficient here, which
// is why they are alternatives of one another rather than of `CONVEX_URL`.
export const CONVEX_CLI_ENV: ReadonlyArray<EnvRequirement> = [
  {
    name: "CONVEX_DEPLOYMENT",
    why: "the deployment the Convex CLI acts on",
    alternatives: ["CONVEX_DEPLOY_KEY"],
  },
];

/** Everything the host side of Convex needs: a client connection and CLI access. */
export const CONVEX_ENV: ReadonlyArray<EnvRequirement> = [...CONVEX_CLIENT_ENV, ...CONVEX_CLI_ENV];

// A *Convex* variable: provisioning, warm-up and teardown are the deployment's
// management relationship with the STDB host. A Centaur Server is handed a
// per-game instance address at run time and must never require this name.
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
