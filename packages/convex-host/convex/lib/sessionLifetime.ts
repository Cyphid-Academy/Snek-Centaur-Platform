// Session lifetime as a deployment configuration, floored in code.
// spec: identity-and-authorization/google-sign-in#session-lifetime-is-configured-above-a-floor

/**
 * The four-hour floor: a session may be configured to any length at or
 * above it — comfortably longer than a single sitting, so a session never
 * lapses mid-use — while a deployment stays free to keep the session short,
 * shrinking the standing exposure of the one durable credential for free.
 */
export const SESSION_LIFETIME_FLOOR_SECONDS = 4 * 60 * 60;

/** Seven days: the default when a deployment configures nothing. */
export const DEFAULT_SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

/**
 * Read the configured session lifetime (env `SESSION_LIFETIME_SECONDS`),
 * defaulting to seven days. A configuration below the four-hour floor
 * THROWS at construction rather than being clamped: silently widening a
 * value the operator chose would hide the misconfiguration, and silently
 * honouring it would let a session expire under a live sitting.
 */
export function sessionLifetimeSeconds(explicit?: string): number {
  const { SESSION_LIFETIME_SECONDS } = process.env;
  const raw = explicit ?? SESSION_LIFETIME_SECONDS;
  if (raw === undefined || raw === "") {
    return DEFAULT_SESSION_LIFETIME_SECONDS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `SESSION_LIFETIME_SECONDS must be a positive integer number of seconds, got "${raw}"`,
    );
  }
  if (parsed < SESSION_LIFETIME_FLOOR_SECONDS) {
    // spec: identity-and-authorization/google-sign-in#session-lifetime-is-configured-above-a-floor
    throw new Error(
      `SESSION_LIFETIME_SECONDS=${parsed} is below the four-hour floor ` +
        `(${SESSION_LIFETIME_FLOOR_SECONDS} seconds): a session must never lapse mid-sitting`,
    );
  }
  return parsed;
}
