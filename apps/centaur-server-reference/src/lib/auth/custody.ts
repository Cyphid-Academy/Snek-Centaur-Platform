// Client credential custody: the closure that holds the working
// credential a page presents to the platform, renews it proactively in
// the background, and never lets its plaintext escape.
//
// THIS MODULE + ITS TESTS ARE THIS CHANGE'S CLIENT DELIVERABLE. It is
// deliberately NOT wired into any page or route: the sign-in UX (the
// handoff redirect, the verifier in session storage, the renewal
// credential obtained at redemption) belongs to later stories. Per
// design.md ("The client's credential architecture"), "the client custody
// shape below is what the reference app's sign-in route must realise" —
// that route, when it lands, constructs this custody with a `renew` that
// carries the in-memory renewal credential, and everything below already
// discharges the custody requirements it must satisfy.
// design: openspec/changes/migrate-identity-and-authorization/design.md
//        ("The client's credential architecture: an in-memory session,
//         concealed, refreshed in the background")
//
// CONCEALMENT IS THE POINT, not an implementation nicety. The credential
// lives in this factory's closure and nowhere else:
//   - never written to localStorage/sessionStorage or any other storage,
//     never placed in a URL — the module performs no storage access at all
//     (spec: identity-and-authorization/client-credential-custody#memory-only);
//   - never assigned to globalThis, window, or any well-known property a
//     passive sweep could enumerate — a co-resident script that did not
//     subvert this module's code path finds nothing, because memory a
//     passive read reaches is localStorage's exposure by another name
//     (spec: identity-and-authorization/client-credential-custody#concealed-from-co-resident-scripts);
//   - reachable only through the code path that uses it: `authorizedFetch`
//     injects the Authorization header inside the closure, and no public
//     member returns, logs, or displays credential plaintext.
//     spec: global-invariants/credential-confinement

/** What a successful renewal yields. Consumed inside the closure; never re-exposed. */
export interface RenewedCredential {
  readonly workingCredential: string;
  readonly expiresAtMs: number;
}

/**
 * The custody's collaborators, all injectable so tests drive time and
 * renewal deterministically.
 *
 * `renew` obtains a fresh working credential under the session — in
 * production, a background fetch carrying the page's in-memory renewal
 * credential. It resolves `null` when the platform ANSWERED and refused —
 * the underlying session has ended, so nothing further is mintable in the
 * human's name (spec: identity-and-authorization/token-lifetime-and-refresh
 * #renewal-re-reads-the-session) — and REJECTS when the platform could not
 * be reached at all, which is the retryable case.
 */
