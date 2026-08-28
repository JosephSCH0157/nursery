# S5-2A Destination Authority Field Inventory

Status: repository discovery only. This document authorizes no schema, OAuth, secret storage, provider call, adapter, Quench, or publication change.

## Classification rule

Names such as `account`, `destination`, `connection`, and `capability` are classified by observed behavior, not intent or UI wording. A missing relationship is recorded as absent or unresolved rather than inferred.

## Forge authentication

| Field / object | Observed meaning | Owner and persistence | Scope / mutability | Credentials? | Quench/adapter use | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| `auth.users.id` / Supabase session user | Forge application identity | Supabase Auth; durable user plus mutable session | user-scoped | Forge session token, not publishing credentials | Tongs authorization/RLS; adapters do not receive user identity | canonical Forge-user authority |
| Supabase `session.access_token` | Authenticates Forge requests to Tongs | Supabase Auth/client session storage | user session; renewable | yes, Forge credential | `tongsFetch`; never proves provider access or destination | Forge credential authority only |
| `Login.signInWithPassword` | Forge sign-in | Supabase Auth | user-scoped | password handled by Supabase | no publishing use | application authentication |
| `AuthCallback.exchangeCodeForSession` | Completes Supabase application-auth callback/recovery | Supabase Auth | user-scoped | Supabase auth code/session | no provider-account enumeration or provider token persistence | unresolved callback label if read out of context; proven not to be publishing OAuth |

Evidence: `apps/nursery/src/routes/Login.tsx`, `apps/nursery/src/routes/AuthCallback.tsx`, `apps/nursery/src/lib/supabase.ts`.

No `signInWithOAuth`, provider token, provider refresh token, Google publishing scope, or publishing OAuth callback handler was found.

## Existing credential-storage precedent: AI keys

| Field / object | Observed meaning | Owner and persistence | Scope / mutability | Credentials? | Quench/adapter use | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| `tongs.user_ai_keys` | BYO AI API key record | Tongs DB; service-role-only secret read | user + AI provider + optional provider account; mutable current row | encrypted API key | none | credential precedent, not publishing connection |
| `provider` | AI API provider, currently `openai` in application service | Tongs row / server normalization | provider-scoped | no | none | provider discriminator |
| `provider_account_id` | Optional caller-supplied AI account label/identity | Tongs row | user/provider scoped; nullable | no | none | unresolved external account semantics; not verified by provider discovery |
| `encrypted_api_key` | AES-256-GCM ciphertext | Tongs DB | user-scoped secret; replaceable | yes | never exposed to browser or Quench | credential material |
| `key_version` | ciphertext format/version | Tongs | mutable on replacement | indirect | none | cryptographic-format evidence, not credential revision authority |
| `status` (`active`, `revoked`, `invalid`) | current key availability | Tongs | mutable | no | none | credential state precedent |
| `validation_mode`, `last_validated_*`, `last_used_at` | AI-key operational metadata | Tongs/server | mutable | no | none | validation/usage state |
| `user_ai_keys_safe` | browser-safe status projection | Tongs view | current projection | excludes key material | Settings/AI services only | safe credential-status precedent |
| `get_user_ai_key_for_resolution` | service-role secret resolution | Tongs RPC | service-only | returns ciphertext | server AI runtime only | secret-access boundary precedent |
| `FORGE_USER_KEY_ENCRYPTION_SECRET` | application encryption root | server environment | deployment-scoped mutable configuration | yes | no | existing security mechanism; suitability for OAuth tokens unresolved |

Evidence: `supabase/migrations/20260403110000_tongs_user_ai_keys.sql`, `packages/tongs/src/server/ai-key-crypto.ts`, `apps/nursery/server/hearth/user-ai-keys-service.ts`, `apps/nursery/server/hearth/resolve-effective-ai-credentials.ts`.

This model proves Forge has a server-only encrypted-secret pattern. It does not model OAuth grants, refresh-token rotation, granted scopes, callback state, multiple destinations per connection, workspace sharing, or immutable credential revisions.

## Current Tongs Quench destination intent

| Field / object | Writer / reader | Persistence and scope | Current semantics | Credential content | Classification |
| --- | --- | --- | --- | --- | --- |
| `quench_destination_scopes.id` | seeded migration; Tongs projection, Quench decisions | durable DB; system-global or nullable workspace | provider-neutral release-decision scope | none | destination-intent scope, not executable destination |
| `workspace_id` | migration/Tongs RLS | nullable workspace | null permits system scope | none | relationship; null does not identify user/provider ownership |
| `scope_key` | seeded migration | unique text | `system:youtube:intent-only`, `system:rss:intent-only` | none | intent-scope identity |
| `platform` | migration | `youtube` or `rss` | platform family | none | provider/platform discriminator, not account/channel |
| `adapter_id` | migration | `forge.youtube` / `forge.rss` | names intended adapter family | none | implementation hint, not execution binding |
| `execution_context` | migration constraint | always `intent_only` | explicitly denies live execution semantics | none | provider-neutral planning posture |
| `connection_ref` | no active writer or reader found | nullable text | semantics unproven; seeded null | none today | unresolved placeholder; not credential authority |
| `state` (`active`, `disabled`) | seed/current reads | mutable current row | availability of intent scope | none | scope availability, not connection revocation |
| `current_capability_revision_id` | seed/update; decisions/applicability | mutable pointer | current provider-neutral capability description | none | capability-head pointer |
| `quench_destination_capability_revisions.id/revision` | seeded migration; Tongs projection | immutable DB revision | versioned capability claim for the intent scope | none | capability revision authority for planning only |
| `capabilities_json` | seeded migration | immutable revision JSON | hard-coded features; no provider discovery evidence | none | durable configured assumptions, not observed destination capability |
| `content_hash` | migration | immutable SHA-256 | exact capability JSON evidence | none | capability content evidence |
| `adapter_version` | seeded `stub-v1` | immutable revision field | scaffold version | none | adapter-assumption evidence, not executable adapter binding |

