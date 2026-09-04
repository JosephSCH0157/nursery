# QUENCH Technical Architecture Companion

Status: Current architecture baseline

Scope: Quench canonical authority, release decisions, readiness, and distribution boundaries

## 1. Purpose

Quench is the release-decision and distribution layer of Podcaster's Forge. It operates on finished artifacts and canonical metadata; it does not create or reshape content.

Its responsibilities are to:

- resolve Tongs-authorized release state
- validate readiness truthfully
- collect minimal release and destination decisions
- persist those decisions through Tongs
- dispatch platform adapters when real execution exists
- record verified outcomes through Tongs for later Ledger use

## 2. Canonical System Position

```text
Hammer -> Tongs -> Quench -> Tongs -> Ledger
```

- Hammer produces finished media, packet artifacts, and completed candidate assets.
- Tongs verifies, versions, and projects canonical authority.
- Quench decides and distributes against that authority.
- Tongs records durable release decisions and outcomes.
- Ledger consumes verified release and platform evidence.

There is no direct Hammer-to-Quench operational-authority channel. A path, prepared-package parameter, or client-side release object is a locator only.

## 3. Non-Creative Boundary

Quench must not:

- edit, render, compile, mix, or master media
- create thumbnails, graphics, shorts, clips, or alternate formats
- change Hammer timeline or project structure
- author canonical metadata
- request Hearth or Hammer to generate variants during release execution
- store canonical assets or release history outside Tongs
- claim provider execution without provider acknowledgement

Metadata assistance may return an uncommitted draft. Candidate selection and experiment planning operate only on immutable candidates already authorized through Tongs.

## 4. Runtime Layers

Quench has five runtime layers.

### 4.1 Canonical resolution

Resolves the active workspace and workpiece through Tongs and obtains `forge.quench-release-projection.v2`. Development fixtures are a separate authority class and are never merged into an authenticated canonical workpiece.

### 4.2 Readiness

Separates packet ingestion, canonical Hammer handoff evidence, and destination-specific publish readiness. Execution is fail-closed.

### 4.3 Decision

Collects platform scope, release mode, schedule, selected candidate, and provider-neutral experiment intent. Durable decisions are committed through Tongs as immutable revisions.

### 4.4 Adapter execution

Validates selected destination capabilities and dispatches a live adapter only when both the adapter and server-side provider integration exist.

### 4.5 Receipt and evidence

Normalizes provider acknowledgement and writes durable operation or platform receipts through Tongs. Ledger consumes only verified downstream evidence.

## 5. Hammer Release Packet Authority

The current Hammer packet manifest path is:

```text
hammer/release-packet/manifest.v1.json
```

The manifest declares packet identity, artifact references, and Hammer handoff-readiness evidence. Quench and Tongs must not infer packet structure from neighboring filenames.

Tongs verifies:

- workspace and workpiece identity
- source file revision
- exact manifest bytes
- manifest content hash
- manifest shape and contract version
- canonical Hammer readiness status

Verified bytes are stored as an immutable manifest snapshot. A later manifest revision does not mutate an earlier snapshot.

## 6. Canonical Release Projection

Authenticated Quench workpieces resolve `forge.quench-release-projection.v2` through Tongs.

The projection provides, as applicable:

- workspace and workpiece identity
- immutable Hammer manifest snapshot identity and hash
- parsed manifest and canonical handoff-readiness evidence
- canonical metadata plus revision and content hash
- active brand binding
- active thumbnail candidate set and verified members
- current destination scopes and capability revisions
- current release-decision revisions and assignments
- applicability state for existing decisions

Projection rules:

1. Exact upstream authority is snapshotted before release decisions bind to it.
2. A canonical projection is never synthesized from a route parameter alone.
3. Mock packets remain fixtures and cannot authorize authenticated release behavior.
4. Missing or contradictory authority fails closed.
5. Current decisions expose whether their bound authority remains applicable.

## 7. Readiness Taxonomy

The word `ready` is incomplete without its layer.

### 7.1 Ingest readiness

Determines whether Quench can inspect the Hammer packet truthfully.

Checks include:

- manifest readable and shape-valid
- audio reference resolvable
- transcript artifact loadable
- captions present or truthfully reported missing
- visual placements loadable or truthfully reported missing/invalid

Ingest readiness does not authorize a destination publish.

### 7.2 Canonical handoff readiness

This is Hammer's readiness evidence from the exact Tongs-verified manifest snapshot. It establishes whether the upstream production handoff is ready for Quench review.

It is immutable for that snapshot, but it can become non-current when the canonical Hammer manifest advances.

### 7.3 Publish readiness

Quench evaluates the current projection for the selected destinations. Checks include:

- canonical workspace, workpiece, and episode identity
- required title and description
- selected and eligible thumbnail where required
- required video or audio export
- asset accessibility and public URL requirements
- selected platform capability
- publish mode and schedule validity
- current decision applicability

Publish readiness uses `ready`, `needs_review`, and `blocked`. Adapter execution requires a `ready` status and agreeing readiness flags. Missing, stale, or contradictory authority denies execution.

## 8. Canonical Release Decisions

Tongs persists Quench decisions as immutable revisions rather than mutable rows.

Current decision kinds include:

- `single_candidate`
- `experiment_intent`

A decision binds to:

- workspace and workpiece
- destination scope and capability revision
- exact manifest snapshot and hash
- canonical metadata revision and hash
- candidate set and content hash
- active brand binding and revision
- ordered candidate assignments
- previous decision revision

This binding makes decisions auditable and prevents a selection from silently drifting to newly generated or modified assets.

## 9. Concurrency and Operation Receipts

Decision commits use optimistic concurrency and idempotent operation identity.

