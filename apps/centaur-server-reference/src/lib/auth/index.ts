// Client credential custody — the identity change's client deliverable.
// The sign-in route that will construct this arrives with later stories;
// see custody.ts's module header.
// spec: identity-and-authorization/client-credential-custody
export {
  createCredentialCustody,
  RENEWAL_AT_FRACTION_OF_LIFETIME,
  RETRY_INITIAL_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} from "./custody";
export type {
  CredentialCustody,
  CredentialCustodyDeps,
  CustodyStatus,
  FetchLike,
  RenewedCredential,
} from "./custody";
