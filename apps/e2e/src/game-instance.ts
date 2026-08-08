// spec: identity-and-authorization/admission-validation
// Knocking on a published game instance's door, and reading what it said. The
// host and the module refuse in different places, so admission has two
// surfaces: the host's answer to the upgrade, and what the module then decided.
//
// **What a refused client is told: nothing.** Where the module refuses, the
// upgrade has already succeeded — the host answers `101`, the module throws,
// and the socket closes carrying no close frame and no bytes at all. So the
// refusal *reason* is not on this surface and cannot be put there; it is in the
// module's log, which is why the second half of this file exists and why it
// needs the database owner's credential to read.
//
// The upgrade is driven by hand rather than through `spacetimedb/sdk`. The SDK
// reports a refusal as `onDisconnect` with no argument — strictly less than the
// raw socket gives, and never the host's status. And its `openWebSocket`
// reaches the socket by exchanging the presented token at
// `/v1/identity/websocket-token` first, which re-mints it under the host's own
// key with a fresh sixty-second lifetime. That exchange is the browser's path
// and is asserted on directly through `exchangedForWebsocketToken` below,
// rather than being reasoned around: it preserves the claims admission decides
// on, and only the header path lets a scenario choose a lifetime of its own.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { request } from "node:http";
import { promisify } from "node:util";
import type { SpacetimeHost } from "./runtimes/spacetimedb";

const execFileAsync = promisify(execFile);

/** How a connection attempt ended. */
export interface ConnectionAttempt {
  /**
   * The status the host answered with. `101` means the host raised no objection
   * of its own and the connection reached the module — including when the
   * module then refused it.
   */
  readonly status: number;
  /**
   * The host's own reason, where it refused before the module ran — the token
   * was signed by the wrong key, or names an algorithm it will not accept.
   * Empty where the host raised no objection.
   */
  readonly reason: string;
  /**
   * Whether the module closed the connection after the upgrade succeeded —
   * the whole of what a refused client learns (see the header). `false` with a
   * status of `101` is an *admitted* client: the socket was still open when the
   * harness let it go.
   */
  readonly closedByModule: boolean;
}

/** Long enough for the module to run and the socket to close; short enough to fail fast. */
const ATTEMPT_TIMEOUT_MS = 15_000;

/**
 * How long an upgraded socket that is still open is watched before it is called
 * admitted.
 *
 * There is no positive signal for "the module did not refuse me": an admitted
 * client's socket simply stays open, exactly as it does in the instant before a
 * refusal closes it. So the two are told apart by waiting, and this is how long
 * — comfortably longer than a module takes to throw on the connect path, and
 * short enough that a scenario asserting admission does not feel it.
 */
const ADMITTED_SETTLE_MS = 1_500;

/**
 * Attempt one client connection to `database`, presenting `token` if given, and
 * answer once it has been settled either way.
 *
 * The `Authorization` header carries the credential directly on the upgrade,
 * which a browser could not do and Node can — and which is what keeps the token
 * the module sees the one the platform signed (see the header).
 */
export function attemptConnection(
  host: Pick<SpacetimeHost, "url">,
  database: string,
  token?: string,
): Promise<ConnectionAttempt> {
  // Required, and required to be non-zero: an all-zero connection id is refused
  // with a status that looks exactly like an authorization failure.
  const connectionId = randomBytes(16).toString("hex");
  const url = new URL(
    `/v1/database/${database}/subscribe?compression=None&connection_id=${connectionId}`,
    host.url,
  );

  return new Promise<ConnectionAttempt>((resolve, reject) => {
    const attempt = request(url, {
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": randomBytes(16).toString("base64"),
        "sec-websocket-protocol": "v1.json.spacetimedb",
        ...(token !== undefined && { authorization: `Bearer ${token}` }),
      },
      timeout: ATTEMPT_TIMEOUT_MS,
    });

    // The host objected itself, and said why in the body.
    attempt.on("response", (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          reason: body.trim(),
          closedByModule: false,
        }),
      );
    });

    // The upgrade succeeded, so the module ran. Settling on the close rather
    // than here is what makes the module's decision — and therefore its log
    // line — already made by the time this resolves.
    //
    // But an admitted client is never closed, so the close cannot be waited for
    // unconditionally (see `ADMITTED_SETTLE_MS`). Either way the socket is
    // destroyed here — a live socket left behind holds the connection open on
    // the module's side and keeps this process from exiting.
    attempt.on("upgrade", (_response, socket) => {
      const settled = (closedByModule: boolean) => {
        clearTimeout(admitted);
        socket.destroy();
        resolve({ status: 101, reason: "", closedByModule });
      };
      const admitted = setTimeout(() => settled(false), ADMITTED_SETTLE_MS);
      socket.on("close", () => settled(true));
      socket.on("error", () => settled(true));
    });

    attempt.on("timeout", () => attempt.destroy(new Error("connection attempt timed out")));
    attempt.on("error", reject);
    attempt.end();
  });
}

