# Bellows V1 Runtime Adapter Contract Layer

## Purpose

Define the first non-pure Bellows boundary between the headless session engine and
real-world runtime systems.

This phase does not implement capture, signaling, storage, or broadcast behavior.
It defines how Bellows will ask for those behaviors.

## Canonical Rule

The Bellows engine remains the sole source of session behavior truth.

Runtime systems do not mutate Bellows state directly. They receive declared engine
effects, perform external work, and feed explicit actions back into the engine.

## Runtime Adapter Domains

- `studio_shell`
  - Owns countdown and preflight execution.
- `capture`
  - Owns timebase establishment, sync cues, local recording start, and local finalization.
- `broadcast`
  - Owns live output start/stop only.
- `persistence`
  - Owns upload resume, integrity verification, manifest assembly, and session sealing.
- `signaling`
  - Owns invite generation and authority coordination signals such as co-host promotion.

## Runtime Contracts

Bellows Phase Three introduces:

- Typed adapter interfaces for each runtime domain.
- A deterministic effect dispatcher that maps engine effect types to adapter calls.
- A session runtime harness that executes:
  - `action -> reducer -> transition -> declared effects -> adapter dispatch`
- A dispatch callback in adapter context so runtime handlers can feed follow-up actions
  back into the engine without bypassing reducer logic.

## Effect Routing Table

- `run_preflight_checks` -> `studio_shell`
- `start_countdown` -> `studio_shell`
- `establish_t0` -> `capture`
- `emit_sync_marker` -> `capture`
- `start_local_recording` -> `capture`
- `finalize_local_segments` -> `capture`
- `start_broadcast` -> `broadcast`
- `stop_broadcast` -> `broadcast`
- `resume_pending_uploads` -> `persistence`
- `verify_integrity` -> `persistence`
- `assemble_manifest` -> `persistence`
- `seal_session_record` -> `persistence`
- `generate_invite_links` -> `signaling`
- `promote_co_host` -> `signaling`
- `enter_engine_stewardship` -> `signaling`

## Phase Boundary

Phase Three still excludes:

- Browser APIs
- Media capture implementation
- WebRTC/signaling transport implementation
- Storage writes
- Broadcast platform calls
- React UI work

The result is runtime seam truth, not runtime feature completion.
