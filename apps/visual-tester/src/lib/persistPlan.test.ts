// spec: visual-tester/auto-persist, visual-tester/history-rewrite — the
// fork/update/materialize decision for auto-persistence.
import { describe, expect, it } from "vitest";
import { branchName, planPersist, stripBranch } from "./persistPlan";

const base = { boundId: null, sourceIsFixture: false, wasMiddle: false, k: 0, name: "s" };

describe("planPersist", () => {
  it("materializes the first scratch for a brand-new session's head edit", () => {
    expect(planPersist(base)).toEqual({ kind: "create", name: "s" });
  });

  it("updates the bound scratch in place for a head edit", () => {
    expect(planPersist({ ...base, boundId: "s-abc", k: 3 })).toEqual({
      kind: "update",
      id: "s-abc",
      name: "s",
    });
  });

  it("forks a new scratch for a middle edit, naming the branch point", () => {
    expect(planPersist({ ...base, boundId: "s-abc", wasMiddle: true, k: 2 })).toEqual({
      kind: "fork",
      name: "s (branch @turn 2)",
    });
  });

  it("forks when a loaded fixture is first modified, even at the head", () => {
    expect(
      planPersist({ ...base, boundId: null, sourceIsFixture: true, wasMiddle: false, k: 4 }),
    ).toEqual({ kind: "fork", name: "s (branch @turn 4)" });
  });
});

describe("branch naming", () => {
  it("appends the branch point", () => {
    expect(branchName("golden", 3)).toBe("golden (branch @turn 3)");
  });
  it("does not stack suffixes across repeated forks", () => {
    expect(branchName("golden (branch @turn 3)", 1)).toBe("golden (branch @turn 1)");
    expect(stripBranch("golden (branch @turn 3)")).toBe("golden");
  });
});
