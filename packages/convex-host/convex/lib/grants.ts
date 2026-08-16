// What each principal's credential is MINTED with. Minting is the only
// place a capability set is assembled; enforcement reads the structured
// claim back (lib/registry.ts) and never re-derives it.
// spec: identity-and-authorization/capability-claim-structure
import type { CapabilityEntry } from "@cyphid/snek-platform-auth";

/**
 * The capability entries a human's working credential carries. Every
 * authenticated human holds the platform-use grants; the admin designation
 * on the user record adds `administer-platform`. Minted into the working
 * JWT at issuance, from the user record's CURRENT value — a designation
 * change reaches new credentials on the next (at most 15-minute) renewal,
 * and reaches reactive queries immediately (see platform-admin-role notes
 * in convex/auth.ts).
 */
export function humanCapabilityEntries(isAdmin: boolean): Array<CapabilityEntry> {
  const entries: Array<CapabilityEntry> = [
    { verb: "use-platform" },
    { verb: "configure-games" },
    { verb: "designate-boards" },
    { verb: "issue-game-tokens" },
  ];
  if (isAdmin) {
    entries.push({ verb: "administer-platform" });
  }
  return entries;
}
