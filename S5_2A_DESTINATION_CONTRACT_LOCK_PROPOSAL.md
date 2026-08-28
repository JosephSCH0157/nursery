# S5-2A Destination Authority Contract Lock Proposal

Status: proposed vocabulary and ownership boundary only. No types or schemas were added.

## Concepts that must remain separate

```ts
type ProviderConnectionId = string;
type ProviderCredentialAuthorityId = string;
type ProviderAccountId = string;
type ExecutableDestinationId = string;
type DestinationCapabilityRevisionId = string;
```

### Provider connection

Answers: has Forge been authorized to communicate with this provider, for which owner and scopes?

```ts
type ProviderConnectionState =
  | "pending_authorization"
  | "active"
  | "refresh_required"
  | "expired"
  | "revoked"
  | "invalid"
  | "disconnected";

type ProviderConnectionAuthority = {
  providerConnectionId: ProviderConnectionId;
  provider: "google" | "spotify" | "rumble" | "rss_host";
  owner: { kind: "user" | "workspace"; id: string };
  credentialAuthorityId: ProviderCredentialAuthorityId;
  grantedScopes: string[];
  state: ProviderConnectionState;
  authorizationRevision: number;
};
```

The owner policy is intentionally not locked yet. The repository proves both user-scoped secret precedent and workspace-scoped release authorization, but not which party may share/use a publishing grant.

### Credential authority

Answers: may a trusted server executor authenticate provider calls now?

```ts
type CredentialState =
  | "available"
  | "refresh_required"
  | "expired"
  | "revoked"
  | "invalid"
  | "unavailable";

type ProviderCredentialAuthority = {
  providerCredentialAuthorityId: ProviderCredentialAuthorityId;
  providerConnectionId: ProviderConnectionId;
  credentialState: CredentialState;
  credentialRevision: number;
  expiresAt?: string;
  // No access token, refresh token, or ciphertext in this public contract.
};
```

Quench must never receive raw tokens, refresh tokens, ciphertext, encryption metadata, client secrets, or provider error payloads containing secrets.

### Provider account

Answers: which external principal was verified through the connection?

```ts
type ProviderAccountAuthority = {
  providerAccountId: ProviderAccountId;       // Forge identity
  providerConnectionId: ProviderConnectionId;
  provider: string;
  externalAccountId: string;                  // exact provider identity
  displayLabel: string;
  observedAt: string;
  state: "active" | "unavailable" | "removed";
};
```

An external account is not necessarily an executable destination.

### Executable destination

Answers: where exactly will provider execution act?

```ts
type ExecutableDestinationAuthority = {
  executableDestinationId: ExecutableDestinationId;
  providerAccountId: ProviderAccountId;
  providerConnectionId: ProviderConnectionId;
  provider: string;
  kind: "channel" | "page" | "show" | "feed";
  externalDestinationId: string;
  displayLabel: string;
  state: "active" | "unavailable" | "ownership_changed" | "removed";
};
```

One connection and one provider account may expose multiple destinations. Selection is always by `ExecutableDestinationId`, never provider/platform, connection, credential, first result, or current adapter config.

### Capability revision

Answers: what was validated for this exact destination at a point in time?

```ts
type DestinationCapabilityRevision = {
  destinationCapabilityRevisionId: DestinationCapabilityRevisionId;
  executableDestinationId: ExecutableDestinationId;
  revision: number;
  contentHash: string;
  observedAt: string;
  observationSource: "provider_api" | "verified_configuration";
  adapterVersion: string;
  capabilities: Record<string, unknown>;
};
```

The existing immutable `quench_destination_capability_revisions` pattern is reusable. Its current rows remain `intent_only` configured planning evidence; S5-2B must not rewrite them as historically provider-observed.

### Safe envelope delivered to Quench

```ts
type DestinationAuthority = {
  workspaceId: string;
  executableDestination: ExecutableDestinationAuthority;
  capabilityRevision: DestinationCapabilityRevision;
  connection: {
    providerConnectionId: ProviderConnectionId;
    state: ProviderConnectionState;
  };
  credential: {
    providerCredentialAuthorityId: ProviderCredentialAuthorityId;
    state: CredentialState;
  };
};
```

This envelope contains safe status and exact IDs, never credential material. It is suitable for later inclusion in a frozen publication operation only after the destination is explicitly selected and revalidated.

## Ownership lock

| Concern | Proposed owner | Reason grounded in repository evidence |
| --- | --- | --- |
| Durable connection/account/destination/capability identity | Tongs | SSOT policy and existing immutable release/capability histories |
| Secret encryption and resolution | server-only credential service | existing AI secret boundary; Quench/browser excluded |
| Provider-specific authorization/discovery/refresh calls | provider connector service | external protocol knowledge must not enter generic Tongs SQL or Quench UI |
| Connection/destination observations and revisions | provider connector writes through Tongs authority operations | adapters discover; Tongs establishes durable identity/history |
| Explicit destination selection | Quench UI command through Tongs | Quench presents choices but cannot manufacture identity |
| Publish adapter execution | server-side adapter | architecture docs require server-side secrets and long-running execution |

“Tongs owns” means durable identity, relationships, state, and audit history. It does not mean PostgreSQL functions should perform OAuth or provider HTTP calls.

## Reuse versus introduction

Reuse:

- Supabase `auth.users` as Forge-user identity.
- Tongs workspace roles/RLS.
- immutable capability-revision and current-pointer pattern.
- server-only secret resolution and safe-status projection principles from AI keys.
- existing Quench `adapter_id` names only as implementation identifiers after verified binding.

Do not reuse as publishing authority:

- `user_ai_keys` rows;
- AI `provider_account_id`;
- `selectedPlatforms[]`;
- platform strings;
- `connection_ref` without a proven new contract;
- system `intent_only` scope rows as channels/feeds;
- runtime `PlatformCapabilities` booleans as durable evidence.

## Evidence-based S5-2B boundary

S5-2B must design additive persistence for:

1. provider connection authority and immutable authorization/scope history;
2. an opaque credential-authority reference and current credential state, with secret material behind a server-only boundary;
3. verified provider accounts linked to connections;
4. executable destinations linked to accounts and connections;
5. immutable destination capability revisions and a current pointer;
6. connection/destination revocation, removal, reconnection, and ownership-change history;
7. workspace authorization for selecting/using a user- or workspace-owned connection;
8. safe projections that expose no secret material.

Before SQL, S5-2B must explicitly decide:

- user-owned, workspace-owned, or share-grant connection policy;
- secret backend and key-rotation model;
- role allowed to connect, share, select, refresh, revoke, and execute;
- whether current `quench_destination_scopes` remains planning-only or becomes a foreign-key consumer of a new executable destination.

No provider implementation belongs in S5-2B persistence design.
