// spec: identity-and-authorization/client-credential-custody,
//       identity-and-authorization/token-lifetime-and-refresh
// Where this page's credentials live, and the only way anything reaches one.
//
// Module-scope closure state, exported nowhere: the working credential and the
// renewal link exist only as bindings inside this module, never on `window`, a
// well-known property, browser storage, or the DOM. A co-resident script that
// enumerates all of those in a generic credential-mining sweep comes away
// empty; obtaining a credential takes instrumenting this module's own code
// path, which is the "active subversion" line the requirement draws.
//
// spec: identity-and-authorization/client-credential-custody#memory-only
// spec: identity-and-authorization/client-credential-custody#concealed-from-co-resident-scripts

/** What redemption or renewal handed the page. `renewal` is the next single-use link. */
export interface Grant {
  readonly credential: string;
  readonly renewal?: string;
}

/** What custody needs of its surroundings, injected so this module owns no client. */
export interface CustodyDeps {
  /** Trade the current pair for a fresh one — the platform's `renewCredential`. */
  readonly renew: (credential: string, renewal: string) => Promise<Grant>;
  /**
   * The chain lapsed with no replacement — the session cookie is now the only
   * way back in, so the page should take its silent trip.
   */
  readonly onLapse: () => void;
}

let held: Grant | undefined;
let deps: CustodyDeps | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * How far ahead of the working credential's expiry renewal runs: five minutes,
 * a third of the fifteen-minute lifetime — early enough that transient failure
 * leaves room to retry, on a schedule of the holder's own.
 *
 * spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
 */
const RENEWAL_MARGIN_MS = 5 * 60 * 1000;

/** How long a failed renewal waits before trying again, while the credential still works. */
const RETRY_MS = 30 * 1000;

/**
 * Take custody of a grant and keep it fresh in the background.
 *
 * Renewal is a background call carrying the in-memory pair — never a
 * navigation the human waits through. A grant with no renewal link (a handoff
 * minted where no session was readable) is simply held until it expires, at
 * which point `onLapse` runs and the page recovers through the session.
 *
 * spec: identity-and-authorization/token-lifetime-and-refresh#renewal-does-not-interrupt-a-live-session
 */
export function adopt(grant: Grant, using: CustodyDeps): void {
  held = grant;
  deps = using;
  schedule();
}

/** Whether the page currently holds a working credential, without revealing it. */
export function holds(): boolean {
  return held !== undefined && expiryOf(held.credential) > Date.now();
}

/**
 * Use the working credential without holding it: the one door, shaped so a
 * caller borrows the value for a call and keeps a promise, not a credential.
 */
export async function withCredential<T>(use: (credential: string) => Promise<T>): Promise<T> {
  if (!held) throw new Error("this page holds no credential");
  return use(held.credential);
}

/** Drop everything held — sign-out, or a test putting the module back to rest. */
export function release(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  held = undefined;
  deps = undefined;
}

function schedule(): void {
  if (timer !== undefined) clearTimeout(timer);
  if (!held) return;
  const at = expiryOf(held.credential) - RENEWAL_MARGIN_MS;
  // Floored at the retry interval, never zero: a credential already inside
  // its renewal margin must not turn the schedule into a tight loop of
  // immediate rotations.
  timer = setTimeout(rotate, Math.max(at - Date.now(), RETRY_MS));
}

/**
 * One renewal attempt, and what its outcomes mean.
 *
 * Failure while the credential still works is retried and said nothing about —
 * the platform being briefly unreachable is surfaced only when access is
 * really lost, because a holder that cannot renew can do nothing else with the
 * same unreachable platform either. Failure after the credential lapsed, or a
 * lapse with no renewal link at all, hands the problem to `onLapse`: the
 * session cookie is the one credential that can answer now.
 *
 * spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
 */
async function rotate(): Promise<void> {
  if (!held || !deps) return;
  const { credential, renewal } = held;
  const lapse = deps.onLapse;
  if (renewal === undefined) {
    timer = setTimeout(
      () => {
        release();
        lapse();
      },
      Math.max(expiryOf(credential) - Date.now(), 0),
    );
    return;
  }
  try {
    const fresh = await deps.renew(credential, renewal);
    // Custody may have been released mid-flight; a grant nobody holds is not
    // re-adopted behind their back.
    if (!held) return;
    held = fresh;
    schedule();
  } catch {
    if (expiryOf(credential) > Date.now()) {
      timer = setTimeout(rotate, RETRY_MS);
    } else {
      release();
      lapse();
    }
  }
}

/**
 * When a credential stops working, in epoch milliseconds, read from its own
 * `exp` claim. Decoding is not verification and is not trusted as one — the
 * platform re-verifies every presentation; this only schedules a timer.
 */
function expiryOf(credential: string): number {
  try {
    const payload = JSON.parse(
      atob((credential.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}
