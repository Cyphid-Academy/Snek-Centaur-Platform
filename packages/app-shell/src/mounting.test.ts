// spec: application-shell/surface-mounting-contract
// The contract's substance is what a mounting carries and what it withholds,
// so these are the tests that can be written about it: the affordance lookup,
// and a standing assertion that nothing identifying who is present has been
// added to the type over time.
import { describe, expect, expectTypeOf, it } from "vitest";
import { type SurfaceMounting, noAffordances, offers } from "./lib/mounting";

interface ConfigurationAffordances {
  readonly inspect: boolean;
  readonly edit: boolean;
  readonly designate: boolean;
}

const mounting: SurfaceMounting<ConfigurationAffordances> = {
  mode: "live",
  affordances: { inspect: true, edit: true, designate: false },
};

describe("surface mounting", () => {
  it("reads an affordance the host stated", () => {
    expect(offers(mounting, "edit")).toBe(true);
    expect(offers(mounting, "designate")).toBe(false);
  });

  // #the-host-states-what-is-offered: two mountings of one surface differ only
  // in what the host stated — nothing in the mounting could produce a
  // difference of its own.
  it("carries only the mode and the affordances", () => {
    expectTypeOf<keyof SurfaceMounting<ConfigurationAffordances>>().toEqualTypeOf<
      "mode" | "affordances"
    >();
  });

  it("withholds every affordance for an inspection-only mounting", () => {
    const inspectionOnly = noAffordances(mounting.affordances);
    expect(inspectionOnly).toEqual({ inspect: false, edit: false, designate: false });
  });
});