export interface CredentialCustodyDeps {
  readonly renew: () => Promise<RenewedCredential | null>;
  /**
   * The platform's origin — the only origin the credential is ever attached
   * to (plus any in `allowedOrigins`). Custody OWNS the transport so a caller
   * can neither supply a function that captures the header nor point an
   * authorized request at an arbitrary origin: the credential leaves the
   * closure only as the Authorization header of a request to a permitted origin.
   * spec: identity-and-authorization/client-credential-custody#concealed-from-co-resident-scripts
   * spec: identity-and-authorization/audience-bound-tokens
   */
  readonly platformOrigin: string;
  /** Additional origins the credential may be attached to. Default: none. */
  readonly allowedOrigins?: ReadonlyArray<string>;
  /**
   * The fetch implementation custody calls. Defaults to globalThis.fetch. A
   * caller no longer passes a fetch per request, so no per-call function can
   * capture the credential.
   */
  readonly fetchImpl?: FetchLike;
  readonly now?: () => number;
  readonly setTimer?: (fn: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

/**
 * What a co-resident UI may know about custody — and ALL it may know:
 * - "active": an unexpired working credential is in hand. This holds even
 *   while renewal is failing and being retried, deliberately: a failure is
 *   surfaced only when access is really lost, because a holder that cannot
 *   renew cannot hand off or stand down either, so an earlier warning
 *   would cost attention without offering an action.
 *   spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
 * - "renewing-quietly": custody has started and is obtaining its first
 *   credential; nothing has lapsed because nothing was yet held.
 * - "lapsed": no live credential — never started, stopped, refused its
 *   first issue, or the held credential expired unrenewed.
 */
export type CustodyStatus = "active" | "renewing-quietly" | "lapsed";

/** The minimal fetch shape custody wraps. */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * The public custody surface. Note what is ABSENT: no getter, field, or
 * method result carries credential plaintext — the credential is spendable
 * (through `authorizedFetch`) but not readable, which is what makes
 * obtaining it take active subversion of this code path rather than a
 * passive read.
 * spec: identity-and-authorization/client-credential-custody#concealed-from-co-resident-scripts
 */
export interface CredentialCustody {
  /** Obtain the first credential and begin the proactive renewal loop. */
  start(): Promise<void>;
  /**
   * Stop renewing and CLEAR every piece of closure state — after stop,
   * nothing retained by this custody continues to authenticate. This is
   * the custody layer's half of sign-out.
   * spec: identity-and-authorization/google-sign-in#sign-out-clears-client-state
   */
  stop(): void;
  /**
   * Make a request with the credential attached as the Authorization header,
   * INSIDE the closure. Custody owns the transport: it calls the fetch it was
   * constructed with (default globalThis.fetch), and attaches the credential
   * ONLY when the request target is same-origin as the platform (or an
   * allowlisted origin) — a request to any other origin is made without it, so
   * the credential can be neither captured by a caller-supplied function nor
   * aimed at an arbitrary origin.
   * spec: identity-and-authorization/client-credential-custody#concealed-from-co-resident-scripts
   */
  authorizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  readonly status: CustodyStatus;
}

/**
 * Renewal is scheduled when this fraction of the credential's remaining
 * lifetime has elapsed — two thirds through a fifteen-minute credential
 * leaves a five-minute window of retries before anything is at stake.
 * Proactive, never reactive: the replacement is minted while the current
 * credential is still comfortably valid, so expiry is never discovered
 * from a refused call with a game clock running.
 * spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
 */
export const RENEWAL_AT_FRACTION_OF_LIFETIME = 2 / 3;

/** Quiet-retry backoff: doubling from one second, capped. */
export const RETRY_INITIAL_DELAY_MS = 1_000;
export const RETRY_MAX_DELAY_MS = 30_000;

/**
 * The floor no renewal is ever scheduled sooner than, and the minimum usable
 * life a renewed credential must carry to be adopted. Without it, an
 * already-expired credential (remaining life 0, whether from true expiry or a
 * platform clock skewed relative to the client) would schedule the next
 * renewal at delay 0 and hot-loop — an unbounded setTimeout(…,0) request
 * storm. A credential that arrives already expired or expiring within this
 * floor is treated as a FAILED renewal (quiet backoff), never adopted and
 * rescheduled off its non-positive remaining life.
 * spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
 */
export const RENEWAL_MIN_DELAY_MS = 5_000;

/**
 * Create a credential custody. Everything stateful lives in this call's
 * closure — deliberately a factory over locals rather than a class over
 * properties, so no enumeration of the returned object (or anything
 * reachable from a global) surfaces the credential.
 * spec: identity-and-authorization/client-credential-custody#memory-only
 */
export function createCredentialCustody(deps: CredentialCustodyDeps): CredentialCustody {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as number));
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));

  // The set of origins the credential may be attached to — the platform's own,
  // plus any explicit allowlist fixed at construction. Normalised to bare
  // origins so a path or query can never widen the match.
  const normalizeOrigin = (value: string): string | null => {
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  };
  const allowedOrigins = new Set<string>();
  for (const value of [deps.platformOrigin, ...(deps.allowedOrigins ?? [])]) {
    const origin = normalizeOrigin(value);
    if (origin !== null) allowedOrigins.add(origin);
  }
  // Resolve a request target to its origin, RELATIVE to the platform origin so
  // a same-origin relative URL ("/api/…") is attached to, an absolute foreign
  // URL is not.
  const targetOrigin = (input: RequestInfo | URL): string | null => {
    const href =
      input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
    try {
      return new URL(href, deps.platformOrigin).origin;
    } catch {
      return null;
    }
  };

  // The closure state — the ONLY residence the credential ever has.
  let credential: string | null = null;
  let expiresAtMs = 0;
  let started = false;
  let obtainedOnce = false;
  let renewInFlight = false;
  let timerHandle: unknown = null;
  let retryDelayMs = RETRY_INITIAL_DELAY_MS;
  /** Guards a stale in-flight renew from resurrecting a stopped custody. */
  let generation = 0;

  const holdingLiveCredential = (): boolean => credential !== null && expiresAtMs > now();

  const cancelTimer = (): void => {
    if (timerHandle !== null) {
      clearTimer(timerHandle);
      timerHandle = null;
    }
  };

  const schedule = (fn: () => void, delayMs: number): void => {
    cancelTimer();
    const scheduledGeneration = generation;
    timerHandle = setTimer(() => {
      timerHandle = null;
      if (scheduledGeneration === generation) fn();
    }, delayMs);
  };

  const scheduleProactiveRenewal = (): void => {
    const remaining = Math.max(0, expiresAtMs - now());
    // Floored: never sooner than RENEWAL_MIN_DELAY_MS, so no clock relationship
    // can drive the proactive schedule to a zero-delay hot loop.
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
    const delay = Math.max(RENEWAL_MIN_DELAY_MS, remaining * RENEWAL_AT_FRACTION_OF_LIFETIME);
    schedule(() => void attemptRenewal(), delay);
  };

  /** Back off exactly like an unreachable-platform failure — quiet retry. */
  const backOff = (): void => {
    schedule(() => void attemptRenewal(), retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_DELAY_MS);
  };

  async function attemptRenewal(): Promise<void> {
    const startedGeneration = generation;
    let renewed: RenewedCredential | null;
    renewInFlight = true;
    try {
      renewed = await deps.renew();
    } catch {
      renewInFlight = false;
      // The platform is unreachable while (typically) the credential in
      // hand is still valid: keep retrying and SAY NOTHING — status stays
      // exactly what the held credential's validity makes it, and the
      // failure surfaces only when access is really lost.
      // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
      if (startedGeneration !== generation) return;
      backOff();
      return;
    }
    renewInFlight = false;
    if (startedGeneration !== generation) return; // stopped while in flight
    if (renewed === null) {
      // The platform answered and refused: the underlying session has
      // ended, and a human's absence ends what is minted in their name —
      // retrying cannot change that, so no retry is scheduled and the
      // credential in hand simply runs out its remaining minutes.
      // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
      return;
    }
    if (renewed.expiresAtMs - now() <= RENEWAL_MIN_DELAY_MS) {
      // The platform answered with a credential already expired or expiring
      // within the floor (a stale mint, or a client/platform clock skew).
      // Adopting it and rescheduling off its non-positive remaining life is
      // exactly the hot loop; instead treat it as a failed renewal — quiet
      // backoff — leaving any still-valid held credential to keep status
      // "active" until it truly lapses.
      // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
      backOff();
      return;
    }
    credential = renewed.workingCredential;
    expiresAtMs = renewed.expiresAtMs;
    obtainedOnce = true;
    retryDelayMs = RETRY_INITIAL_DELAY_MS;
    scheduleProactiveRenewal();
  }

  return {
    async start(): Promise<void> {
      if (started) return;
      started = true;
      await attemptRenewal();
    },

    stop(): void {
      // Sign-out at the custody layer: cancel the loop and clear EVERY
      // closure field, so nothing retained continues to authenticate.
      // spec: identity-and-authorization/google-sign-in#sign-out-clears-client-state
      generation += 1;
      cancelTimer();
      credential = null;
      expiresAtMs = 0;
      started = false;
      obtainedOnce = false;
      renewInFlight = false;
      retryDelayMs = RETRY_INITIAL_DELAY_MS;
    },

    async authorizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      // Injection happens HERE, inside the closure, onto custody's OWN
      // transport: the caller supplied a request, never a function and never a
      // credential, and gets back a response.
      if (!holdingLiveCredential()) {
        throw new Error(
          `credential custody holds no live credential (status: ${statusOf()}); the caller must sign in again`,
        );
      }
      const origin = targetOrigin(input);
      if (origin === null || !allowedOrigins.has(origin)) {
        // Not the platform (or an allowlisted origin): make the request WITHOUT
        // the credential, so it can never be aimed at an arbitrary origin.
        // spec: identity-and-authorization/client-credential-custody#concealed-from-co-resident-scripts
        return await fetchImpl(input, init);
      }
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${credential}`);
      return await fetchImpl(input, { ...init, headers });
    },

    get status(): CustodyStatus {
      return statusOf();
    },
  };

  function statusOf(): CustodyStatus {
    // "active" is decided by the held credential's own validity and by
    // NOTHING about the renewal loop's health: renewal trouble while the
    // credential still works is deliberately invisible here.
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
    if (holdingLiveCredential()) return "active";
    // Between start() and the first credential arriving — an obtain in
    // flight or a quiet retry scheduled — nothing has lapsed because
    // nothing was yet held. A first obtain the platform REFUSED (renew
    // resolved null) schedules nothing, so it falls through to "lapsed".
    if (started && !obtainedOnce && (renewInFlight || timerHandle !== null)) {
      return "renewing-quietly";
    }
    return "lapsed";
  }
}
