/** S5-2B public authority contracts. Secret credential material is intentionally absent. */
export type ProviderConnectionId = string & { readonly __brand: "ProviderConnectionId" };
export type ProviderCredentialAuthorityId = string & { readonly __brand: "ProviderCredentialAuthorityId" };
export type ProviderCredentialGenerationId = string & { readonly __brand: "ProviderCredentialGenerationId" };
export type ProviderAccountId = string & { readonly __brand: "ProviderAccountId" };
export type ExecutableDestinationId = string & { readonly __brand: "ExecutableDestinationId" };
export type DestinationCapabilityRevisionId = string & { readonly __brand: "DestinationCapabilityRevisionId" };
export type WorkspaceDestinationGrantRevisionId = string & { readonly __brand: "WorkspaceDestinationGrantRevisionId" };

export type PublishingProvider = "google" | "rumble" | "rss_host";
export type ProviderConnectionState =
  | "pending_authorization"
  | "active"
  | "refresh_required"
  | "expired"
  | "revoked"
  | "invalid"
  | "disconnected";
export type CredentialState = "unavailable" | "available" | "refresh_required" | "expired" | "revoked" | "invalid";
export type ProviderAccountState = "active" | "unavailable" | "removed";
export type ExecutableDestinationState = "active" | "unavailable" | "ownership_changed" | "removed";
export type ExecutableDestinationKind = "channel" | "page" | "show" | "feed";
export type WorkspaceDestinationGrantState = "active" | "revoked";

export type ProviderConnectionAuthority = {
  providerConnectionId: ProviderConnectionId;
  provider: PublishingProvider;
  state: ProviderConnectionState;
  authorizationRevision: number;
  grantedScopes: readonly string[];
  credentialAuthorityId: ProviderCredentialAuthorityId;
  credentialState: CredentialState;
  credentialGeneration: number;
  connectedAt: string | null;
  revokedAt: string | null;
};

export type DestinationCapabilityRevision = {
  capabilityRevisionId: DestinationCapabilityRevisionId;
  revision: number;
  contentHash: string;
  contractVersion: string;
  capabilities: Readonly<Record<string, unknown>>;
  adapterId: string;
  adapterVersion: string;
  observedAt: string;
};

/**
 * The non-secret envelope Quench may eventually select. It identifies one exact
 * destination and capability revision; connection and credential fields are
 * status evidence, never a substitute destination identity.
 */
export type ExecutableDestinationAuthority = {
  workspaceId: string;
  executableDestinationId: ExecutableDestinationId;
  providerConnectionId: ProviderConnectionId;
  providerAccountId: ProviderAccountId;
  provider: PublishingProvider;
  destinationKind: ExecutableDestinationKind;
  externalDestinationId: string;
  displayLabel: string;
  destinationState: ExecutableDestinationState;
  connectionState: ProviderConnectionState;
  credentialAuthorityId: ProviderCredentialAuthorityId;
  credentialState: CredentialState;
  capability: DestinationCapabilityRevision;
  grantRevisionId: WorkspaceDestinationGrantRevisionId;
  grantRevision: number;
};

export type SetWorkspaceDestinationGrantRequest = {
  workspaceId: string;
  executableDestinationId: ExecutableDestinationId;
  expectedRevision: number;
  state: WorkspaceDestinationGrantState;
  reason?: string | null;
};

export type PublishingDestinationAuthorityErrorCode =
  | "workspace_admin_required"
  | "connection_owner_required"
  | "destination_missing"
  | "destination_not_executable"
  | "invalid_grant_state"
  | "revision_conflict";

export type YoutubeConnectionInitiation = {
  providerConnectionId: ProviderConnectionId;
  authorizationUrl: string;
  expiresAt: string;
};

export type YoutubeConnectionDiscoveryResult = {
  providerConnectionId: ProviderConnectionId;
  discoveredDestinationIds: readonly ExecutableDestinationId[];
  destinationSelected: false;
};
