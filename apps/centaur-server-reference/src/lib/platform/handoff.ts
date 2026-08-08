// spec: identity-and-authorization/sign-in-handoff
// The browser's half of the platform's sign-in handoff, shared by every page of
// this Server that needs a human's identity to reach the platform.
//
// A Snek Centaur Server never authenticates a human itself: the platform
// completes the sign-in at its own origin and returns the browser here carrying
// an opaque reference, which this page redeems for a credential with a verifier
// it kept across the trip. What the reference can be exchanged for is bounded by
// this Server's registered ceiling.
// spec: identity-and-authorization/sign-in-handoff#server-never-holds-the-provider-exchange
// spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
// spec: identity-and-authorization/client-credential-custody#memory-only
import { api } from "@cyphid/snek-convex-host/api";
import { ConvexHttpClient } from "convex/browser";

/** Where this Server is, as the platform's registration of it records. */
export interface PlatformAddresses {
  /** Where a client calls the platform's functions. */
  readonly convexUrl: string;
  /** The platform's HTTP origin, where the sign-in entry route lives. */
  readonly convexSiteUrl: string;
  /** This Server, as its registration with the platform names it. */
  readonly issuerId: string;
  /**
   * Where the platform is asked to return the browser. It must be one the
   * registration records — the platform refuses any other, which is what stops
   * it being a trusted-looking bounce to anywhere.
   * spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
   */
  readonly returnAddress: string;
}

/**
 * What a page kept for the reference it is about to be handed: the verifier the
 * redemption is proved with, and whatever else the round trip would otherwise
 * lose — the return address is registered, so nothing may be appended to it.
 */
interface Kept<TState> {
  readonly verifier: string;
  readonly state: TState;
}

/**
 * Start the round trip: keep a verifier, send its challenge, hand over.
 *
 * The verifier waits in session storage because the trip is a top-level
 * navigation, which discards everything in memory. It is not a credential and
 * opens nothing on its own — what it proves is that this page is the one the
 * reference was minted for.
 */
export async function beginHandoff<TState>(
  key: string,
  platform: PlatformAddresses,
  state: TState,
): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  window.sessionStorage.setItem(key, JSON.stringify({ verifier, state } satisfies Kept<TState>));

  const entry = new URL("/sign-in", platform.convexSiteUrl);
  entry.searchParams.set("issuer", platform.issuerId);
  entry.searchParams.set("return", platform.returnAddress);
  entry.searchParams.set("challenge", await challenge(verifier));
  window.location.href = entry.toString();
}

/**
 * What this page kept, taken and cleared in one step: a verifier is answerable
 * for exactly one reference, and one left behind is one a later arrival could be
 * redeemed against.
 * spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
 */
export function takeKept<TState>(key: string): Kept<TState> | null {
  const kept = window.sessionStorage.getItem(key);
  window.sessionStorage.removeItem(key);
  if (kept === null) return null;
  try {
    return JSON.parse(kept) as Kept<TState>;
  } catch {
    return null;
  }
}

/** Exchange the reference for the credential it was minted for. */
export async function redeemHandoff(
  convexUrl: string,
  reference: string,
  verifier: string,
): Promise<string> {
  const client = new ConvexHttpClient(convexUrl);
  return await client.action(api.issuance.redeemSignInHandoff, { reference, verifier });
}

/** The challenge a verifier answers to: base64url of its SHA-256. */
async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  // Byte by byte, never `String.fromCharCode(...bytes)`: spreading puts every
  // byte on the argument stack, which overflows on inputs a lot smaller than
  // "large" — fine at 32 bytes, a trap for the next reuse.
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
