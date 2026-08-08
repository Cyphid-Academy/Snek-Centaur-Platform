// spec: identity-and-authorization/service-principal-assertions,
//       identity-and-authorization/token-lifetime-and-refresh,
//       identity-and-authorization/client-credential-custody,
//       identity-and-authorization/game-credential-scope
// Holder-side custody tests, run against a fake clock and a caller-supplied
// `redeem` standing in for the platform.

import { decodeJwt, generateKeyPair, jwtVerify } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type GameScope,
  type Redeem,
  type Renewal,
  type ServerIdentity,
  holdGameCredential,
  renewalAction,
  signAssertion,
} from "./credentials.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The credential lifetime the platform mints today, stated once here as the
 * platform would state it — the holder reads it off each token. */
const LIFETIME = 900;

let identity: ServerIdentity;
let publicKey: CryptoKey;
/** A second principal's key: signatures from one must not verify as the other. */
let strangerPublicKey: CryptoKey;

beforeAll(async () => {
  const own = await generateKeyPair("ES256");
  identity = {
    signingKey: own.privateKey,
    domain: "centaur.example",
    issuanceEndpoint: "https://platform.example/api/issue",
  };
  publicKey = own.publicKey;
  strangerPublicKey = (await generateKeyPair("ES256")).publicKey;
});

/** An unverified but structurally valid JWT, enough for `decodeJwt` to read a
 * lifetime from. The holder never verifies its own credential — the platform
 * signed it — so the signature segment can be a placeholder. */
const b64u = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
const mintCredential = (iatSeconds: number, lifetimeSeconds = LIFETIME) =>
  // The jti keeps two credentials minted in the same second distinct, so
  // "renewed" vs "reloaded" stays decidable by comparing strings.
  `${b64u({ alg: "ES256" })}.${b64u({
    iat: iatSeconds,
    exp: iatSeconds + lifetimeSeconds,
    jti: crypto.randomUUID(),
  })}.c2ln`;

// ---------------------------------------------------------------------------
// renewalAction: the pure schedule
// ---------------------------------------------------------------------------

// spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
describe("the renewal schedule, across the whole of a credential's timeline", () => {
  const T0 = 1_000_000; // arbitrary issue instant; the function sees only differences

  // Each row is a region or one of its fenceposts.
  it.each<{ name: string; age: number; expected: Renewal }>([
    { name: "freshly issued", age: 0, expected: "hold" },
    { name: "one second short of the threshold", age: 599, expected: "hold" },
    { name: "exactly at the two-thirds threshold", age: 600, expected: "renew" },
    {
      name: "one second before expiry — still proactive, never lapsed",
      age: 899,
      expected: "renew",
    },
    { name: "exactly at expiry", age: 900, expected: "lapsed" },
    // Clock skew can put `iat` in the caller's future. The function must stay
    // total — a nonsense age is an early credential, not a crash or a lapse.
    { name: "issued in the future (clock skew)", age: -30, expected: "hold" },
  ])("a $LIFETIME s credential $name is '$expected'", ({ age, expected }) => {
    expect(renewalAction(T0, LIFETIME, T0 + age)).toBe(expected);
  });

  it("scales its threshold with the credential's own lifetime rather than assuming fifteen minutes", () => {
    expect(renewalAction(T0, 60, T0 + 39)).toBe("hold");
    expect(renewalAction(T0, 60, T0 + 40)).toBe("renew");
    expect(renewalAction(T0, 60, T0 + 59)).toBe("renew");
    expect(renewalAction(T0, 60, T0 + 60)).toBe("lapsed");
  });
});

// ---------------------------------------------------------------------------
// signAssertion: the outward half of service-principal authentication
// ---------------------------------------------------------------------------

