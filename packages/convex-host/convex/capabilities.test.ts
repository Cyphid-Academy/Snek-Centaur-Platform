// spec: identity-and-authorization/anonymous-reach
// A tripwire, not a unit test.
//
// `anonymous-reach` fixes the anonymously reachable set at exactly four, and
// names them. Everything else about reach is enforced without a test — the
// registry carries the flag, so no second list can disagree with it, and
// `scripts/check-public-surface.mjs` refuses an entry that declares reach
// without citing the scenario that justifies it. What neither catches is a
// fourth capability arriving *with* a plausible-looking citation, which is
// exactly how a set like this widens: one entry at a time, each defensible on
// its own, none of them a decision anybody made.
//
// So this pins the set itself. It is meant to fail on a change, and the fix
// when it does is never to update the list here: it is to revise the
// requirement, which is what makes widening reach a thing with an author.
//
// It has fired once, and the procedure held: the sign-in entry route is reached
// by a browser that has no credential yet, so `begin-sign-in` is a fourth entry.
// `anonymous-reach` was revised to say four and to carry
// `#sign-in-entry-exposes-no-principal`, and this list followed the requirement
// rather than leading it.
import { describe, expect, it } from "vitest";
import { ANONYMOUS_CAPABILITIES } from "./capabilities";

describe("what a caller with no credential reaches", () => {
  it("is these four and nothing else", () => {
    expect([...ANONYMOUS_CAPABILITIES].sort()).toEqual([
      "begin-sign-in",
      "exchange-assertion",
      "read-platform-status",
      "redeem-handoff",
    ]);
  });
});
