// spec: e2e/browser-exercised-surfaces
// A real browser, and one session per human.
//
// The unit of use here is the *operator*, not the page: a browser context is an
// isolated cookie jar and storage partition, so two contexts are two humans in
// a way two tabs are not. Anything about attention divided across teammates —
// exclusive snake selection, one operator seeing what another just did — is
// only observable with two of them live at once, and a harness that quietly
// used one would report a pass it had not earned.
// spec: e2e/browser-exercised-surfaces#concurrent-operators-are-concurrent-sessions
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type Browser, type BrowserContext, chromium } from "@playwright/test";

export interface OperatorSession {
  readonly context: BrowserContext;
  close(): Promise<void>;
}

export interface BrowserHarness {
  /**
   * Open a session for one human. `cookies` carries an already-established
   * platform session, so a test starts from signed-in rather than re-driving
   * sign-in it is not testing.
   */
  openOperator(cookies?: ReadonlyArray<CookieSpec>): Promise<OperatorSession>;
  close(): Promise<void>;
}

/** A cookie as Playwright wants it, narrowed to what a platform session needs. */
export interface CookieSpec {
  readonly name: string;
  readonly value: string;
  readonly url: string;
}

export async function launchBrowser(): Promise<BrowserHarness> {
  const executablePath = findChromium();
  const browser: Browser = await chromium.launch(
    executablePath === undefined ? {} : { executablePath },
  );
  const sessions = new Set<OperatorSession>();

  return {
    async openOperator(cookies?: ReadonlyArray<CookieSpec>): Promise<OperatorSession> {
      const context = await browser.newContext();
      if (cookies !== undefined && cookies.length > 0) {
        await context.addCookies(cookies.map((cookie) => ({ ...cookie })));
      }
      const session: OperatorSession = {
        context,
        async close() {
          sessions.delete(session);
          await context.close();
        },
      };
      sessions.add(session);
      return session;
    },
    async close(): Promise<void> {
      await Promise.all([...sessions].map((session) => session.close()));
      await browser.close();
    },
  };
}

/**
 * Where Chromium actually is, when it is not where Playwright expects.
 *
 * Both development environments ship a browser already, and its revision is
 * whatever the image was built with rather than the one this version of
 * Playwright asks for — so the default lookup fails on a path that does not
 * exist, while a perfectly good Chromium sits one directory over. Downloading
 * another is the wrong answer: it is ~150MB per environment for a second copy
 * of a browser that is already installed.
 *
 * Returning `undefined` leaves Playwright to its own resolution, which is
 * correct wherever the browsers were installed by Playwright itself.
 */
function findChromium(): string | undefined {
  const root = process.env["PLAYWRIGHT_BROWSERS_PATH"];
  if (root === undefined || root === "" || !existsSync(root)) return undefined;
  const candidates = readdirSync(root)
    .filter((entry) => entry.startsWith("chromium-"))
    .sort()
    .reverse();
  for (const candidate of candidates) {
    const executable = join(root, candidate, "chrome-linux", "chrome");
    if (existsSync(executable)) return executable;
  }
  return undefined;
}
