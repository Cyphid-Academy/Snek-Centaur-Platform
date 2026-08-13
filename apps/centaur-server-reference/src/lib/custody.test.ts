// spec: identity-and-authorization/client-credential-custody,
//       identity-and-authorization/token-lifetime-and-refresh
// Custody at its clock: renewal ahead of expiry on the holder's own schedule,
// quiet retry while the credential still works, and the lapse handover when
// nothing in memory can answer any more.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as custody from "./custody";

/** A syntactically credential-shaped token expiring `inSeconds` from now. */
function tokenExpiring(inSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + inSeconds }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  custody.release();
  vi.useRealTimers();
});

describe("custody", () => {
  it("holds a credential without revealing it, and only until it expires", async () => {
    const credential = tokenExpiring(15 * 60);
    custody.adopt({ credential }, { renew: vi.fn(), onLapse: vi.fn() });

    expect(custody.holds()).toBe(true);
    await expect(custody.withCredential(async (held) => held)).resolves.toBe(credential);

    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(custody.holds()).toBe(false);
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
  it("renews ahead of expiry, not in reaction to anything", async () => {
    const renew = vi.fn(async () => ({
      credential: tokenExpiring(15 * 60),
      renewal: "link-2",
    }));
    custody.adopt(
      { credential: tokenExpiring(15 * 60), renewal: "link-1" },
      { renew, onLapse: vi.fn() },
    );

    // Five minutes out is the margin; nothing happens before ten minutes.
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
    expect(renew).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(renew).toHaveBeenCalledOnce();
    expect(renew).toHaveBeenCalledWith(expect.any(String), "link-1");
    expect(custody.holds()).toBe(true);
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites
  it("retries a failed renewal quietly while the credential still works", async () => {
    const renew = vi
      .fn<(credential: string, renewal: string) => Promise<custody.Grant>>()
      .mockRejectedValueOnce(new Error("briefly unreachable"))
      .mockImplementation(async () => ({ credential: tokenExpiring(15 * 60), renewal: "link-2" }));
    const onLapse = vi.fn();
    custody.adopt({ credential: tokenExpiring(15 * 60), renewal: "link-1" }, { renew, onLapse });

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 30 * 1000);

    expect(renew).toHaveBeenCalledTimes(2);
    expect(onLapse).not.toHaveBeenCalled();
    expect(custody.holds()).toBe(true);
  });

  // The chain could not be re-forged before the credential lapsed: memory has
  // nothing left to answer with, and the session cookie is the one credential
  // that can — so custody hands the problem back to the page.
  // spec: identity-and-authorization/client-credential-custody#the-session-is-the-only-thing-a-reload-recovers
  it("hands over to onLapse when renewal keeps failing past expiry", async () => {
    const renew = vi.fn(async (): Promise<custody.Grant> => {
      throw new Error("still unreachable");
    });
    const onLapse = vi.fn();
    custody.adopt({ credential: tokenExpiring(15 * 60), renewal: "link-1" }, { renew, onLapse });

    await vi.advanceTimersByTimeAsync(16 * 60 * 1000);

    expect(onLapse).toHaveBeenCalledOnce();
    expect(custody.holds()).toBe(false);
  });

  it("hands over at expiry when the grant carried no renewal link", async () => {
    const onLapse = vi.fn();
    custody.adopt({ credential: tokenExpiring(15 * 60) }, { renew: vi.fn(), onLapse });

    await vi.advanceTimersByTimeAsync(16 * 60 * 1000);

    expect(onLapse).toHaveBeenCalledOnce();
    expect(custody.holds()).toBe(false);
  });

  // spec: identity-and-authorization/client-credential-custody#concealed-from-co-resident-scripts
  // The sweep a co-resident script actually runs: storage, globals, the DOM.
  // Custody holds a credential during the check, and none of them has it.
  it("keeps what it holds out of storage, globals, and the DOM", () => {
    const credential = tokenExpiring(15 * 60);
    custody.adopt({ credential, renewal: "link-1" }, { renew: vi.fn(), onLapse: vi.fn() });

    expect(JSON.stringify(Object.values({ ...window.localStorage }))).not.toContain(credential);
    expect(JSON.stringify(Object.values({ ...window.sessionStorage }))).not.toContain(credential);
    const globals = Object.getOwnPropertyNames(window).map(
      (name) => (window as unknown as Record<string, unknown>)[name],
    );
    expect(globals).not.toContain(credential);
    expect(document.documentElement.outerHTML).not.toContain(credential);
  });

  it("releases on demand and refuses use afterwards", async () => {
    custody.adopt({ credential: tokenExpiring(15 * 60) }, { renew: vi.fn(), onLapse: vi.fn() });
    custody.release();

    expect(custody.holds()).toBe(false);
    await expect(custody.withCredential(async (held) => held)).rejects.toThrow(
      /holds no credential/,
    );
  });
});
