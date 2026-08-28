# S5-2A Provider Trust & Authority Flow Map

Status: observed current flow plus evidence-limited ownership map. No implementation is authorized.

## Actual current release-destination flow

```text
Supabase auth.users / Forge session
  -- authorizes Tongs workspace reads and decision writes -->
Tongs system destination-intent scope
  scope_key = system:youtube:intent-only or system:rss:intent-only
  connection_ref = null
  -- mutable pointer -->
immutable hard-coded capability revision (stub-v1)
  -- projected -->
Quench platform card + local selectedPlatforms/options
  -- platform string selects -->
static YouTubeAdapter or RssAdapter
  -- local validation / stub / live=not_implemented -->
ephemeral PlatformReceipt
```

Missing edges:

```text
Forge user
  -X-> publishing provider connection
  -X-> credential authority
  -X-> verified external provider account
  -X-> enumerated executable destination/channel/feed
  -X-> destination-observed capability revision
```

The existing Tongs scope starts after those missing edges and explicitly declares itself `intent_only`. It cannot be promoted into executable authority by filling `connection_ref` with an arbitrary string.

## Existing AI-key flow: security precedent only

```text
Forge user enters OpenAI key
  -- authenticated server handler -->
server-only AES-256-GCM encryption
  -- service-role write -->
tongs.user_ai_keys encrypted secret row
  -- safe status view --> browser
  -- service-role resolution + server decryption --> AI request runtime
```

Preserved principles:

- secret material is excluded from authenticated/browser reads;
- service-role resolution is server-only;
- safe status is separated from ciphertext;
- current revoked/invalid state is explicit.

Not provided by this precedent:

- OAuth callback/state verification;
- refresh-token rotation and provider expiry;
- granted scopes and consent revisions;
- provider-account enumeration;
- multiple executable destinations;
- workspace sharing/connection ownership;
- immutable credential or connection history.

## Adapter flow and trust gaps

```text
Quench React platform choice
  -- platform-family string --> adapter registry
adapter.getCapabilities()
  -- in-code booleans --> Quench UI/readiness
adapter.publish(packet, options, current context)
  -- no credential/destination input --> stub or not_implemented
adapter.retry(receipt, new context)
  -- no frozen destination lineage --> stub retry
```

Adapters neither receive nor choose a real account today. Because their future contract has no destination envelope, adding provider code directly would force them to rediscover or implicitly choose an account/channel.

## Evidence-based trust-boundary ownership

| Responsibility | Current owner | Target ownership supported by repository principles | Confidence |
| --- | --- | --- | --- |
| Forge authentication | Supabase Auth | Supabase Auth | proven |
| workspace authorization | Tongs/RLS | Tongs/RLS | proven |
| authorization initiation | absent | server-side provider-connection service behind authenticated Tongs authority | proposed; concrete component unresolved |
| OAuth callback verification | absent | server-side provider-connection service | proposed; route/state/PKCE mechanism unresolved |
| credential encryption/storage | AI-only server/Tongs precedent | Tongs-owned durable reference plus server-only secret boundary | principle supported; cryptographic backend unresolved |
| refresh/rotation | absent | server-side credential authority, never Quench/browser | proposed |
| revocation/reconnection | absent for publishing | Tongs connection state/history plus provider-specific server action | proposed |
| provider account discovery | absent | provider-specific server connector/adapter returns verified observations to Tongs | proposed |
| destination enumeration | absent | provider-specific server connector discovers; Tongs persists canonical destinations | proposed |
| destination selection | local platform UI only | explicit workspace-authorized selection of a Tongs destination ID | target invariant |
| capability discovery | absent | provider-specific server connector observes exact destination | proposed |
| capability persistence/versioning | Tongs intent-only revisions | Tongs immutable destination capability revisions | reuse supported, extension required |
| adapter execution | non-live Quench scaffolds | server-side provider adapter consumes frozen authority | architecture docs support |
| Quench presentation | Quench | safe connection/destination/capability projections only | proven target rule |

## Target chain emerging from evidence

```text
ForgeUserId
  -> ProviderConnectionId                  authorization relationship
  -> ProviderCredentialAuthorityId         opaque server-only secret authority
  -> ProviderAccountId                     verified external principal
  -> ExecutableDestinationId               exact channel/page/feed/show target
  -> DestinationCapabilityRevisionId       immutable observed capability evidence
  -> DestinationAuthority                  safe envelope delivered to Quench
```

Cardinality must support:

```text
one Forge user/workspace
  -> many provider connections
one provider connection
  -> one or more provider accounts (provider-dependent)
one provider account
  -> one or more executable destinations
one executable destination
  -> many immutable capability revisions, one reviewed/current pointer
```

The repository does not prove whether connection ownership should be user-only, workspace-only, or a user-owned connection explicitly shared with workspaces. S5-2B must choose that policy explicitly.