- The client supplies the expected current decision and revision.
- Tongs checks authorization before canonical reads, locks, receipt replay, or mutation.
- Locks follow a stable global order across manifest, metadata, binding, candidate set, capability, decision, and operation authority.
- A stale expectation returns a revision conflict rather than overwriting current authority.
- Reusing an operation ID with the same identity replays its immutable result.
- Reusing an operation ID with different identity returns an operation conflict.
- Immutable-history tables reject update and delete operations.

Operation receipts prove the database decision mutation. They are not platform publish receipts and do not prove external execution.

## 10. Decision Applicability

An immutable decision can remain historically valid while becoming unsuitable for current execution.

Tongs reevaluates applicability when any bound authority advances, including:

- Hammer manifest revision or hash
- metadata revision or hash
- candidate-set authority
- active brand binding
- candidate asset integrity or eligibility
- destination capability revision

The UI must distinguish a current applicable decision from a historical decision that requires review.

## 11. Thumbnail Authority

Thumbnail candidates are authored upstream and returned through the canonical Tongs projection.

Quench may:

- inspect verified candidate provenance and eligibility
- choose an eligible candidate for a destination scope
- persist an immutable selection decision
- plan or cancel provider-neutral experiment intent using eligible candidates

Quench may not:

- generate or edit a candidate
- rewrite a recipe
- request regeneration during release execution
- bypass candidate-set or brand-binding authority
- automatically restore an earlier selection when canceling experiment intent

Cancellation creates a new zero-assignment canonical decision. It does not rewrite history.

## 12. Experiment Intent vs Execution Evidence

Experiment planning and provider execution are separate facts.

Provider-neutral intent may identify:

- a control candidate
- one or more variants
- an optional allocation model when supported
- the destination scope and capability revision

It does not establish that a provider supports automatic rotation, accepted the plan, served a candidate, or produced performance evidence.

Active execution requires a capable live adapter and provider acknowledgement. Ledger evidence requires verified provider observations. Quench must not manufacture either fact from intent alone.

## 13. Adapter Architecture

Each destination adapter implements a shared boundary for:

- capability reporting
- packet and option validation
- publish execution
- retry execution
- normalized results and receipts

Current package adapters exist for YouTube and Transistor. Transistor is the V1 podcast-host boundary: it submits one canonical episode to an exact user-linked show while the host owns RSS and directory syndication.

No real Rumble adapter currently exists. Spotify is not modeled as an upload destination.

Platform adapters must not own canonical metadata, asset storage, decision history, credentials in the client, or authoritative receipts outside Tongs.

## 14. Capability Model

Destination controls must be driven by structured capabilities rather than assumptions.

Capabilities may include:

- video and audio support
- scheduling support
- premiere support
- shorts support
- experiment-planning support
- provider rotation support

Planning support and execution support are different capabilities. The UI must not offer or claim an operation that the selected capability revision does not support.

## 15. Publish Jobs and Partial Failure

Live distribution remains future work, but its authority model is fixed:

- validate all selected destinations first
- create independently recoverable destination jobs
- preserve one destination's success when another fails
- keep secrets and provider execution server-side
- allow safe polling or subscription for progress
- bind retries to canonical provider receipts
- record verified schedules and external identifiers through Tongs

Long-running execution must not require the browser to remain open.

## 16. Podcast-host Boundary

Quench submits canonical audio and episode metadata to an exact user-linked host show. The host creates and serves RSS, controls enclosure URLs and GUIDs, and handles any directory syndication configured in the host account. Forge does not render or host a feed and does not upload directly to Spotify.

## 17. Authentication and Platform Connections

Future live connections may be workspace- or user-scoped according to the provider contract.

Rules:

- secret material remains server-side
- OAuth or token-based authorization is preferred
- least-privilege provider scopes are required
- the client receives only safe connection status
- expired credentials become a reconnectable degraded state
- prior configuration and release history are preserved

## 18. UI Architecture

Quench is a three-column release console:

- left: canonical workpiece selection and readiness
- center: release summary, metadata review, decisions, validation, and execution state
- right: thumbnail authority, experiment intent, destinations, capabilities, and destination options

The UI must label fixture versus canonical authority, stub versus live mode, and planning versus provider execution. Metadata assistance must remain visibly draft-only.

## 19. Current Implementation Boundary

Implemented today:

- Hammer packet ingest and validation
- canonical release projection
- immutable manifest snapshots
- publish-readiness contracts and fail-closed guard
- canonical thumbnail selection
- provider-neutral experiment planning and cancellation
- immutable decision revisions, concurrency checks, and operation receipts
- YouTube validation scaffold and Transistor podcast-host boundary
- integrated release-console UI

Not live today:

- provider authentication and token refresh
- media upload or scheduling
- Forge RSS rendering or hosting (intentionally out of scope)
- direct Spotify upload (intentionally out of scope)
- YouTube or Rumble provider execution
- provider publish receipts
- provider-side experiment rotation
- Ledger performance ingestion

Contracts, UI controls, fixtures, and stub receipts must never be described as proof that these future capabilities are live.

## 20. Security and Audit Rules

- Supabase/Tongs remains the canonical SSOT.
- RLS protects workspace-scoped release records.
- Authorization precedes lock acquisition, replay, and mutation.
- Canonical history is append-only and immutable.
- Raw provider errors must not leak secrets.
- Signed or server-resolved URLs are preferred for protected cloud assets.
- Publish actions and acknowledgements must be auditable.

## 21. Evolution Rule

If logic creates or reshapes content, it belongs upstream. If it establishes durable authority, it flows through Tongs. If it delivers already-authorized content, it belongs in Quench.

New features must preserve that boundary even when they add destinations, scheduling, release templates, experiments, notifications, or Ledger integration.
