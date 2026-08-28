# S5-2C — YouTube Provider Connection Vertical Slice

Status: code and contract verification complete. Live migration, Google OAuth configuration, and authenticated provider smoke remain environment-gated.

## Result

The first provider vertical now proves the S5-2B authority graph through destination discovery and capability establishment:

```text
authenticated Forge user
  -> single-use Google OAuth connection attempt
  -> user-owned provider connection
  -> immutable encrypted credential generation
  -> verified Google provider account
  -> one or more observed YouTube channel destinations
  -> explicit workspace destination grant
  -> immutable destination capability revision
```

OAuth never selects a destination. Callback and refresh responses explicitly report `destination_selected: false`. Workspace and destination parameters are rejected at callback/connection authority seams; the workspace grant remains a separate authenticated operation.

## Implementation

- `supabase/migrations/20260828100000_tongs_youtube_connection_vertical_s5_2c.sql`
  - hashed, expiring, one-time OAuth state;
  - encrypted server-only PKCE verifier;
  - exact provider and redirect binding;
  - explicit reauthorization transition preserving connection/destination identity;
  - server-only credential execution projection;
  - provider lifecycle state transitions.
- `packages/tongs/src/server/publishing-credential-crypto.ts`
  - dedicated AES-256-GCM publishing credential encryption;
  - versioned ciphertext and encryption-key identity;
  - separate secret namespace from BYO AI keys.
- `apps/nursery/server/publishing/youtube-connection-service.ts`
  - authorization-code + PKCE flow;
  - offline credential exchange and refresh;
  - granted-scope verification;
  - Google principal discovery;
  - `channels.list?mine=true` destination discovery;
  - immutable credential/capability commits;
  - provider revocation and reconnect handling.
- Netlify server functions expose safe connect, callback, refresh, disconnect, destination-listing, and explicit-grant operations.

## Server configuration

The deployed server requires:

- `FORGE_GOOGLE_OAUTH_CLIENT_ID`
- `FORGE_GOOGLE_OAUTH_CLIENT_SECRET`
- `FORGE_YOUTUBE_OAUTH_REDIRECT_URI`
- `FORGE_PUBLISHING_CREDENTIAL_ENCRYPTION_SECRET`
- `FORGE_PUBLISHING_CREDENTIAL_KEY_VERSION`
- optional `FORGE_PUBLISHING_CREDENTIAL_ENCRYPTION_KEYS` JSON keyring retaining old key versions during rotation
- existing Tongs Supabase URL, anon/RPC key, and service-role key configuration

OAuth client secrets and encryption secrets remain deployment configuration and are never stored in publishing authority rows or returned to clients.

## Security and authority behavior

- OAuth state belongs to the initiating user-owned connection, expires after ten minutes, is hashed at rest, and is consumed once—including provider-denied callbacks.
- PKCE verifier and OAuth tokens are encrypted and readable only by server-role operations.
- Refresh appends generation N+1 only after a valid provider response; failures preserve generation N.
- Google `invalid_grant` marks the connection/credential revoked, immediately making dependent workspace grants non-executable without deleting their history.
- Explicit reconnect reuses the same connection and provider-native identities; rediscovery therefore retains Forge destination IDs.
- Reconnect credentials must prove the same Google grant subject. A different provider principal is an identity conflict and cannot retarget the existing connection.
- Disconnect attempts provider-side revocation and always enforces local revocation even when provider confirmation is unavailable.
- Provider account and channel IDs remain provider evidence. Forge destination UUIDs remain canonical.
- Capability observations are destination-specific and revisioned. They are distinct from release-planning capabilities.
- Legacy `quench_destination_scopes.connection_ref` remains untouched.

## Verification

- Tongs typecheck passed.
- Nursery typecheck passed.
- Focused YouTube connection tests passed for PKCE initiation, two-destination discovery, no implicit selection/grant, stable rediscovery, immutable refresh rotation, provider revocation, safe disconnect, state expiry/replay/context binding, and public secret non-disclosure.
- Google endpoint, offline refresh, scope, `channels.list(mine=true)`, `invalid_grant`, and revocation behavior were checked against current official Google/YouTube documentation.
- No YouTube upload, Quench Publish, publication operation, receipt, or existing adapter code changed.

## Environment-gated acceptance smoke

After applying the S5-2B and S5-2C migrations and configuring a verified Google OAuth client:

1. Initiate YouTube connection as an authenticated Forge user.
2. Complete consent and confirm one immutable credential generation.
3. Confirm Google principal and all returned YouTube channels are recorded without selection.
4. Explicitly grant one destination to one workspace.
5. Confirm the workspace destination listing returns the exact destination and capability revision without credential material.
6. Refresh and confirm generation N+1 plus stable destination identity.
7. Revoke/disconnect and confirm the same destination identity becomes non-executable/reconnect-required.

No upload is part of this smoke.

## Completion boundary

S5-2C establishes a real provider authorization path capable of producing explicit YouTube destination authority. S5-3 publication-operation work remains locked until the live migration/provider smoke is accepted.
