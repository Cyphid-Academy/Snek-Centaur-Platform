// spec: global-invariants/runtime-ownership
// The whole system, up and talking to itself.
//
// One test, and it asserts almost nothing — deliberately. What it establishes
// is that the three runtimes the platform deploys can be stood up together on
// one machine, that each is reachable through the surface a deployment reaches
// it through, and that the artifacts built for them load into them. Every
// behavioural claim belongs to the capability that owns the behaviour and
// arrives with that capability's own change.
//
// Publishing the module is the part nothing else covers. The module is
// typechecked and bundled by other gates, and both pass on a module the host
// refuses at load — the refusal is the host walking a module's exports, and
// neither `tsc` nor `spacetime build` walks them.
import { expect, test } from "./fixtures";

/** This run's game, as a database name. One instance is one game. */
const DATABASE = "snek-e2e-stack";

test("the three runtimes come up together", async ({ spacetime, convex, centaurServer }) => {
  await expect(spacetime.publish(DATABASE)).resolves.toBeUndefined();

  // Through the CLI, against the deployment the harness started: a function
  // that was pushed, on a backend that is serving it.
  expect(await convex.run("platform:platformStatus")).toMatchObject({ ok: true });

  const healthcheck = await fetch(centaurServer.healthcheckUrl);
  expect(healthcheck.status).toBe(200);
  expect(await healthcheck.json()).toMatchObject({ status: "ok" });
});