/**
 * Trade `token` at the host's `/v1/identity/websocket-token`, and answer with
 * the token the host mints in its place.
 *
 * This is the exchange the SpacetimeDB SDK performs before every connection,
 * and so the exchange a browser's connection goes through — a browser cannot
 * set an `Authorization` header on a WebSocket upgrade, which is the only way
 * around it. `connect-time-validation#re-issuance-preserves-the-binding` makes
 * what happens to the claims here something the platform has to know rather
 * than assume, and no unit test can say: the re-minting is the host's.
 *
 * spec: identity-and-authorization/connect-time-validation#re-issuance-preserves-the-binding
 */
export async function exchangedForWebsocketToken(
  host: Pick<SpacetimeHost, "url">,
  token: string,
): Promise<string> {
  const response = await fetch(new URL("/v1/identity/websocket-token", host.url), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`token exchange refused: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).token as string;
}

/**
 * A reader for what a published module has written to its log.
 *
 * This is the database owner's view, not a client's, and it is needed because a
 * client is told nothing (see the header). `mark` and `after` are a pair so
 * that a scenario can attribute lines to the attempt it just made rather than
 * to the run so far.
 */
export interface ModuleLog {
  /** How much the module has written so far, as a point to read on from. */
  mark(): Promise<number>;
  /**
   * What the module wrote after `mark`. Waits briefly for a line to appear, so
   * an empty answer means the module wrote nothing rather than that the log had
   * not caught up — which is the assertion made about a connection the host
   * refused before the module ever ran.
   */
  after(mark: number): Promise<ReadonlyArray<string>>;
}

/** How long an empty answer from `after` waits before it is believed. */
const LOG_SETTLE_MS = 5_000;
const LOG_POLL_MS = 100;

/** More than any one scenario writes, and the endpoint's answer is the tail. */
const LOG_LINES = 1000;

export async function moduleLog(
  host: Pick<SpacetimeHost, "url">,
  database: string,
): Promise<ModuleLog> {
  // The CLI's own identity published the module, so it is the database owner —
  // the only identity this endpoint answers. Anonymous gets a 403 naming the
  // `view module logs` action.
  const shown = await execFileAsync("spacetime", ["login", "show", "--token"]);
  const owner = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/.exec(shown.stdout)?.[0];
  if (owner === undefined) throw new Error(`no owner token in: ${shown.stdout}`);

  const read = async (): Promise<ReadonlyArray<string>> => {
    const response = await fetch(
      `${host.url}/v1/database/${database}/logs?num_lines=${LOG_LINES}`,
      {
        headers: { authorization: `Bearer ${owner}` },
      },
    );
    if (!response.ok) {
      throw new Error(`module log refused: ${response.status} ${await response.text()}`);
    }
    // One JSON object per line, of which the message is the part a scenario
    // reads; the level and timestamp beside it belong to the host's framing.
    return (await response.text())
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => String((JSON.parse(line) as { message?: unknown }).message ?? line));
  };

  return {
    async mark(): Promise<number> {
      return (await read()).length;
    },
    async after(mark: number): Promise<ReadonlyArray<string>> {
      const deadline = Date.now() + LOG_SETTLE_MS;
      for (;;) {
        const written = (await read()).slice(mark);
        if (written.length > 0 || Date.now() > deadline) return written;
        await new Promise((settle) => setTimeout(settle, LOG_POLL_MS));
      }
    },
  };
}