// spec: identity-and-authorization/service-principal-assertions
describe("a signed assertion", () => {
  it("names this Server as both issuer and subject, verifiable against the published public half", async () => {
    const assertion = await signAssertion(identity);
    const { payload, protectedHeader } = await jwtVerify(assertion, publicKey, {
      issuer: identity.domain,
      audience: identity.issuanceEndpoint,
    });
    expect(protectedHeader.alg).toBe("ES256");
    expect(payload.iss).toBe(identity.domain);
    expect(payload.sub).toBe(identity.domain);
  });

  it("does not verify under another principal's published key", async () => {
    const assertion = await signAssertion(identity);
    await expect(
      jwtVerify(assertion, strangerPublicKey, {
        issuer: identity.domain,
        audience: identity.issuanceEndpoint,
      }),
    ).rejects.toThrow();
  });

  it("names the one deployment it may be used at, and no other", async () => {
    const payload = decodeJwt(await signAssertion(identity));
    // A single string, not a list and not a platform-wide constant — see
    // `issuanceEndpoint` on `ServerIdentity`.
    expect(payload.aud).toBe(identity.issuanceEndpoint);
    await expect(
      jwtVerify(await signAssertion(identity), publicKey, {
        issuer: identity.domain,
        audience: "https://elsewhere.example/api/issue",
      }),
    ).rejects.toThrow();
  });

  it("carries an identifier unique to each assertion", async () => {
    const first = decodeJwt(await signAssertion(identity));
    const second = decodeJwt(await signAssertion(identity));
    expect(typeof first.jti).toBe("string");
    expect(first.jti).not.toBe(second.jti);
  });

  it("asserts identity and nothing else: no claim or header field beyond the six the shape requires", async () => {
    // Exact-set equality, in both places, because a field being ADDED — a
    // teamId, a role, a header parameter — is the direction that regresses,
    // and it is the only assertion that fails on it.
    const assertion = await signAssertion(identity);
    const { payload, protectedHeader } = await jwtVerify(assertion, publicKey, {
      issuer: identity.domain,
      audience: identity.issuanceEndpoint,
    });
    expect(Object.keys(payload).sort()).toEqual(["aud", "exp", "iat", "iss", "jti", "sub"]);
    expect(Object.keys(protectedHeader).sort()).toEqual(["alg"]);
  });

  it("is short-lived: it has to survive one call to the issuance endpoint, not a session", async () => {
    const { iat, exp } = decodeJwt(await signAssertion(identity));
    if (iat === undefined || exp === undefined) throw new Error("assertion carries no lifetime");
    expect(exp).toBeGreaterThan(iat);
    expect(exp - iat).toBeLessThanOrEqual(60);
  });
});

// ---------------------------------------------------------------------------
// holdGameCredential: custody over time, against a fake clock
// ---------------------------------------------------------------------------

