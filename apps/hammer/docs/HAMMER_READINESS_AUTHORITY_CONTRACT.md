# Hammer Readiness Authority Contract

Sprint: Operational Confidence (Beta Gate Closure)  
Phase: 6 - Canonical readiness, export, and handoff truth

## Purpose

Define one canonical readiness verdict that survives:

- Hammer UI
- Ready summary
- export packet generation
- Quench handoff validation

This contract exists to eliminate lossy translations, UI-local readiness logic, and silent disagreement between Hammer and Quench.

## Core Rule

`Ready` is a derived authority verdict, never a local UI state.

No layer may reinterpret readiness into a different meaning. Layers may only:

- seed canonical reasons
- append canonical reasons
- serialize canonical reasons
- render canonical reasons
- apply policy on top of canonical reasons

No downstream layer may discard or replace an existing canonical reason code. It may only append additional canonical reasons.

## Canonical Types

```ts
export type HammerReadinessVerdictStatus = "ready" | "needs_review" | "blocked";

export type HammerReadinessReasonSeverity = "blocking" | "review";

export type HammerReadinessReasonSource =
  | "gate"
  | "artifact"
  | "packet"
  | "handoff";

export type HammerReadinessReasonCode =
  | "export_posture_unavailable"
  | "export_posture_degraded"
  | "operation_unavailable"
  | "operation_degraded"
  | "unresolved_broll_intent"
  | "bound_attention_image"
  | "bound_attention_video"
  | "bound_attention_audio"
  | "podcast_master_unavailable"
  | "podcast_master_degraded"
  | "podcast_master_export_only"
  | "artifact_transcript_missing"
  | "artifact_transcript_stale"
  | "artifact_transcript_failed"
  | "artifact_subtitles_srt_missing"
  | "artifact_subtitles_srt_stale"
  | "artifact_subtitles_vtt_missing"
  | "artifact_subtitles_vtt_stale"
  | "artifact_visuals_missing"
  | "artifact_visuals_stale"
  | "artifact_audio_missing"
  | "artifact_audio_stale"
  | "artifact_audio_failed"
  | "artifact_audio_unsupported"
  | "artifact_audio_requires_future_ffmpeg"
  | "packet_workpiece_id_missing"
  | "packet_kind_invalid"
  | "packet_editorial_truth_missing"
  | "packet_timeline_snapshot_missing"
  | "handoff_blocked"
  | "handoff_needs_review";

export interface HammerReadinessReason {
  code: HammerReadinessReasonCode;
  label: string;
  severity: HammerReadinessReasonSeverity;
  source: HammerReadinessReasonSource;
  operationId: string | null;
}

export interface HammerReadinessVerdict {
  status: HammerReadinessVerdictStatus;
  readyForQuench: boolean;
  reasons: HammerReadinessReason[];
  blockingReasons: HammerReadinessReason[];
  reviewReasons: HammerReadinessReason[];
  counts: {
    blocking: number;
    review: number;
  };
  primaryOperationId: string | null;
}
```

## Status Semantics

- `ready`: no blocking or review reasons remain
- `needs_review`: no blocking reasons remain, but one or more review reasons remain
- `blocked`: one or more blocking reasons remain

`readyForQuench` must equal `status === "ready"`.

## Reason Code Table

