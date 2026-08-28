# S5-2A Destination Conflict & Security Register

Status: discovery artifact. Risks do not authorize implementation in S5-2A.

## Authority conflicts

### D-A01 — `quench_destination_scopes` sounds executable but is intent-only

- Severity: Critical for future live publishing.
- Evidence: `execution_context='intent_only'`, system seed rows, null `connection_ref`.
- Conflict: scope identity is used by release decisions while no external destination exists.
- Failure: a future caller could mistake “YouTube” scope for a selected channel.
- Disposition: retain as provider-neutral planning authority or deliberately evolve it; do not relabel it executable without new relationships.

### D-A02 — `connection_ref` has no proven semantics

- Severity: High.
- Evidence: nullable text field; no writer/reader; seeded null.
- Conflict: could mean secret, OAuth connection, account, channel, or configuration.
- Failure: arbitrary text becomes an unvalidated join across trust boundaries.
- Classification: unresolved. It must not be used as the S5-2B schema design premise.

### D-A03 — Platform selection is treated as destination selection

- Severity: Critical for live publishing.
- Evidence: Quench stores `selectedPlatforms[]`; adapters are selected by platform string.
- Conflict: “YouTube” identifies a provider family, not a channel.
- Failure: multi-channel connections become silently ambiguous.
- Future boundary: explicit `ExecutableDestinationId` required.

### D-A04 — Capability exists in two unrelated forms

- Severity: High.
- Evidence: durable Tongs capability revisions versus adapter `getCapabilities()` booleans.
- Conflict: one is hashed planning evidence; one is current code behavior with no revision or destination.
- Failure: UI/review and execution can disagree.
- Future boundary: adapters report observations; Tongs versions destination capability; execution consumes the reviewed revision.

### D-A05 — Capability claims are hard-coded, not discovered

- Severity: High.
- Evidence: migration seed JSON and adapter literals.
- Failure: account/channel/provider restrictions can differ from platform-wide assumptions.
- Classification: configured planning capability, not destination evidence.

### D-A06 — No connection-to-destination cardinality

- Severity: Critical.
- Evidence: no provider connection/account/destination tables or relationships.
- Failure: one Google grant exposing multiple YouTube channels cannot be represented or selected safely.
- Classification: absent authority.

### D-A07 — AI `provider_account_id` is unverified and semantically tempting

- Severity: Medium/High if reused.
- Evidence: caller-supplied nullable text on AI-key row; current resolver always requests null.
- Failure: a label designed for API-key selection becomes external publishing account authority.
- Disposition: reuse security patterns only, not the table or identifier.

### D-A08 — RSS is modeled as a platform without a feed authority

- Severity: Critical for RSS execution.
- Evidence: `rss` platform and stub validation; no feed ID, owner, canonical URL, hosting authority, GUID policy, or configuration revision.
- Failure: adapter would have to manufacture/select a feed.
- Classification: executable RSS destination absent.

### D-A09 — Retry contract lacks destination and credential lineage

- Severity: Critical for future live execution.
- Evidence: `retry(receipt, context)` only.
- Failure: retry could resolve a different connection, credential, account, or destination.
- Future slice: publication-operation authority; documented here, not repaired.

### D-A10 — Documentation says “connect account” without defining account

- Severity: Medium architectural ambiguity.
- Evidence: future setup prose.
- Failure: implementation may collapse OAuth grant, Google principal, YouTube channel, and selected destination.
- Disposition: contract vocabulary must replace generic account language at authority seams.

## Security questions — unresolved unless stated

| Question | Current evidence | Status for S5-2B |
| --- | --- | --- |
| Encryption at rest | AES-256-GCM app encryption exists for user AI keys, rooted in one server env secret | pattern exists; suitability, key rotation, KMS/vault choice unresolved |
| Secret access boundary | AI secrets are service-role-only and browser-safe status excludes ciphertext | strong precedent; publishing secret resolver not implemented |
| Refresh-token handling | absent | unresolved |
| Scope minimization | architecture docs require least privilege; no publishing scopes stored | policy only |
| Token rotation | AI key replacement exists; OAuth rotation/history absent | unresolved |
| Expired/revoked credentials | AI status has revoked/invalid; docs propose reconnectable degraded state | publishing state model absent |
| Reconnected/compromised accounts | absent | must preserve old destination/release history without rebinding |
| Connection ownership | docs explicitly allow future user or workspace scope | unresolved policy decision |
| Multi-user workspace access | Tongs roles exist; secret use policy per role absent | unresolved and high impact |
| Service-role access | AI precedent allows service-role secret resolution | principle exists; publishing executor role/least privilege unresolved |
| Callback verification | generic Supabase app callback exists, not provider callback | absent for publishing; state/PKCE/redirect validation unresolved |
| Credential logging/redaction | docs prohibit leaking raw provider errors; no provider runtime exists | policy only; structured redaction contract required |
| Destination ownership changes | absent | unresolved; must not silently retarget historical authority |
| Provider disconnection | intent scope `disabled` is not connection revocation | publishing connection state absent |
| Account/channel enumeration freshness | absent | unresolved |
| Credential-to-account proof | absent | unresolved |

## Trust-boundary stop findings

1. There is no durable publishing credential owner.
2. There is no verified external provider account owner.
3. There is no executable destination object.
4. Current capability revisions cannot prove provider observation or account/channel scope.
5. The existing `connection_ref` cannot safely bridge these missing authorities.

These findings require S5-2B to introduce new persistence relationships. They do not justify a migration until the ownership/cardinality and secret backend choices are accepted.
