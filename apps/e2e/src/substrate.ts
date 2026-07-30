// spec: e2e/hermetic-substrate
// The whole system, up and talking to itself.
//
// This is the one entry point a test uses. It brings up all three runtime kinds
// — the Convex deployment, a SpacetimeDB host, and two Centaur Servers — on
// ports and storage this run owns, wires each to the others' addresses, and
// hands back the handles.
//
// Order matters in one place: Convex is told where the SpacetimeDB host is
// (games are provisioned there), and the Servers are told where Convex is, so
// Convex starts first and the Servers last. Nothing is told about anything it
// does not address.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freePorts } from "./ports";
import { type CentaurServer, startCentaurServer } from "./runtimes/centaur-server";
import { type ConvexDeployment, startConvex } from "./runtimes/convex";
import { type SpacetimeHost, startSpacetime } from "./runtimes/spacetimedb";
import { stopAll } from "./service";

export interface Substrate {
  readonly convex: ConvexDeployment;
  readonly spacetime: SpacetimeHost;
  /** The two team servers, in the order they were started. */
  readonly centaurServers: ReadonlyArray<CentaurServer>;
  /** Stop everything and remove this run's state. */
  stop(): Promise<void>;
}

export interface SubstrateOptions {
  /** How many Centaur Servers to run. Two by default — a game has two teams. */
  readonly centaurServerCount?: number | undefined;
}

export async function startSubstrate(options: SubstrateOptions = {}): Promise<Substrate> {
  const serverCount = options.centaurServerCount ?? 2;
  const stateDir = mkdtempSync(join(tmpdir(), "snek-e2e-"));
  const [convexPort, convexSitePort, spacetimePort, ...serverPorts] = await freePorts(
    3 + serverCount,
  );

  try {
    // Undefined ports cannot happen — `freePorts` returns exactly what was
    // asked for — but the workspace forbids unchecked indexing, and asserting
    // it here is cheaper than a non-null assertion at four call sites.
    if (convexPort === undefined || convexSitePort === undefined || spacetimePort === undefined) {
      throw new Error("port allocation returned fewer ports than requested");
    }

    // Each runtime's directory is created before it is started: a process
    // handed a working directory that does not exist fails with an ENOENT
    // naming the executable, which reads as "the binary is missing" and sends
    // the reader looking in entirely the wrong place.
    const convexDir = join(stateDir, "convex");
    const spacetimeDir = join(stateDir, "spacetime");
    mkdirSync(convexDir, { recursive: true });
    mkdirSync(spacetimeDir, { recursive: true });

    const convex = await startConvex({
      port: convexPort,
      siteProxyPort: convexSitePort,
      dataDir: convexDir,
    });

    const spacetime = await startSpacetime({
      port: spacetimePort,
      dataDir: spacetimeDir,
    });

    // The deployment provisions a database per game on this host, so it is the
    // one address Convex needs and the reason the host is started before the
    // deployment is configured rather than before it is started.
    await convex.setEnv("STDB_MANAGEMENT_BASE_URL", spacetime.url);

    const centaurServers: CentaurServer[] = [];
    for (const [index, port] of serverPorts.entries()) {
      centaurServers.push(
        await startCentaurServer({
          port,
          label: String.fromCharCode(97 + index),
          env: { CONVEX_URL: convex.url, CONVEX_SITE_URL: convex.siteUrl },
        }),
      );
    }

    return {
      convex,
      spacetime,
      centaurServers,
      async stop(): Promise<void> {
        await stopAll();
        rmSync(stateDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    // Whatever did come up is already in the registry, so this reaches the
    // processes a partial start left behind — which are exactly the ones that
    // would otherwise hold a port until the machine is rebooted.
    // spec: e2e/hermetic-substrate#teardown-does-not-leak-into-the-next-run
    await stopAll();
    rmSync(stateDir, { recursive: true, force: true });
    throw error;
  }
}
