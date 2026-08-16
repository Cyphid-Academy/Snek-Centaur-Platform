// Credential custody behaviour under injected fake time: proactive
// renewal, quiet retry, exact lapse, sign-out clearing, and — the part a
// generic credential-mining sweep would test for us in production — that
// nothing observable outside the closure ever carries the credential.
// spec: identity-and-authorization/client-credential-custody
// spec: identity-and-authorization/token-lifetime-and-refresh
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type CredentialCustody,
  type CustodyStatus,
  type FetchLike,
  RENEWAL_AT_FRACTION_OF_LIFETIME,
  RETRY_INITIAL_DELAY_MS,
  createCredentialCustody,
} from "./custody";

const LIFETIME_MS = 15 * 60 * 1000;

/** A deterministic clock + timer wheel injected through the custody deps. */
function makeClock() {
  let nowMs = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const cleared: number[] = [];
  return {
    now: () => nowMs,
    setTimer: (fn: () => void, delayMs: number): unknown => {
      const id = nextId++;
      timers.set(id, { at: nowMs + delayMs, fn });
      return id;
    },
    clearTimer: (handle: unknown): void => {
      timers.delete(handle as number);
      cleared.push(handle as number);
    },
    /** Advance the clock, firing due timers in order, flushing microtasks between. */
    async advance(ms: number): Promise<void> {
      const target = nowMs + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        const [id, timer] = due;
        timers.delete(id);
        nowMs = Math.max(nowMs, timer.at);
        timer.fn();
        await flush();
      }
      nowMs = target;
    },
    pendingCount: () => timers.size,
    clearedHandles: cleared,
  };
}

/** Settle promise chains kicked off by a fired timer. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

/** A renew stub whose behaviour per call the test scripts up front. */
function makeRenew(clock: ReturnType<typeof makeClock>) {
  let calls = 0;
  let serial = 0;
  // "stale": the platform answers with an already-expired credential;
  // "near": one that expires within the renewal floor (a clock-skew artefact).
  const script: Array<"ok" | "fail" | "refused" | "stale" | "near"> = [];
  const issued: string[] = [];
  const issue = (expiresAtMs: number) => {
    serial += 1;
    const workingCredential = `credential-${serial}`;
    issued.push(workingCredential);
    return { workingCredential, expiresAtMs };
  };
  return {
    script,
    issued,
    callCount: () => calls,
    renew: async (): Promise<{ workingCredential: string; expiresAtMs: number } | null> => {
      calls += 1;
      const behaviour = script.shift() ?? "ok";
      if (behaviour === "fail") throw new Error("platform unreachable");
      if (behaviour === "refused") return null;
      if (behaviour === "stale") return issue(clock.now());
      if (behaviour === "near") return issue(clock.now() + 2_000);
      return issue(clock.now() + LIFETIME_MS);
    },
  };
}

const PLATFORM_ORIGIN = "https://platform.example";

/** A fetch custody OWNS (constructed with), recording the headers it was handed. */
function makeCapture() {
  let auth: string | null = null;
  let contentType: string | null = null;
  const fetchImpl: FetchLike = async (_input, init) => {
    const headers = new Headers(init?.headers);
    auth = headers.get("authorization");
    contentType = headers.get("content-type");
    return new Response("ok");
  };
  return { fetchImpl, auth: () => auth, contentType: () => contentType };
}