| Code | Source | Severity | Canonical Label | Meaning | Current Origin |
| --- | --- | --- | --- | --- | --- |
| `export_posture_unavailable` | `gate` | `blocking` | Export assembly is unavailable. | Export assembly cannot truthfully support handoff. | `hammerReadinessGate.ts` |
| `export_posture_degraded` | `gate` | `review` | Export assembly is degraded and needs review. | Export can proceed only with review truth. | `hammerReadinessGate.ts` |
| `operation_unavailable` | `gate` | `blocking` | Operation is unavailable for export. | An active operation cannot be represented in export. | `hammerReadinessGate.ts` |
| `operation_degraded` | `gate` | `review` | Operation is degraded for export. | An active operation degrades export truth. | `hammerReadinessGate.ts` |
| `unresolved_broll_intent` | `gate` | `review` | Unresolved B-roll suggestion still needs editorial resolution. | Intent exists without a final resolved binding. | `hammerReadinessGate.ts` |
| `bound_attention_image` | `gate` | `review` | Image binding needs review. | Bound image object is unresolved, degraded, superseded, or otherwise flagged. | `hammerReadinessGate.ts` via bound attention queue |
| `bound_attention_video` | `gate` | `review` | Video binding needs review. | Bound video/B-roll object is unresolved, degraded, superseded, or otherwise flagged. | `hammerReadinessGate.ts` via bound attention queue |
| `bound_attention_audio` | `gate` | `review` | Audio binding needs review. | Bound audio-linked object requires review. | `hammerReadinessGate.ts` via bound attention queue |
| `podcast_master_unavailable` | `gate` | `blocking` | Podcast Master is declared but unavailable in this runtime. | Declared mastering operation cannot run or hand off truthfully. | `hammerReadinessGate.ts` |
| `podcast_master_degraded` | `gate` | `review` | Podcast Master is declared with degraded stage support. | Mastering operation exists but with degraded runtime support. | `hammerReadinessGate.ts` |
| `podcast_master_export_only` | `gate` | `review` | Podcast Master is export-only in this runtime. | Runtime cannot preview the full mastering truth. | `hammerReadinessGate.ts` |
| `artifact_transcript_missing` | `artifact` | `blocking` | Transcript output is missing. | Release prep lacks transcript output required for truthful handoff. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_transcript_stale` | `artifact` | `blocking` | Transcript output is stale. | Transcript artifact does not match current canonical basis. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_transcript_failed` | `artifact` | `blocking` | Transcript output failed during preparation. | Transcript artifact preparation failed. | future mapping support |
| `artifact_subtitles_srt_missing` | `artifact` | `blocking` | SRT captions are missing. | SRT output is absent for handoff truth. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_subtitles_srt_stale` | `artifact` | `blocking` | SRT captions are stale. | SRT output no longer matches canonical basis. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_subtitles_vtt_missing` | `artifact` | `blocking` | VTT captions are missing. | VTT output is absent for handoff truth. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_subtitles_vtt_stale` | `artifact` | `blocking` | VTT captions are stale. | VTT output no longer matches canonical basis. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_visuals_missing` | `artifact` | `blocking` | Visual placements are missing. | Visual prep output is absent. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_visuals_stale` | `artifact` | `blocking` | Visual placements are stale. | Visual prep output no longer matches canonical basis. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_audio_missing` | `artifact` | `blocking` | Audio prep is missing. | Audio prep output is absent. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_audio_stale` | `artifact` | `blocking` | Audio prep is stale. | Audio prep output no longer matches canonical basis. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_audio_failed` | `artifact` | `blocking` | Audio prep failed during preparation. | Audio prep failed and cannot be truthfully treated as complete. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_audio_unsupported` | `artifact` | `blocking` | Audio prep is unsupported in the current runtime. | Runtime cannot prepare the requested audio path. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `artifact_audio_requires_future_ffmpeg` | `artifact` | `blocking` | Audio prep requires future FFmpeg-backed preparation. | Current runtime cannot fully prepare requested audio output. | `hammerReleasePrepPackage.ts` -> mapped in readiness layer |
| `packet_workpiece_id_missing` | `packet` | `blocking` | Missing workpiece id in release packet. | Packet is not valid for handoff. | `hammerQuenchHandoff.ts` |
| `packet_kind_invalid` | `packet` | `blocking` | Invalid release packet kind. | Packet is malformed or for the wrong consumer. | `hammerQuenchHandoff.ts` |
| `packet_editorial_truth_missing` | `packet` | `blocking` | Missing editorial truth payload. | Packet omits canonical editorial truth required for validation. | `hammerQuenchHandoff.ts` |
| `packet_timeline_snapshot_missing` | `packet` | `blocking` | Missing export timeline snapshot in editorial truth. | Packet omits export timeline proof required for handoff validation. | `hammerQuenchHandoff.ts` |
| `handoff_blocked` | `handoff` | `blocking` | Handoff is blocked. | Canonical readiness verdict blocks Quench handoff. | derived from verdict status |
| `handoff_needs_review` | `handoff` | `review` | Handoff needs review. | Canonical readiness verdict allows handoff only with explicit review posture. | derived from verdict status |

## Mapping Rules

### 1. Gate Seeding

`hammerReadinessGate.ts` is the seed authority.

It must emit:

- canonical `HammerReadinessReasonCode`
- canonical `HammerReadinessReason`
- canonical `HammerReadinessVerdict`

It must not emit ad hoc string-only reasons.

### 2. Artifact Enrichment

`hammerReleasePrepPackage.ts` remains the artifact status source, but not the final readiness verdict.

Artifact statuses must be normalized into canonical readiness reasons:

- `missing` -> corresponding `artifact_*_missing`
- `stale` -> corresponding `artifact_*_stale`
- `failed` -> corresponding `artifact_*_failed`
- `unsupported` -> corresponding `artifact_audio_unsupported`
- `requires_future_ffmpeg` -> corresponding `artifact_audio_requires_future_ffmpeg`

### 3. Handoff Enrichment

`hammerReleaseHandoffPosture.ts` must stop flattening structured reasons into strings.

It should:

- take a seed verdict
- append artifact reasons
- recompute aggregate verdict status from canonical reasons
- return the same verdict shape

It must not invent a second readiness model.

### 4. Packet Validation

`hammerQuenchHandoff.ts` may append packet validation reasons, but they must be canonical packet reason codes.

It may apply policy:

- `allowed`
- `requires_confirmation`
- `blocked`

It must not redefine readiness meaning.

### 5. Packet Serialization

`hammerQuenchReleasePacket.ts` must serialize:

- canonical `status`
- canonical `readyForQuench`
- canonical `reasonCodes`
- canonical structured reasons

Packet serialization must not flatten reasons to labels only.

### 6. UI Rendering

`HammerWorkspaceShell.tsx` and `hammerPassSelectors.ts` must render the verdict they are given.

They may:

- format labels
- count reasons
- choose CTA policy text

They must not:

- invent readiness reason codes
- reinterpret `ready`, `needs_review`, or `blocked`
- decide readiness from local pass maps

## Current File Mapping

| File | Current Output | Canonical Role | Rewrite Rule |
| --- | --- | --- | --- |
| `apps/hammer/src/editor/hammerReadinessGate.ts` | structured gate result | seed | emit canonical verdict directly |
| `apps/hammer/src/lib/hammerReleasePrepPackage.ts` | artifact status grid | enrich input | map artifact statuses to canonical reasons |
| `apps/hammer/src/lib/hammerReleaseHandoffPosture.ts` | handoff posture strings | enrich | stop flattening, return canonical verdict |
| `apps/hammer/src/editor/hammerQuenchHandoff.ts` | handoff policy + packet validation | policy + packet enrich | consume verdict, append packet reasons, keep policy separate |
| `apps/hammer/src/lib/hammerQuenchReleasePacket.ts` | packet readiness summary | serialize | preserve codes and structured reasons |
| `apps/hammer/src/editor/hammerPassSelectors.ts` | UI-local ready reason codes | render | consume canonical verdict; delete local ready reason-code invention |
| `apps/hammer/src/editor/HammerWorkspaceShell.tsx` | labels, CTA state, Ready summary | render | consume verdict directly; stop parallel readiness translation |
| `apps/nursery/src/routes/Quench.tsx` | independent packet readiness | downstream parity | either consume Hammer verdict or map to same canonical codes |

## Stop Rules

These are P0 inside Phase 6:

- Hammer UI says `Ready` while Quench would block the packet
- packet serialization drops canonical reason codes
- handoff policy mutates readiness meaning
- prepared package, packet build, and packet validation do not use the same snapshot basis
- UI invents readiness reason codes not present in canonical authority

## Send-Flow Snapshot Rule

Prepared package save, packet build, and packet validation must use the same snapshot object.

Disallowed pattern:

- prepare from one snapshot
- build packet from another
- validate against a third

Required pattern:

- derive one canonical release basis
- prepare from it
- build packet from it
- validate packet from it

## Implementation Order

1. Add this contract doc.
2. Add shared readiness types and reason-code union.
3. Make `hammerReadinessGate.ts` emit canonical verdict.
4. Map artifact statuses to canonical reasons.
5. Make `hammerReleaseHandoffPosture.ts` enrich the canonical verdict.
6. Fix send-flow snapshot mismatch.
7. Make `hammerQuenchReleasePacket.ts` serialize codes and structured reasons.
8. Make `hammerQuenchHandoff.ts` consume verdict for policy only.
9. Make `hammerPassSelectors.ts` consume verdict directly.
10. Make `HammerWorkspaceShell.tsx` render verdict directly.
11. Add Hammer parity tests.
12. Align Quench to the same readiness contract.

## Phase 6 Done Condition

Phase 6 is strong when:

- one canonical readiness verdict exists
- Hammer UI renders it
- packet serialization preserves it
- handoff policy consumes it without redefining it
- Quench cannot silently disagree with it
- `Ready` only appears when canonical export and handoff truth support it