describe("custody of a game credential", () => {
  const START = new Date("2026-07-30T12:00:00Z");
  const startSeconds = Math.floor(START.getTime() / 1000);
  const scope: GameScope = { teamId: "team-aleph", gameId: "game-42" };
  const POLL_SECONDS = 30;

  interface RedeemCall {
    readonly assertion: string;
    readonly scope: GameScope;
    readonly atSeconds: number;
  }

  /** A controllable platform: records every redemption, fails on demand. */
  function fakePlatform() {
    const calls: RedeemCall[] = [];
    let failure: Error | undefined;
    let mint = (nowSeconds: number) => mintCredential(nowSeconds);
    const redeem: Redeem = async (assertion, redeemScope) => {
      const atSeconds = Math.floor(Date.now() / 1000);
      calls.push({ assertion, scope: redeemScope, atSeconds });
      if (failure !== undefined) throw failure;
      return mint(atSeconds);
    };
    return {
      calls,
      redeem,
      fail: (error: Error) => {
        failure = error;
      },
      recover: () => {
        failure = undefined;
      },
      mintWith: (fn: (nowSeconds: number) => string) => {
        mint = fn;
      },
    };
  }

  beforeEach(() => {
    // Only the interval and the clock are faked; setImmediate stays real so
    // the WebCrypto signing inside each tick can actually complete between
    // advances of the fake clock.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Let in-flight ticks run to completion. Real setTimeout (deliberately not
   * faked above) is required: the ECDSA signing inside a tick completes on
   * the threadpool, which microtask- or immediate-draining never waits for. */
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  };

  /**
   * Advance the fake clock one poll interval at a time, letting each tick
   * finish before the next fires. Not one jump: a jump fires every interval
   * back to back with no real time in between, so the first tick's signing is
   * still outstanding on the threadpool when the rest fire and they are all
   * skipped by the module's already-ticking guard. Real time does pass between
   * real ticks; this makes the fake clock behave the same way.
   */
  const advanceSeconds = async (seconds: number) => {
    let remaining = seconds;
    while (remaining > 0) {
      const step = Math.min(POLL_SECONDS, remaining);
      await vi.advanceTimersByTimeAsync(step * 1000);
      await settle();
      remaining -= step;
    }
  };

  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
  it("renews on its own schedule, before expiry, with the outgoing credential still valid", async () => {
    const platform = fakePlatform();
    const onLapse = vi.fn();
    const handle = holdGameCredential(
      identity,
      scope,
      platform.redeem,
      onLapse,
      POLL_SECONDS * 1000,
    );
    await settle();

    const first = handle.credential();
    expect(first).toBeDefined();
    expect(platform.calls).toHaveLength(1);

    // Presenting the credential is never what triggers renewal: there is no
    // refusal-shaped input to this module, only the schedule.
    for (let i = 0; i < 50; i += 1) handle.credential();
    expect(platform.calls).toHaveLength(1);

    // Up to one poll short of the two-thirds threshold: held, not renewed.
    await advanceSeconds(LIFETIME * (2 / 3) - POLL_SECONDS);
    expect(platform.calls).toHaveLength(1);
    expect(handle.credential()).toBe(first);

    // One more poll crosses the threshold: a fresh credential is in hand while
    // the outgoing one still has five minutes to live.
    await advanceSeconds(POLL_SECONDS);
    expect(platform.calls.length).toBeGreaterThanOrEqual(2);
    const renewedAt = platform.calls[1]?.atSeconds;
    expect(renewedAt).toBeDefined();
    expect(renewedAt as number).toBeLessThan(startSeconds + LIFETIME);
    const renewed = handle.credential();
    expect(renewed).toBeDefined();
    expect(renewed).not.toBe(first);

    // Each renewal presents a fresh assertion: the platform refuses a repeated
    // identifier, so reuse would strand renewal.
    const assertions = platform.calls.map((c) => c.assertion);
    expect(new Set(assertions).size).toBe(assertions.length);

    // Ride the schedule well past the first credential's original expiry.
    for (let elapsed = 0; elapsed < LIFETIME * 2; elapsed += POLL_SECONDS) {
      await advanceSeconds(POLL_SECONDS);
      expect(handle.credential()).toBeDefined();
    }
    expect(onLapse).not.toHaveBeenCalled();
    handle.stop();
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
  it("reads the renewal schedule off each credential's own lifetime, not an assumed fifteen minutes", async () => {
    // The pure-function test proves `renewalAction` scales; this proves the
    // loop feeds it the lifetime read off the token in hand. A loop that
    // assumed 900s would pass every other test in this file.
    const SHORT = 120; // renew threshold at 80s, so the tick at 90s must renew
    const platform = fakePlatform();
    platform.mintWith((now) => mintCredential(now, SHORT));
    const onLapse = vi.fn();
    const handle = holdGameCredential(
      identity,
      scope,
      platform.redeem,
      onLapse,
      POLL_SECONDS * 1000,
    );
    await settle();
    const first = handle.credential();
    expect(first).toBeDefined();

    // Ticks at 30s and 60s sit below the short credential's two-thirds mark:
    // still held, so the loop is not simply renewing on every tick.
    await advanceSeconds(POLL_SECONDS * 2);
    expect(platform.calls).toHaveLength(1);
    expect(handle.credential()).toBe(first);

    // The tick at 90s crosses the short threshold — renewal happens with 30s
    // still to live, not the 600s a hard-coded schedule would wait.
    await advanceSeconds(POLL_SECONDS);
    expect(platform.calls).toHaveLength(2);
    const renewedAt = platform.calls[1]?.atSeconds;
    expect(renewedAt as number).toBeLessThan(startSeconds + SHORT);
    expect(handle.credential()).not.toBe(first);

    // Ride several short cycles: continuous coverage at the short cadence too.
    for (let elapsed = 0; elapsed < SHORT * 3; elapsed += POLL_SECONDS) {
      await advanceSeconds(POLL_SECONDS);
      expect(handle.credential()).toBeDefined();
    }
    expect(onLapse).not.toHaveBeenCalled();
    handle.stop();
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
  it("says nothing while the held credential is still valid, and surfaces the loss exactly once when it lapses", async () => {
    const platform = fakePlatform();
    const onLapse = vi.fn();
    const handle = holdGameCredential(
      identity,
      scope,
      platform.redeem,
      onLapse,
      POLL_SECONDS * 1000,
    );
    await settle();
    const first = handle.credential();
    expect(first).toBeDefined();

    platform.fail(new Error("ECONNREFUSED"));

    // The quiet half — the one that regresses. Walk the renew window in poll
    // steps: attempts fail on every tick, yet the holder keeps the working
    // credential and raises nothing.
    for (let elapsed = 0; elapsed < LIFETIME; elapsed += POLL_SECONDS) {
      await advanceSeconds(POLL_SECONDS);
      if (elapsed + POLL_SECONDS < LIFETIME) {
        expect(onLapse).not.toHaveBeenCalled();
        expect(handle.credential()).toBe(first);
      }
    }

    expect(handle.credential()).toBeUndefined();
    expect(onLapse).toHaveBeenCalledTimes(1);

    // Once per lapse, not once per failed attempt.
    await advanceSeconds(POLL_SECONDS * 4);
    expect(onLapse).toHaveBeenCalledTimes(1);

    // The retries never stopped, so the platform's return is enough on its own.
    platform.recover();
    await advanceSeconds(POLL_SECONDS);
    expect(handle.credential()).toBeDefined();
    expect(handle.credential()).not.toBe(first);

    // A later outage is a new lapse: the notification is per loss of access,
    // not once per lifetime of the handle.
    platform.fail(new Error("ECONNREFUSED"));
    await advanceSeconds(LIFETIME + POLL_SECONDS);
    expect(onLapse).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
  it("treats an answer carrying no lifetime as a failed renewal rather than storing it", async () => {
    const SHORT = 40; // threshold at ~27s, so the tick at 30s renews
    const platform = fakePlatform();
    platform.mintWith((now) => mintCredential(now, SHORT));
    const handle = holdGameCredential(
      identity,
      scope,
      platform.redeem,
      vi.fn(),
      POLL_SECONDS * 1000,
    );
    await settle();
    const first = handle.credential();
    expect(first).toBeDefined();

    platform.mintWith(() => `${b64u({ alg: "ES256" })}.${b64u({})}.c2ln`);
    await advanceSeconds(POLL_SECONDS);
    expect(platform.calls.length).toBeGreaterThan(1);
    expect(handle.credential()).toBe(first);
    handle.stop();
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
  it("notices a lapse at the next poll, not the expiry instant — the stale token is handed out until then", async () => {
    // Pins current behaviour the spec does not decide: lapse detection has
    // poll granularity, so when expiry falls BETWEEN ticks `credential()`
    // keeps returning the expired token for up to one poll interval. Any call
    // presenting it would be refused by the platform, so tightening this (an
    // expiry check inside `credential()`) is a defensible change — this test
    // is the tripwire that makes it a visible decision rather than drift.
    const SHORT = 100; // expiry at t=100 sits between the ticks at 90 and 120
    const platform = fakePlatform();
    platform.mintWith((now) => mintCredential(now, SHORT));
    const onLapse = vi.fn();
    const handle = holdGameCredential(
      identity,
      scope,
      platform.redeem,
      onLapse,
      POLL_SECONDS * 1000,
    );
    await settle();
    const first = handle.credential();
    expect(first).toBeDefined();
    platform.fail(new Error("ECONNREFUSED"));

    // Ticks at 30/60 hold, the tick at 90 tries to renew and fails quietly.
    await advanceSeconds(POLL_SECONDS * 3);
    expect(handle.credential()).toBe(first);
    expect(onLapse).not.toHaveBeenCalled();

    // t=110: past the token's own expiry, before the next tick. Current
    // behaviour: the stale token is still what `credential()` returns.
    await advanceSeconds(20);
    expect(handle.credential()).toBe(first);
    expect(onLapse).not.toHaveBeenCalled();

    // t=120: the next tick sees the lapse, drops the token, surfaces it once.
    await advanceSeconds(10);
    expect(handle.credential()).toBeUndefined();
    expect(onLapse).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
  it("retries a failed first acquisition silently and succeeds when the platform appears", async () => {
    // The spec scenario covers only failure while a credential is in hand.
    // Before anything was ever held there is nothing to lapse, so the quiet
    // discipline is extended backwards: startup is retried, not surfaced.
    const platform = fakePlatform();
    const onLapse = vi.fn();
    platform.fail(new Error("platform not yet reachable"));
    const handle = holdGameCredential(
      identity,
      scope,
      platform.redeem,
      onLapse,
      POLL_SECONDS * 1000,
    );
    await settle();
    expect(handle.credential()).toBeUndefined();

    await advanceSeconds(POLL_SECONDS * 4);
    expect(onLapse).not.toHaveBeenCalled();
    expect(handle.credential()).toBeUndefined();

    platform.recover();
    await advanceSeconds(POLL_SECONDS);
    expect(handle.credential()).toBeDefined();
    expect(onLapse).not.toHaveBeenCalled();
    handle.stop();
  });

  // spec: identity-and-authorization/client-credential-custody#own-key-is-the-only-thing-at-rest
  it("re-earns after a restart from the signing key alone: no credential survives, and the fresh one is earned by the surviving key", async () => {
    // The restart is modelled by what actually persists: `identity` survives,
    // the handle — the only place a credential ever lived — does not.
    const before = fakePlatform();
    const onLapse = vi.fn();
    const running = holdGameCredential(
      identity,
      scope,
      before.redeem,
      onLapse,
      POLL_SECONDS * 1000,
    );
    await settle();
    const earnedBeforeRestart = running.credential();
    expect(earnedBeforeRestart).toBeDefined();

    running.stop(); // the process ends; only `identity` is at rest

    const after = fakePlatform();
    const restarted = holdGameCredential(
      identity,
      scope,
      after.redeem,
      onLapse,
      POLL_SECONDS * 1000,
    );
    // Nothing is recovered: until redemption completes there is no credential.
    expect(restarted.credential()).toBeUndefined();
    await settle();

    expect(after.calls).toHaveLength(1);
    const freshAssertion = after.calls[0]?.assertion;
    expect(freshAssertion).toBeDefined();
    expect(before.calls.map((c) => c.assertion)).not.toContain(freshAssertion);
    const fresh = restarted.credential();
    expect(fresh).toBeDefined();
    expect(fresh).not.toBe(earnedBeforeRestart);

    // The fresh assertion verifies against the SAME key's public half.
    await expect(
      jwtVerify(freshAssertion as string, publicKey, {
        issuer: identity.domain,
        audience: identity.issuanceEndpoint,
      }),
    ).resolves.toBeDefined();
    restarted.stop();
  });

  // spec: identity-and-authorization/client-credential-custody#memory-only
  it("drops the held credential on stop and never redeems again", async () => {
    const platform = fakePlatform();
    const handle = holdGameCredential(
      identity,
      scope,
      platform.redeem,
      vi.fn(),
      POLL_SECONDS * 1000,
    );
    await settle();
    expect(handle.credential()).toBeDefined();

    handle.stop();
    expect(handle.credential()).toBeUndefined();

    const callsAtStop = platform.calls.length;
    await advanceSeconds(POLL_SECONDS * 40);
    expect(platform.calls).toHaveLength(callsAtStop);
    expect(handle.credential()).toBeUndefined();
  });

  // spec: identity-and-authorization/client-credential-custody#memory-only
  // A redemption in flight when `stop` is called resolves afterwards; without
  // the guard in `holdGameCredential` it re-populates the closure, leaving a
  // stopped handle holding a credential it goes on renewing forever.
  it("keeps nothing when stopped while a redemption is in flight", async () => {
    let resolveRedeem: ((token: string) => void) | undefined;
    const redeem: Redeem = () =>
      new Promise<string>((resolve) => {
        resolveRedeem = resolve;
      });
    const handle = holdGameCredential(identity, scope, redeem, vi.fn(), POLL_SECONDS * 1000);
    await settle(); // the first tick has signed its assertion and is awaiting redemption

    handle.stop();
    expect(resolveRedeem).toBeDefined();
    (resolveRedeem as (token: string) => void)(mintCredential(startSeconds));
    await settle();

    expect(handle.credential()).toBeUndefined();
  });

  // spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
  it("never runs two redemptions at once, however slow one is", async () => {
    // `setInterval` does not wait for an async callback, so a redemption
    // slower than the poll interval would be joined by the next tick's — and
    // each spends a single-use assertion the platform's replay record refuses.
    let inFlight = 0;
    let peak = 0;
    const pending: Array<(token: string) => void> = [];
    const redeem: Redeem = () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      return new Promise<string>((resolve) => {
        pending.push((token) => {
          inFlight -= 1;
          resolve(token);
        });
      });
    };

    const handle = holdGameCredential(identity, scope, redeem, vi.fn(), POLL_SECONDS * 1000);
    await settle();
    // Several poll intervals pass while the first redemption is still hanging.
    await advanceSeconds(POLL_SECONDS * 5);

    expect(peak).toBe(1);

    pending[0]?.(mintCredential(startSeconds));
    await settle();
    expect(handle.credential()).toBeDefined();
    handle.stop();
  });

  // spec: identity-and-authorization/game-credential-scope#not-valid-for-another-team
  // spec: identity-and-authorization/game-credential-scope#not-valid-for-another-game
  it("earns every credential — first and renewals alike — for the one scope custody began with", async () => {
    const platform = fakePlatform();
    const handle = holdGameCredential(
      identity,
      scope,
      platform.redeem,
      vi.fn(),
      POLL_SECONDS * 1000,
    );
    await settle();
    await advanceSeconds(LIFETIME * 2); // several renewal cycles

    expect(platform.calls.length).toBeGreaterThanOrEqual(3);
    for (const call of platform.calls) {
      expect(call.scope).toEqual({ teamId: "team-aleph", gameId: "game-42" });
    }
    handle.stop();
  });
});
