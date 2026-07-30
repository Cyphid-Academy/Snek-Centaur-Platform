// spec: e2e/hermetic-substrate
// Port allocation for a run.
//
// Every runtime here has a documented default port — SpacetimeDB on 3000,
// Convex on 3210/3211, the Centaur Server on 5000 — and the harness uses none
// of them. Those are the ports a developer's own `pnpm dev:*` processes are
// sitting on, and a suite that claims them either fails to start or, worse,
// succeeds by talking to the developer's deployment and writing to its state.
//
// So ports are asked of the operating system per run. That also makes two runs
// on one machine independent, which is what lets the suite be sharded later
// without revisiting this decision.
import { createServer } from "node:net";

/**
 * Reserve a port the OS says is free.
 *
 * There is an unavoidable race here — the port is released before the child
 * binds it — and it is the same race every test runner in this position lives
 * with. It is narrow, and the alternative (holding the socket and passing the
 * descriptor) is not something the runtimes here accept.
 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("could not read the reserved port back"));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

/** Reserve `count` distinct free ports. */
export async function freePorts(count: number): Promise<number[]> {
  const ports: number[] = [];
  // Sequential rather than Promise.all: concurrent binds to :0 can be handed
  // the same port once the first is closed, and a duplicate here surfaces much
  // later as one runtime failing to bind.
  for (let i = 0; i < count; i++) {
    let port = await freePort();
    while (ports.includes(port)) port = await freePort();
    ports.push(port);
  }
  return ports;
}