Evidence: `supabase/migrations/20260718160000_tongs_quench_release_decisions.sql`, `packages/tongs/src/workpiece-commit-api.ts`, `apps/quench/src/core/canonical-release-projection.types.ts`.

No row identifies a YouTube channel ID, Google account, podcast feed, feed owner, Rumble account, Spotify show, provider connection, credential authority, granted scopes, or external destination status.

## Quench presentation and local selection

| Field / object | Owner / persistence | Meaning | Authority risk | Classification |
| --- | --- | --- | --- | --- |
| `QuenchPlatform` (`youtube`, `rumble`, `spotify`, `rss`) | code union | platform family | suggests platforms without live connections/adapters | presentation discriminator |
| `selectedPlatforms[]` | Quench React state | chosen platform cards | no destination ID; selection can only mean platform family | ephemeral presentation choice |
| `publishOptions[platform]` | Quench React state | mode/schedule/visibility/overrides | not bound to account/channel/capability revision | ephemeral publication draft |
| `thumbnailSelectionScope` | Quench derived value | first active YouTube intent scope, otherwise first active scope | implicit destination-scope fallback | decision-intent selection, not executable destination |
| destination cards | Quench static adapter list | platform labels and hard-coded capabilities | UI can resemble connected destinations despite no connection | presentation scaffold |
| mock `default_platforms` / overrides | fixture | development selection | fixture only | compatibility/test state |

Evidence: `apps/nursery/src/routes/Quench.tsx`, `apps/quench/src/core/release-packet.types.ts`, `apps/quench/src/dev/mockReleasePackets.ts`.

## Adapter fields

| Field / method | YouTube scaffold | RSS scaffold | Credential/destination behavior | Classification |
| --- | --- | --- | --- | --- |
| `platform` | literal `youtube` | literal `rss` | selects platform family only | adapter discriminator |
| `getCapabilities()` | hard-coded booleans | hard-coded booleans | no destination query, revision, account, or observed timestamp | mutable runtime/configured assumptions |
| `validate(packet, options, context)` | media/thumbnail/schedule checks | audio/RSS/public URL checks | receives no credentials or destination identity | local validation scaffold |
| `publish(...)` | validates, stub or `not_implemented` | validates, stub or `not_implemented` | no provider client, account/channel choice, token, feed target, or external request | non-live scaffold |
| `retry(receipt, context)` | reconstructs options from receipt | same | receives neither original destination nor credentials; future execution could drift | unresolved retry authority |
| `PlatformCapabilities` | feature booleans plus platform | same | no ID/revision/hash/source/account/channel | runtime capability projection, not durable evidence |
| `PublishContext` | run mode/readiness/assets/request ID | same | no connection/destination/capability envelope | execution context missing destination authority |
| `PlatformReceipt` | platform/external/status/summary | same | no connection/destination/capability/credential reference | ephemeral stub receipt |

Evidence: `apps/quench/src/adapters/adapter.contract.ts`, `apps/quench/src/adapters/youtube/youtube.adapter.ts`, `apps/quench/src/adapters/rss/rss.adapter.ts`.

No provider SDK/OAuth dependency was found in package manifests for Quench publishing. No Rumble or Spotify adapter exists.

## Documentation-only concepts

| Phrase | Evidence level | Classification |
| --- | --- | --- |
| “connect YouTube/Spotify/Rumble account” | future product prose only | unresolved; no contract or persistence |
| “configure RSS settings” | future product prose only | unresolved; no feed identity/configuration authority |
| “OAuth or token-based authorization is preferred” | architecture rule | target security principle, not implementation |
| “connections may be workspace- or user-scoped according to provider contract” | architecture rule | ownership deliberately unresolved |
| “keep secrets/provider execution server-side” | architecture rule | supported trust-boundary requirement |

Evidence: `docs/QUENCH_MANIFEST.md`, `apps/quench/QUENCH_TECHNICAL_ARCHITECTURE.md`, `apps/quench/README.md`.

## Inventory conclusion

Forge currently represents the Forge user, provider-neutral destination intent, and immutable planning-capability revisions. It does not represent the middle of the target chain: publishing provider connection, credential authority, verified provider account, executable channel/feed, connection-to-destination membership, or destination-observed capability revision.
