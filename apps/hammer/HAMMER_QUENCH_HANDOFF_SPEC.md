# HAMMER -> TONGS -> QUENCH Handoff Specification

Status: Canonical boundary contract

Authority model: Hammer produces; Tongs authorizes; Quench decides and distributes

Supersedes: the historical Hammer-to-Quench blueprint compilation model

## Purpose

This document defines the release boundary among Hammer, Tongs, and Quench. It prevents responsibility overlap, preserves a single persistence authority, and ensures Quench operates only on finished, authorized artifacts.

Canonical authority flow:

```text
Hammer -> Tongs -> Quench -> Tongs -> Ledger
```

- Hammer produces finished media, captions, transcripts, visual-placement evidence, and completed candidate assets.
- Tongs stores, verifies, versions, and projects canonical release authority.
- Quench validates that authority, records release decisions, and executes distribution when a live adapter exists.
- Tongs records canonical decisions, operation receipts, platform receipts, schedules, and publish history.
- Ledger consumes verified release and performance evidence.

Neighboring applications do not confer operational authority directly on one another. A Hammer path, route parameter, prepared-package reference, or client-side object is a locator only. Tongs must resolve and authorize the canonical release projection.

## 1. Boundary Principles

1. Hammer completes production before release handoff.
2. Tongs is the canonical single source of truth for persisted release state.
3. Quench is a release-decision and distribution system, not a media-production environment.
4. Release execution is fail-closed against current Tongs authority.
5. Every durable Quench decision or execution receipt returns to Tongs.
6. Creative or structural changes require a new authorized upstream revision.

## 2. Hammer Responsibilities

Hammer owns post-production shaping and completed release artifacts, including as applicable:

- final video and audio exports
- edit and render execution within Hammer's production boundary
- captions, transcripts, and visual-placement outputs
- completed shorts or clips
- completed thumbnails or upstream-authored thumbnail candidates
- deterministic lineage from source media to finished outputs
- canonical readiness evidence for the Hammer handoff

Hammer writes its release packet through the Tongs-backed storage path. The current manifest authority is:

```text
hammer/release-packet/manifest.v1.json
```

The manifest declares packet structure and artifact references. Consumers must not reconstruct authority from filename conventions or hidden Hammer runtime state.

## 3. Tongs Responsibilities at Handoff

Tongs mediates the Hammer-to-Quench boundary. It owns:

- canonical workpiece identity and access control
- exact Hammer manifest-byte verification and immutable snapshots
- artifact references, revisions, and content hashes
- canonical metadata and metadata revision authority
- active thumbnail candidate-set and brand-binding authority
- destination scopes and capability revisions
- canonical release projections delivered to Quench
- persisted release-decision revisions and assignments
- concurrency control and idempotent operation receipts
- publish receipts, schedules, and release history when execution exists

Tongs must reject stale, mismatched, unauthorized, or unverifiable authority. It must not silently substitute a newer artifact for the exact revision a decision claims to use.

## 4. Quench Inputs

Quench consumes a Tongs-resolved canonical release projection. Depending on the current slice and available upstream outputs, it may contain:

- an immutable Hammer manifest snapshot
- canonical handoff-readiness evidence
- transcript, captions, and visual-placement references
- final audio and video references
- canonical episode metadata
- verified thumbnail candidates and current selection authority
- destination scopes and capability revisions
- current release decisions and their applicability

Development fixtures may exercise UI and adapter contracts, but they must never be mixed into an authenticated canonical workpiece or represented as release authority.

## 5. Readiness Boundaries

The system uses three distinct readiness concepts.

### 5.1 Ingest readiness

Quench can read and validate the packet contract and resolve the artifacts needed for packet inspection. This answers whether a packet can be truthfully ingested; it does not authorize publishing.

### 5.2 Canonical handoff readiness

Hammer's Tongs-verified manifest declares whether the completed upstream handoff is ready for Quench. This evidence is immutable for the snapshotted manifest revision. It does not replace destination-specific publish validation.

### 5.3 Publish readiness

