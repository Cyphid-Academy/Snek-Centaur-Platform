// Static Better Auth instance for the @better-auth/cli schema generation
// recipe ONLY (see packages/convex-host/AGENTS.md). Nothing imports this at
// runtime; the CLI loads it to derive ./schema.ts from the configured
// plugins and additional fields.
import { createAuth } from "../auth.js";

// biome-ignore lint/suspicious/noExplicitAny: the CLI never invokes a ctx.
export const auth = createAuth({} as any);