function makeCustody(
  clock: ReturnType<typeof makeClock>,
  renew: ReturnType<typeof makeRenew>,
  fetchImpl?: FetchLike,
) {
  return createCredentialCustody({
    renew: renew.renew,
    platformOrigin: PLATFORM_ORIGIN,
    ...(fetchImpl ? { fetchImpl } : {}),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
}

/** The Authorization header the custody's OWN transport injected on a same-origin call. */
async function capturedAuthHeader(
  custody: CredentialCustody,
  capture: ReturnType<typeof makeCapture>,
  init?: RequestInit,
): Promise<string | null> {
  await custody.authorizedFetch(`${PLATFORM_ORIGIN}/api`, init);
  return capture.auth();
}

describe("proactive renewal", () => {
  it("renews at two thirds of the credential's lifetime — well before expiry, never in reaction to a refusal", async () => {
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
    const clock = makeClock();
    const renew = makeRenew(clock);
    const capture = makeCapture();
    const custody = makeCustody(clock, renew, capture.fetchImpl);
    await custody.start();
    expect(renew.callCount()).toBe(1);
    expect(await capturedAuthHeader(custody, capture)).toBe("Bearer credential-1");

    // Just before the two-thirds point: no renewal yet.
    await clock.advance(LIFETIME_MS * RENEWAL_AT_FRACTION_OF_LIFETIME - 1);
    expect(renew.callCount()).toBe(1);

    // At the two-thirds point the replacement is minted — one third of the
    // lifetime still remains on the credential being replaced.
    await clock.advance(1);
    expect(renew.callCount()).toBe(2);
    expect(await capturedAuthHeader(custody, capture)).toBe("Bearer credential-2");
    expect(custody.status).toBe("active");
  });
});

describe("quiet retry", () => {
  it("keeps status 'active' through failed renewals and backoff retries until recovery — the failure is never surfaced while the credential works", async () => {
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
    const clock = makeClock();
    const renew = makeRenew(clock);
    renew.script.push("ok", "fail", "fail", "fail", "ok");
    const capture = makeCapture();
    const custody = makeCustody(clock, renew, capture.fetchImpl);
    await custody.start();

    // The proactive renewal fails; retries back off, quietly.
    await clock.advance(LIFETIME_MS * RENEWAL_AT_FRACTION_OF_LIFETIME);
    expect(renew.callCount()).toBe(2);
    expect(custody.status).toBe("active");

    await clock.advance(RETRY_INITIAL_DELAY_MS); // retry 1 → fail
    expect(renew.callCount()).toBe(3);
    expect(custody.status).toBe("active");

    await clock.advance(RETRY_INITIAL_DELAY_MS * 2); // retry 2 → fail
    expect(renew.callCount()).toBe(4);
    expect(custody.status).toBe("active");

    await clock.advance(RETRY_INITIAL_DELAY_MS * 4); // retry 3 → recovery
    expect(renew.callCount()).toBe(5);
    expect(custody.status).toBe("active");
    // The recovered credential is the one now being spent.
    expect(await capturedAuthHeader(custody, capture)).toBe("Bearer credential-2");
  });
});

describe("lapse", () => {
  it("surfaces 'lapsed' exactly when the credential expires unrenewed, not a moment earlier", async () => {
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
    //   ("the failure is surfaced when the credential actually lapses and
    //    access is really lost, not while it is still working")
    const clock = makeClock();
    const renew = makeRenew(clock);
    renew.script.push("ok");
    for (let i = 0; i < 40; i += 1) renew.script.push("fail");
    const custody = makeCustody(clock, renew);
    await custody.start();

    await clock.advance(LIFETIME_MS - 1);
    expect(custody.status).toBe("active");
    await clock.advance(1);
    expect(custody.status).toBe("lapsed");
  });

  it("lets the credential in hand run out quietly when renewal is REFUSED (session ended) rather than unreachable", async () => {
    // A refusal is authoritative — renewal re-reads the session, and the
    // session is gone — so no retry is scheduled and the held credential
    // simply serves out its remaining minutes.
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
    const clock = makeClock();
    const renew = makeRenew(clock);
    renew.script.push("ok", "refused");
    const custody = makeCustody(clock, renew);
    await custody.start();

    await clock.advance(LIFETIME_MS * RENEWAL_AT_FRACTION_OF_LIFETIME);
    expect(renew.callCount()).toBe(2);
    expect(custody.status).toBe("active"); // still valid, still quiet
    expect(clock.pendingCount()).toBe(0); // and no retry scheduled

    await clock.advance(LIFETIME_MS * (1 - RENEWAL_AT_FRACTION_OF_LIFETIME));
    expect(custody.status).toBe("lapsed");
    expect(renew.callCount()).toBe(2);
  });
});

describe("no renewal storm under a hostile clock", () => {
  it("does not hot-loop when renewal keeps returning an already-expired credential — bounded, backing-off calls, never hundreds at t=0", async () => {
    // An already-expired credential yields remaining=0, so scheduling off it
    // (delay = remaining * 2/3 = 0) would reschedule immediately and storm.
    // A renewal that returns a non-usable (already-expired) credential is
    // treated as a failed renewal — quiet backoff — not adopted-and-rescheduled.
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
    const clock = makeClock();
    const renew = makeRenew(clock);
    for (let i = 0; i < 300; i += 1) renew.script.push("stale");
    const custody = makeCustody(clock, renew);
    await custody.start();

    // start() made exactly one attempt and scheduled a single backoff timer —
    // not an immediate zero-delay reschedule.
    expect(renew.callCount()).toBe(1);
    expect(clock.pendingCount()).toBe(1);

    // A full minute of backoff yields a handful of calls, not the storm the
    // zero-delay reschedule would produce (which exhausts the 300-entry script).
    await clock.advance(60_000);
    expect(renew.callCount()).toBeLessThanOrEqual(15);
  });

  it("does not storm when a clock skew makes freshly-minted credentials land within the renewal floor", async () => {
    // A platform clock ~20 minutes off from the client makes a 15-minute
    // credential arrive with almost no usable life (here: inside the floor).
    // Scheduling off its tiny remaining life would loop tightly; the floor +
    // treat-as-failed keeps the calls bounded and backing off under any clock
    // relationship.
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
    const clock = makeClock();
    const renew = makeRenew(clock);
    for (let i = 0; i < 300; i += 1) renew.script.push("near");
    const custody = makeCustody(clock, renew);
    await custody.start();

    await clock.advance(60_000);
    expect(renew.callCount()).toBeLessThanOrEqual(15);
  });
});

describe("stop clears client state", () => {
  it("cancels renewal, drops the credential, and refuses to authorize anything further", async () => {
    // spec: identity-and-authorization/google-sign-in#sign-out-clears-client-state
    const clock = makeClock();
    const renew = makeRenew(clock);
    const custody = makeCustody(clock, renew);
    await custody.start();
    expect(custody.status).toBe("active");
    expect(clock.pendingCount()).toBe(1);

    custody.stop();
    expect(custody.status).toBe("lapsed");
    // The pending proactive-renewal timer was cleared, not abandoned.
    expect(clock.pendingCount()).toBe(0);
    expect(clock.clearedHandles.length).toBeGreaterThan(0);
    // Nothing retained continues to authenticate: authorizedFetch now refuses
    // rather than sending a stale header.
    await expect(custody.authorizedFetch(`${PLATFORM_ORIGIN}/api`)).rejects.toThrow(
      /no live credential/,
    );
    // Time passing changes nothing.
    await clock.advance(LIFETIME_MS);
    expect(renew.callCount()).toBe(1);
  });
});

describe("authorized fetch", () => {
  it("injects the Bearer header inside the closure, preserving the caller's own headers", async () => {
    const clock = makeClock();
    const renew = makeRenew(clock);
    const capture = makeCapture();
    const custody = makeCustody(clock, renew, capture.fetchImpl);
    await custody.start();

    await custody.authorizedFetch(`${PLATFORM_ORIGIN}/api`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(capture.auth()).toBe("Bearer credential-1");
    expect(capture.contentType()).toBe("application/json");
  });

  it("never attaches the credential to a foreign origin — custody owns the transport", async () => {
    // A caller can neither supply a function that captures the header nor aim
    // an authorized request at an arbitrary origin: a request to any origin but
    // the platform's is made WITHOUT the credential.
    // spec: identity-and-authorization/client-credential-custody#concealed-from-co-resident-scripts
    const clock = makeClock();
    const renew = makeRenew(clock);
    const capture = makeCapture();
    const custody = makeCustody(clock, renew, capture.fetchImpl);
    await custody.start();

    // A foreign absolute URL: the request is made, but carries no credential.
    await custody.authorizedFetch("https://evil.example/collect");
    expect(capture.auth()).toBeNull();

    // A same-origin request (absolute or relative) still gets the header.
    await custody.authorizedFetch(`${PLATFORM_ORIGIN}/api`);
    expect(capture.auth()).toBe("Bearer credential-1");
    await custody.authorizedFetch("/api/relative");
    expect(capture.auth()).toBe("Bearer credential-1");
  });
});

describe("concealment", () => {
  it("adds nothing to globalThis, localStorage, or sessionStorage a credential-mining sweep could find", async () => {
    // spec: identity-and-authorization/client-credential-custody#memory-only
    // spec: identity-and-authorization/client-credential-custody#concealed-from-co-resident-scripts
    localStorage.clear();
    sessionStorage.clear();
    const globalsBefore = new Set(Object.getOwnPropertyNames(globalThis));

    const clock = makeClock();
    const renew = makeRenew(clock);
    const capture = makeCapture();
    const custody = makeCustody(clock, renew, capture.fetchImpl);
    await custody.start();
    await capturedAuthHeader(custody, capture);
    await clock.advance(LIFETIME_MS * RENEWAL_AT_FRACTION_OF_LIFETIME); // a renewal cycle too

    const globalsAfter = Object.getOwnPropertyNames(globalThis);
    const added = globalsAfter.filter((name) => !globalsBefore.has(name));
    expect(added).toEqual([]);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // And the custody object itself: enumerating it (the sweep's other
    // move) surfaces no string-valued own property holding a credential.
    for (const value of Object.values(custody)) {
      expect(typeof value === "string" && value.includes("credential-")).toBe(false);
    }
  });

  it("exposes no member whose type could return credential plaintext", () => {
    // spec: identity-and-authorization/client-credential-custody#concealed-from-co-resident-scripts
    // The public surface is exactly these four members…
    expectTypeOf<keyof CredentialCustody>().toEqualTypeOf<
      "start" | "stop" | "authorizedFetch" | "status"
    >();
    // …and none of them yields a string at any depth a caller can reach:
    expectTypeOf<ReturnType<CredentialCustody["start"]>>().toEqualTypeOf<Promise<void>>();
    expectTypeOf<ReturnType<CredentialCustody["stop"]>>().toEqualTypeOf<void>();
    // authorizedFetch resolves to a Response, never a string — and takes a
    // request, not a caller-supplied fetch that could capture the credential.
    expectTypeOf<ReturnType<CredentialCustody["authorizedFetch"]>>().toEqualTypeOf<
      Promise<Response>
    >();
    // status is the closed union — a status, not a token.
    expectTypeOf<CredentialCustody["status"]>().toEqualTypeOf<CustodyStatus>();
    expectTypeOf<CredentialCustody["status"]>().not.toEqualTypeOf<string>();
  });
});
