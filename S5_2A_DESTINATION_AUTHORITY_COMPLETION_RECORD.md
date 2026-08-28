# S5-2A Destination Authority Discovery Completion Record

Status: complete. Findings must be accepted before S5-2B begins.

## Scope inspected

- Quench architecture, README, product manifest, release packet, readiness, projection, UI, fixtures, adapter contract, YouTube/RSS scaffolds, retry, and stub receipts.
- Tongs destination scopes, capability revisions, decisions, applicability, RLS, grants, projections, and generated DB types.
- Nursery Forge authentication, auth callback, active Supabase session handling, settings-related provider references, and server environment usage.
- Existing encrypted user AI-key persistence, safe status view, service-role resolution, connection/disconnection state, and server encryption implementation.
- Repository package manifests and environment/config searches for publishing SDKs, OAuth clients, provider tokens, channel/feed configuration, and external account identity.
- Documentation claims for future provider authentication, platform setup, RSS, secret handling, jobs, and receipts.

## Findings

1. Forge user and workspace authority exist through Supabase Auth and Tongs RLS.
2. No publishing OAuth flow, callback, provider token, refresh token, granted-scope record, or provider SDK exists.
3. No verified provider-account object exists.
4. No executable channel/page/show/feed object exists.
5. One connection exposing multiple destinations cannot currently be represented.
6. `quench_destination_scopes` are explicitly system `intent_only` planning scopes. `connection_ref` is null and semantically unresolved.
7. Tongs capability revisions are immutable and hashed, but current contents are seeded platform assumptions rather than destination-observed evidence.
8. Adapter `getCapabilities()` returns a second, hard-coded, unrevisioned capability model.
9. Quench selects platform families in React state, not executable destinations.
10. YouTube/RSS adapters receive no credentials, account, destination, or reviewed capability revision. Live execution is intentionally not implemented.
11. AI-key infrastructure offers a useful server-only encryption/RLS/safe-status precedent but does not model publishing connections or destinations and must not be repurposed semantically.
12. Publishing revocation, reconnection, account switching, ownership changes, and destination history are absent.

## Required question answers

| Question | Answer |
| --- | --- |
| What provider/account scaffolding exists? | Provider-neutral intent scopes, capability revisions, platform UI, and YouTube/RSS non-live adapter scaffolds. No publishing connection/account scaffolding. |
| Where are credentials expected to live? | Architecture docs say server-side/Tongs; no publishing store exists. AI keys demonstrate one server-only encrypted pattern. Exact backend remains unresolved. |
| Can one connection expose multiple destinations? | Target model must allow it; current model cannot represent it. |
| What currently represents a destination? | Nothing executable. `quench_destination_scopes` represent planning intent only. |
| Are destination and credential identity conflated? | They are both absent. `connection_ref` risks conflation but is unused/unresolved. Platform UI currently substitutes platform family for destination choice. |
| Does any adapter select its own destination? | No real destination exists and adapters make no provider calls. Their contract would force future rediscovery/implicit selection because it accepts no destination authority. |
| What capability model exists? | Immutable hashed Tongs planning revisions plus separate runtime hard-coded adapter booleans. |
| Mutable configuration or durable evidence? | Both: Tongs revisions are durable configured evidence; adapter capabilities are runtime code assumptions. Neither is provider-observed per destination. |
| What represents revocation/reconnection? | Nothing for publishing. Intent-scope disabled state is not credential revocation. AI-key states are precedent only. |
| Which pieces live in Tongs vs adapters? | Tongs: durable identities, relationships, safe states, revisions, selection/audit. Provider connectors/adapters: OAuth/provider protocol, discovery, refresh, execution; they report verified results through Tongs. |
| What must Quench never possess? | Access/refresh tokens, ciphertext, client secrets, encryption roots, authorization codes, provider cookies, raw secret-bearing errors. |
| What durable objects must S5-2B introduce/extend? | Connection authority/history, opaque credential reference/state, provider account, executable destination, capability revision/current pointer, ownership/share relationships, and revocation/reconnection history. |

## Unresolved decisions intentionally preserved

- user versus workspace connection ownership and sharing policy;
- roles permitted to connect/share/revoke/use destinations;
- secret backend, envelope encryption, rotation, and recovery;
- OAuth callback state/PKCE/redirect architecture;
- provider scope taxonomy and re-consent semantics;
- account/destination discovery freshness and deletion/ownership-change rules;
- RSS feed/hosting ownership model;
- relationship between existing intent-only scopes and future executable destinations;
- executor/service identity and least-privilege access.

## Proposed S5-2B boundary

S5-2B should be Provider Connection & Destination Persistence Design, not provider implementation. It should turn the accepted ownership/cardinality/security decisions into an additive schema/RLS/RPC plan while retaining provider calls and token acquisition as future work.

It must not begin until the unresolved connection-ownership and secret-backend policies are selected; those decisions materially change RLS, sharing, revocation, and execution authority.

## Verification

- Targeted repository searches covered implementation, schema, generated types, tests, docs, package dependencies, environment references, and provider terminology.
- Every cited file/symbol was confirmed present.
- Apparent OAuth/account concepts were traced to actual behavior before classification.
- Documentation consistency and artifact cross-references were checked.
- Only the five S5-2A Markdown artifacts were added.
- No production code, adapter, test, package, configuration, generated type, schema, migration, RLS policy, RPC, OAuth flow, credential, token, or publication behavior changed.

## Artifact index

1. `S5_2A_DESTINATION_AUTHORITY_FIELD_INVENTORY.md`
2. `S5_2A_PROVIDER_TRUST_AUTHORITY_FLOW_MAP.md`
3. `S5_2A_DESTINATION_CONFLICT_SECURITY_REGISTER.md`
4. `S5_2A_DESTINATION_CONTRACT_LOCK_PROPOSAL.md`
5. `S5_2A_DESTINATION_AUTHORITY_COMPLETION_RECORD.md`
