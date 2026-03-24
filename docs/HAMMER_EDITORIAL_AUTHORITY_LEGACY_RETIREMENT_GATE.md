# HAMMER Editorial Authority Legacy Retirement Gate

## Goal
Define objective criteria for retiring legacy edit-plan projection as authoritative fallback.

## Retirement Preconditions
- Canonical graph write coverage is 100% for all Hammer edit mutations in production paths.
- Canonical graph read coverage is 100% for preview/export/handoff assembly inputs.
- No UI surface reads legacy edit-plan as primary truth.
- Quench ingest validates editorial truth extension in all required packet variants.

## Evidence Requirements
- Contract tests prove canonical graph serialize/deserialize lossless for all active operation families.
- History tests prove undo/redo/replay preserve canonical operation identity.
- Persistence tests prove canonical-only snapshots hydrate without requiring legacy edit-plan authority.
- Assembly tests prove deterministic preview/export/handoff plan output from canonical graph.
- Packet tests prove operation + capability posture is declared without downstream inference.

## Operational Safeguards
- Telemetry metric: percent of sessions hydrated from canonical graph without legacy fallback.
- Telemetry metric: count of degraded/unavailable operations by type and runtime capability.
- Alarm threshold: any canonical read failure or projection mismatch blocks legacy retirement.

## Cutover Gate
Legacy projection can stop being authoritative fallback only when:
- Two consecutive release cycles meet all evidence requirements.
- Canonical hydrate success rate is above 99.9% with no Sev-1 regressions.
- Quench downstream validation reports zero compatibility regressions.

## Post-cutover
- Keep legacy projection code path behind a short-lived rollback flag for one additional release cycle.
- Remove fallback and dead compatibility mapping only after rollback window closes cleanly.