Quench evaluates the current canonical projection against selected destination capabilities, required metadata, required exports, current decisions, asset accessibility, and schedule constraints. Only a fail-closed `ready` verdict may permit adapter execution.

These concepts must not be collapsed into one generic "ready" flag.

## 6. Quench Responsibilities

Quench owns:

- resolving the canonical release projection through Tongs
- truthfully presenting ingest, canonical-handoff, and publish readiness
- collecting minimal destination and release-mode choices
- selecting among Tongs-authorized immutable candidates
- recording provider-neutral experiment intent against verified candidates
- validating destination capabilities and release requirements
- dispatching live platform adapters when those adapters exist
- reporting independent per-destination outcomes and recovery actions
- writing durable decisions and execution receipts through Tongs

Quench may offer metadata assistance only as an uncommitted draft. Applying or committing metadata must preserve Tongs as canonical authority.

## 7. Explicit Quench Non-Responsibilities

Quench must not:

- edit audio or video
- render or compile a Hammer timeline
- mix or master audio
- create thumbnails, graphics, shorts, clips, or alternate media formats
- reinterpret ambiguous edit structure or mutate Hammer's project structure
- request Hearth or Hammer to generate new variants during release execution
- treat route state, a local path, or a client object as release authority
- store canonical assets or establish a second metadata authority
- claim provider publishing, scheduling, or experiment rotation without provider acknowledgement

If a required artifact does not exist or is unsuitable, Quench reports the exact readiness failure. The workpiece returns upstream for a new artifact or authorized revision.

## 8. Thumbnail Selection and Experiment Intent

Thumbnail candidates are created upstream and verified through Tongs before Quench can use them.

Quench may select eligible candidates, assign control and variants, persist provider-neutral experiment intent, and cancel intent through a new canonical decision.

Quench may not alter candidate recipes or pixels, request regeneration during release execution, treat experiment intent as active provider rotation, or write Ledger performance evidence before verified provider observations exist.

Every decision is bound to its manifest snapshot, metadata revision, candidate set, brand binding, and destination capability revision. If any authority advances, applicability must be reevaluated.

## 9. Handoff and Revision Semantics

Hammer must not silently auto-authorize a release. The user initiates release review, and Tongs resolves current canonical authority.

After handoff:

- Hammer does not modify a Quench decision or downstream provider output.
- Quench does not modify Hammer production artifacts.
- A production correction creates a new upstream artifact and manifest revision.
- Tongs preserves immutable prior snapshots and release-decision history.
- Existing decisions require applicability review when their bound authority advances.

## 10. Failure and Recovery

Boundary failures must be explicit and actionable. Examples include an invalid manifest, a handoff that is not ready, advanced metadata or candidate authority, an absent export, an unsupported capability, a decision revision conflict, or provider execution failure.

Canonical history remains intact. A failure on one destination must not erase another destination's success. Retries must be idempotent and tied to persisted operation or platform receipts.

## 11. Security and Integrity

- Tongs authorization precedes canonical reads, locks, receipt replay, and mutation.
- Platform secrets remain server-side and use least-privilege scopes.
- Exact manifest bytes and hashes are verified before becoming release authority.
- Durable decisions are immutable revisions, not in-place edits.
- Client state cannot elevate itself into canonical authority.
- Raw provider errors are retained safely without exposing secrets to the UI.

## 12. Current and Future Execution

The authority contract applies even when a destination adapter is only scaffolded.

- Stub validation and deterministic fixture receipts are development behavior only.
- A live adapter must return `not_implemented` or an equivalent truthful failure until provider execution exists.
- Scheduling, upload, RSS rendering, and provider-side experiment execution are not live merely because contracts or UI controls exist.
- Provider acknowledgement is required before Tongs or Ledger records a real external outcome.

## 13. Canonical Summary

Hammer finishes the media. Tongs establishes release authority. Quench decides and executes distribution against that authority. Tongs records the durable result. Ledger evaluates verified outcomes.

If work creates or reshapes content, it belongs upstream. If work authorizes persisted state, it flows through Tongs. If work delivers already-authorized content, it belongs in Quench.
