// @cyphid/snek-platform-auth — the shared credential vocabulary.
//
// The one declaration of what a game token's subject means, what shape a
// capability claim takes, and what audience names which resource — read by
// every runtime that mints or admits on the platform's credentials, so
// drift between minting and admission is impossible by construction.
// spec: identity-and-authorization/identity-kinds,
//       identity-and-authorization/game-token-contents,
//       identity-and-authorization/capability-claim-structure,
//       identity-and-authorization/audience-bound-tokens

export type { PersistentPrincipalKind, GameRole } from "./principal.js";

export type { GameSubject } from "./game-subject.js";
export {
  encodeGameSubject,
  decodeGameSubject,
  roleOf,
  teamBindingOf,
  mayMutate,
} from "./game-subject.js";

export type { Capability, CapabilityEntry } from "./capabilities.js";
export {
  CAPABILITIES,
  CAPABILITIES_CLAIM,
  ACTING_PRINCIPAL_CLAIM,
  GAME_CREDENTIAL_CAPABILITIES,
  readCapabilityEntries,
  hasCapability,
} from "./capabilities.js";

export { platformAudience, gameAudience, parseGameAudience } from "./audience.js";
