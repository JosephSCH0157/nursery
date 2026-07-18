# Hearth Canonical Authority

Status: active executable contract, 2026-07-12. This document defers to `../../FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`.

## Mounted implementation

`apps/hearth` is the only Hearth implementation and the only mounted Hearth product surface. Shared, non-product contracts are imported through declared workspace packages. There is no `packages/hearth` implementation.

## Authority and terms

| Term | Canonical authority | Meaning | Degraded state |
| --- | --- | --- | --- |
| Workpiece | Tongs/Supabase | Durable cross-tool production identity | Block editing/handoff when canonical identity cannot be read; never nominate from cache. |
| Editorial content | Hearth intent, persisted by Tongs | Draft, script, metadata, and visual intent attached to a workpiece | Show unsaved/offline; local state is recoverable cache, not saved truth. |
| Pre-production visual assets | Hearth creation and curation, persisted by Tongs | Thumbnails, still images, B-roll assets, reference clips, prompts, briefs, recipes, revisions, and brand provenance attached to a workpiece | Generation or commit failure remains explicit; never present an unacknowledged or cache-only asset as saved truth. |
| Ready | Tongs lifecycle state curated by Hearth | Reversible editorial candidacy (`ready`), not approval, lock, schedule, or recording | Show unavailable/unknown when Tongs cannot confirm it. |
| Approval | Tongs canonical approval revision | User-confirmed script revision; distinct from Ready | Approval fails unless Tongs acknowledges the revision. |
| Recording | Anvil receipt persisted by Tongs | `take_kept` establishes Recorded; completed/discarded takes do not | Unknown/blocked when receipts cannot be canonically read. |
| Local mirror | Forge/Tongs storage configuration | Best-effort copy, ingestion, recovery, or convenience; never authority | Report disconnected/failed without changing approval, Ready, or recording truth. |

## Local mirror independence

Canonical cloud approval completes without a mirror target, browser permission, handle, or successful mirror write. Mirror work is dispatched after canonical commit as an unawaited best-effort sink. Its result may update storage status only. It cannot fail, revoke, or delay approval and cannot determine Ready membership.

## Cross-tool contract

### Hearth to Hammer

Hearth may generate and curate workpiece-scoped thumbnails, still images, B-roll assets, and reference clips. It does not hand executable timeline truth directly to Hammer. It persists those assets and their editorial artifacts through Tongs: canonical `workspace_id` and `workpiece_id`, script revision/approval references, `metadata.json` episode package, image-map/media-map intent, immutable asset and recipe revisions, brand provenance, and asset identifiers. Hammer receives identifiers and advisory placement intent, then revalidates identity, attachment, revision, provenance, and asset availability with Tongs. Hammer owns edits, timing, executable placement, and final-media truth. Failure to revalidate is an explicit blocked/degraded state.

### Hearth to Quench

Hearth does not declare publish readiness. It persists editorial metadata and asset intent against the workpiece. Quench consumes a Hammer release packet containing canonical workpiece/final-media references plus publish metadata, and revalidates the packet and referenced artifacts. Quench owns platform validation, scheduling, upload, and publish status. Hearth Ready and Hearth approval never mean “Ready for publish.” Invalid, stale, or unavailable packet truth is blocked or needs review in Quench.

Handoff payloads are references plus advisory context, never self-authorizing truth. Receivers must revalidate through Tongs.

## Document precedence

1. `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`
2. This active authority contract and executable tests
3. `AGENTS.md` and current tool contracts
4. V2 schema contract
5. Product manifest (philosophy and scope; executable authority remains above)

