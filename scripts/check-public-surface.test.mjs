// Suite for the capability-declaration totality check
// (`scripts/check-public-surface.mjs`, `pnpm check:public-surface`).
//
// What these pin is that each rule *fires*. The check is a lexical tripwire
// over a directory, so its failure mode is not a wrong answer but a silent one:
// a rename, a regex edit, or a moved directory leaves it scanning nothing and
// exiting 0 exactly as a clean surface does. Every case below therefore builds
// a violation and asserts the problem is reported, and the last one asserts the
// scan still reaches the real tree.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { publicSurfaceProblems, sources } from "./check-public-surface.mjs";

const write = (root, path, content) => {
  mkdirSync(join(root, dirname(path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

// The registry is read unconditionally, so every fixture needs one. This is the
// shape the real `capabilities.ts` has: one anonymous entry, cited directly
// above it.
const CLEAN_REGISTRY = `export const CAPABILITIES = {
  // spec: identity-and-authorization/anonymous-reach#liveness-exposes-no-principal
  "read-platform-status": {
    reaches: "Liveness of the deployment.",
    anonymous: true,
  },
  "issue-game-token": { reaches: "Obtain a game access token." },
} as const;
`;

// A convex directory containing `files` plus a clean registry, unless the
// fixture supplies its own `capabilities.ts`.
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "public-surface-"));
  if (!files["capabilities.ts"]) write(root, "capabilities.ts", CLEAN_REGISTRY);
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  return root;
}

const problems = (files) => publicSurfaceProblems(fixture(files));
const joined = (files) => problems(files).join("\n");

describe("rule 1 — only publicFunctions.ts may import a raw builder", () => {
  it("refuses a named builder import from _generated/server", () => {
    expect(joined({ "status.ts": `import { query } from "./_generated/server";\n` })).toMatch(
      /status\.ts: imports `query`.*build it with publicFunctions\.ts/,
    );
  });

  it("refuses one from convex/server, the other spelling of the same module", () => {
    expect(joined({ "status.ts": `import { httpAction } from "convex/server";\n` })).toMatch(
      /imports `httpAction`/,
    );
  });

  it("refuses a renamed builder, which the import binding hides", () => {
    expect(
      joined({ "status.ts": `import { query as rawQuery } from "./_generated/server";\n` }),
    ).toMatch(/imports `query as rawQuery`/);
  });

  it("allows the import inside publicFunctions.ts, the one declaration site", () => {
    expect(
      problems({
        "publicFunctions.ts": `import { query, mutation } from "./_generated/server";\n`,
      }),
    ).toEqual([]);
  });

  it("ignores imports of anything that is not a builder, and of other modules", () => {
    expect(
      problems({
        "status.ts": `import { v } from "convex/values";\nimport { query } from "./helpers";\n`,
      }),
    ).toEqual([]);
  });
});

describe("rule 2 — no namespace import of a builder module", () => {
  // The case that walks past rule 1 and rule 3 at once: the named-import scan
  // never sees a builder's name, and `server.query(...)` heads no `export const`.
  it("refuses `import * as`, which both other rules would miss", () => {
    expect(
      joined({
        "status.ts": `import * as server from "./_generated/server";\nexport const get = server.query({ handler: () => 1 });\n`,
      }),
    ).toMatch(/status\.ts: imports all of "\.\/_generated\/server"/);
  });

  it("ignores a namespace import of an unrelated module", () => {
    expect(problems({ "status.ts": `import * as helpers from "./helpers";\n` })).toEqual([]);
  });
});

describe("rule 3 — an exported handler is headed by a declaring builder", () => {
  it("refuses a handler built by a raw builder", () => {
    expect(joined({ "status.ts": "export const get = query({ handler: () => 1 });\n" })).toMatch(
      /status\.ts: `get` defines a handler without a declared capability/,
    );
  });

  for (const builder of ["publicQuery", "publicMutation", "publicAction", "publicHttpAction"]) {
    it(`allows ${builder}, which makes the declaration a type error to omit`, () => {
      expect(
        problems({
          "status.ts": `export const get = ${builder}({ capability: "read-platform-status", handler: () => 1 });\n`,
        }),
      ).toEqual([]);
    });
  }

  for (const builder of ["internalQuery", "internalMutation", "internalAction"]) {
    it(`allows ${builder}, which no capability declares because nothing reaches it`, () => {
      expect(
        problems({ "status.ts": `export const get = ${builder}({ handler: () => 1 });\n` }),
      ).toEqual([]);
    });
  }

  // The exemption is a named set, not a prefix — the script says so, so it is
  // worth a test that would fail the day someone "simplifies" it to a prefix.
  it("refuses a builder that only looks internal", () => {
    expect(
      joined({ "status.ts": "export const get = internalIshMutation({ handler: () => 1 });\n" }),
    ).toMatch(/`get` defines a handler without a declared capability/);
  });

  it("ignores an export that defines no handler", () => {
    expect(
      problems({ "status.ts": `export const LIMIT = Number(process.env["LIMIT"]);\n` }),
    ).toEqual([]);
  });
});

describe("scope — the files Convex actually deploys", () => {
  const violation = `import { query } from "./_generated/server";\n`;

  // Convex's bundler skips a function module whose name has more than one dot,
  // so the suites and the harness beside these functions are not deployed.
  for (const name of ["status.test.ts", "harness.testing.ts"]) {
    it(`ignores ${name}, which is not deployed`, () => {
      expect(problems({ [name]: violation })).toEqual([]);
    });
  }

  for (const name of ["convex.config.ts", "auth.config.ts"]) {
    it(`covers ${name}, an entry point the dot rule would otherwise drop`, () => {
      expect(problems({ [name]: violation })).not.toEqual([]);
    });
  }

  it("ignores _generated/, which is Convex's output rather than our source", () => {
    expect(problems({ "_generated/server.ts": violation })).toEqual([]);
  });

  it("descends into subdirectories", () => {
    expect(joined({ "sign_in/handoff.ts": violation })).toMatch(/handoff\.ts: imports `query`/);
  });

  it("ignores non-TypeScript files", () => {
    expect(problems({ "README.md": violation })).toEqual([]);
  });
});

describe("anonymous reach — every declaration cites why it qualifies", () => {
  // spec: identity-and-authorization/anonymous-reach
  it("accepts the real registry's shape", () => {
    expect(problems({})).toEqual([]);
  });

  it("refuses an entry that declares reach with no citation", () => {
    expect(
      joined({
        "capabilities.ts": `export const CAPABILITIES = {
  "read-platform-status": { reaches: "Liveness.", anonymous: true },
} as const;
`,
      }),
    ).toMatch(/`read-platform-status` declares anonymous reach without citing why/);
  });

  // The justification generalises, so a second entry leaning on the first one's
  // scenario is the way a fifth anonymous capability would arrive without the
  // spec revision `anonymous-reach` requires.
  it("refuses two entries citing the same scenario", () => {
    expect(
      joined({
        "capabilities.ts": `export const CAPABILITIES = {
  // spec: identity-and-authorization/anonymous-reach#liveness-exposes-no-principal
  "read-platform-status": {
    reaches: "Liveness.",
    anonymous: true,
  },
  // spec: identity-and-authorization/anonymous-reach#liveness-exposes-no-principal
  "read-something-else": {
    reaches: "Something else.",
    anonymous: true,
  },
} as const;
`,
      }),
    ).toMatch(/both cite #liveness-exposes-no-principal/);
  });

  it("says nothing about an entry that declares no reach", () => {
    expect(
      problems({
        "capabilities.ts": `export const CAPABILITIES = {
  "issue-game-token": { reaches: "Obtain a game access token." },
} as const;
`,
      }),
    ).toEqual([]);
  });
});

// The one case that reads the repo rather than a fixture. Everything above
// passes just as happily when `sources()` returns nothing at all, which is what
// a moved directory or a broken walk would produce — and the check would exit 0
// on a surface it never looked at.
describe("the scan reaches the real host", () => {
  const convexDir = new URL("../packages/convex-host/convex", import.meta.url).pathname;

  it("finds the host's function modules, including the declaration site", () => {
    const found = sources(convexDir);
    expect(found.length).toBeGreaterThan(1);
    expect(found.some((p) => p.endsWith("publicFunctions.ts"))).toBe(true);
    expect(found.some((p) => p.endsWith("capabilities.ts"))).toBe(true);
  });

  it("excludes the suites beside them and Convex's generated output", () => {
    const found = sources(convexDir);
    expect(found.some((p) => p.includes("_generated"))).toBe(false);
    expect(found.some((p) => p.endsWith(".test.ts"))).toBe(false);
  });

  it("reports the host's surface as clean", () => {
    expect(publicSurfaceProblems(convexDir)).toEqual([]);
  });
});
