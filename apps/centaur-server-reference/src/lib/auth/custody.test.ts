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
  const script: Array<"ok" | "fail" | "refused"> = [];
  const issued: string[] = [];
  return {
    script,
    issued,
    callCount: () => calls,
    renew: async (): Promise<{ workingCredential: string; expiresAtMs: number } | null> => {
      calls += 1;
      const behaviour = script.shift() ?? "ok";
      if (behaviour === "fail") throw new Error("platform unreachable");
      if (behaviour === "refused") return null;
      serial += 1;
      const workingCredential = `credential-${serial}`;
      issued.push(workingCredential);
      return { workingCredential, expiresAtMs: clock.now() + LIFETIME_MS };
    },
  };
}

function makeCustody(clock: ReturnType<typeof makeClock>, renew: ReturnType<typeof makeRenew>) {
  return createCredentialCustody({
    renew: renew.renew,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
}

/** The Authorization header the custody's wrapped fetch injected, via a capturing fetch. */
async function capturedAuthHeader(
  custody: CredentialCustody,
  init?: RequestInit,
): Promise<string | null> {
  let captured: string | null = null;
  const spy: FetchLike = async (_input, spyInit) => {
    captured = new Headers(spyInit?.headers).get("authorization");
    return new Response("ok");
  };
  await custody.authorizedFetch(spy)("https://platform.example/api", init);
  return captured;
}

describe("proactive renewal", () => {
  it("renews at two thirds of the credential's lifetime — well before expiry, never in reaction to a refusal", async () => {
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
    const clock = makeClock();
    const renew = makeRenew(clock);
    const custody = makeCustody(clock, renew);
    await custody.start();
    expect(renew.callCount()).toBe(1);
    expect(await capturedAuthHeader(custody)).toBe("Bearer credential-1");

    // Just before the two-thirds point: no renewal yet.
    await clock.advance(LIFETIME_MS * RENEWAL_AT_FRACTION_OF_LIFETIME - 1);
    expect(renew.callCount()).toBe(1);

    // At the two-thirds point the replacement is minted — one third of the
    // lifetime still remains on the credential being replaced.
    await clock.advance(1);
    expect(renew.callCount()).toBe(2);
    expect(await capturedAuthHeader(custody)).toBe("Bearer credential-2");
    expect(custody.status).toBe("active");
  });
});

describe("quiet retry", () => {
  it("keeps status 'active' through failed renewals and backoff retries until recovery — the failure is never surfaced while the credential works", async () => {
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
    const clock = makeClock();
    const renew = makeRenew(clock);
    renew.script.push("ok", "fail", "fail", "fail", "ok");
    const custody = makeCustody(clock, renew);
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
    expect(await capturedAuthHeader(custody)).toBe("Bearer credential-2");
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
    // Nothing retained continues to authenticate: the wrapped fetch now
    // refuses rather than sending a stale header.
    const spy: FetchLike = async () => new Response("ok");
    await expect(custody.authorizedFetch(spy)("https://platform.example/api")).rejects.toThrow(
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
    const custody = makeCustody(clock, renew);
    await custody.start();

    let capturedContentType: string | null = null;
    let capturedAuth: string | null = null;
    const spy: FetchLike = async (_input, init) => {
      const headers = new Headers(init?.headers);
      capturedContentType = headers.get("content-type");
      capturedAuth = headers.get("authorization");
      return new Response("ok");
    };
    await custody.authorizedFetch(spy)("https://platform.example/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(capturedAuth).toBe("Bearer credential-1");
    expect(capturedContentType).toBe("application/json");
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
    const custody = makeCustody(clock, renew);
    await custody.start();
    await capturedAuthHeader(custody);
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
    // authorizedFetch returns a fetch: its awaited result is a Response, never a string.
    expectTypeOf<ReturnType<ReturnType<CredentialCustody["authorizedFetch"]>>>().toEqualTypeOf<
      Promise<Response>
    >();
    // status is the closed union — a status, not a token.
    expectTypeOf<CredentialCustody["status"]>().toEqualTypeOf<CustodyStatus>();
    expectTypeOf<CredentialCustody["status"]>().not.toEqualTypeOf<string>();
  });
});
