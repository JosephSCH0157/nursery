# Anvil release-readiness evidence — 2026-08-29

Status: **Phases 0–5 passed; Phase 6 blocked at Docker-backed gate; not release certified**

## Baseline

- Repository commit: `0d17002f6088f61f604d91b3180fae6142cbe72f`
- Branch: `main`
- Anvil package version: `1.8.5`
- Declared Anvil build baseline: `v1.8.x` (`2026-02-20`)
- Release browsers: current stable Chrome and Edge on Windows
- Canonical persistence: Supabase `tongs` schema and the `forge-workpieces` storage bucket
- Certification rule: phases execute in order; a failed exit gate stops promotion.

The working tree was already dirty when certification began. Recording-authority work is present alongside unrelated Bellows, Hammer, Hearth, Nursery, shared-package, and configuration edits. Those changes have not been discarded, reset, or attributed to this certification run.

## Recording failure classification

The focused recording run executed 12 suites and 50 tests: 10 suites/44 tests passed; 2 suites/6 tests failed.

| Failure | Classification | Required disposition |
| --- | --- | --- |
| Local safety-copy write failure is not reported | Test media-track double aborts before finalization | Replace the incomplete track double with the shared lifecycle-capable fixture; retain the production safety assertion. |
| Missing recording-folder handle is not reported after canonical success | Test media-track double aborts before finalization | Same fixture repair; verify canonical success remains distinct from local-mirror failure. |
| Missing recording-folder handle does not preserve the stronger unsafe state when canonical save fails | Test media-track double aborts before finalization | Same fixture repair; preserve the stronger canonical-loss warning. |
| No-audio finalized artifact does not reach validation | Test media-track double aborts before finalization | Exercise finalization with a lifecycle-capable track and prove invalid media never uploads. |
| Valid audio-only artifact is not committed | Test media-track double aborts before finalization | Exercise the actual upload/completion path with a valid audio fixture. |
| Valid AV artifact is not committed | Test media-track double aborts before finalization | Exercise the actual upload/completion path with valid audio and video fixtures. |
| `workpiece-commit.upload.test.ts` cannot compile | Stale contract fixture | Supply mandatory venue-neutral `captureAuthority`; do not weaken `RecordingCommitInput`. |

The production build and Anvil TypeScript check pass. The new workpiece and capture-authority suites pass 18/18, but that is insufficient to certify recording.

## Pending database work

The venue-neutral migration is `20260829120000_tongs_venue_neutral_recording_authority.sql`; trusted canonical media verification follows in `20260829130000_tongs_recording_canonical_media_verification.sql`. Certification applies every pending migration in canonical timestamp order to both:

1. A fresh disposable Supabase database.
2. A production-shaped pre-migration database containing existing workpieces, Anvil authorities/executions, completions, decisions, recording assets, and Hammer lineage.

Required proofs include migration atomicity, immutable receipts, RLS isolation, idempotency conflicts, preserved authority IDs/foreign keys, and absence of partially migrated objects.

## Phase 1 certification result

Docker Desktop 4.88.1 / Engine 29.7.2 started successfully after the user-applied update. The existing Docker socket was not altered.

- Clean disposable stack: `forge-he3-anvil-phase1`, loopback ports `57321–57329`.
- Production-shaped upgrade stack: `forge-he3-anvil-upgrade`, loopback ports `58321–58329`.
- Both stacks reached canonical migration head `20260829120000` in timestamp order.
- Clean-chain initialization exposed and fixed a production-incident repair migration that incorrectly required its incident fixture on fresh databases.
- Venue-neutral authority verification exposed and fixed the retained Anvil-only Ready trigger for unscripted capture.
- Decision verification exposed and fixed keep/discard persistence that still depended on copied Anvil execution identity.

The production-shaped fixture included a legacy workpiece, Anvil authority/execution, completion, keep decision, recording file, and committed Hammer import. After migration, all original IDs and foreign-key lineage survived, and `current_workpiece_recorded_takes` projected both recording sources.

The database verifier passed on both stacks and proved:

- Shared workpiece creation is separate from Record-time capture authority.
- Creation, capture, completion, and decisions are replay-idempotent and reject changed operation-key payloads.
- Unscripted Anvil recording uses shared capture authority plus venue-specific execution evidence.
- Viewer read access and unrelated-workspace RLS isolation hold for every recording authority table.
- Creation, capture, execution, completion, and decision receipts are immutable, including to `service_role` writes.
- Shared RPCs are PostgreSQL-owned security definers with fixed `search_path=pg_catalog, tongs`.

Static venue-neutral migration tests passed 5/5. The broader Tongs suite currently has 403 passing and 4 unrelated pre-existing mock-chain failures in workspace/storage listing tests; these are recorded for the later workspace gate and were not used to waive any Phase 1 database check.

## Phases 2–4 certification result

- Workpiece/capture boundary tests pass at unit, database readback, and real Chromium levels. New preserves temporary text/title/scroll through canonical route rebinding while creating only a Warming workpiece and creation receipt; opening an existing workpiece performs no recording mutation.
- The focused Anvil recording suite passes 12/12 suites and 60/60 tests. Typecheck passes. Lint remains at the established ratchet: 0 errors and the existing 15 warnings.
- Tongs now downloads the canonical storage object, recomputes bytes and SHA-256, checks registered metadata, and probes the stored bytes with ffprobe. Audio is mandatory; AV also requires video; duration must be positive.
- Completion now requires an immutable `recording_media_verification_receipts` row minted by the service-only verified completion RPC. Authenticated browser callers cannot execute the prior self-asserted completion RPC.
- Hammer's recorded-take projection includes only kept Anvil completions backed by a canonical verification receipt. Unverified legacy completion rows retain their IDs and foreign-key lineage but are not exposed to Hammer.
- Canonical verification regression tests pass 7/7: valid AV, tampered hash, truncated object, metadata mismatch, missing audio, wrong-workpiece binding, and browser/server disagreement.
- After the Phase 4 migration changed the chain, clean and production-shaped upgrade certification were rerun from scratch through `20260829130000`; both DB authority/RLS verifiers passed and legacy lineage survived.

One upgrade diagnostic command initially omitted `--local` and reached the repository's linked database endpoint. The attempted migration failed atomically on its first new object dependency and applied no migration; the disposable certification was then rerun explicitly with `supabase db push --local`. This must be retained in the audit evidence and the release gate must make `--local` non-optional for disposable certification.

## Phase 5 recovery result

Existing immutable receipts, stable operation keys, registered file state, canonical verification, completion, and decision rows distinguish every tested refresh boundary. Replays create exactly one workpiece, capture authority, verification receipt, completion, and decision. The unscripted route now recovers pending decisions with the venue-neutral capture-authority ID and uses the v2 decision contract. No pending-operation authority was introduced.

## Phase 6 gate status

`gate:anvil-release` now covers workspace preflight, the established lint ratchet, typecheck, cycle detection, production build, Tongs recording/verification suites, all Anvil recording suites, a self-contained Chromium boundary test, disposable clean/upgrade migration certification, strict Anvil smoke, and the Hearth-to-Anvil browser handoff.

The latest run passed through the clean disposable database certification. While starting the production-shaped upgrade leg, Docker Desktop became unresponsive. A direct health check failed with: `500 Internal Server Error` for `//./pipe/dockerDesktopLinuxEngine/v1.55/info`. The gate was stopped; Phase 6 is not passed, its second clean run was not attempted, and Phases 7–8 were not started.

Post-reboot retry: Docker Desktop was initially not running (`com.docker.service` stopped and no Desktop process). The installed Desktop executable was launched normally without modifying the Docker socket. After 60 seconds, `docker info` still failed with the same `500 Internal Server Error` for `//./pipe/dockerDesktopLinuxEngine/v1.55/info`; the server version and storage driver remained empty. Supabase and `gate:anvil-release` were therefore not started on this retry.

Second health retry: the Docker CLI responded with client version `29.7.2` and context `desktop-linux`, but the engine endpoint again returned `500 Internal Server Error`, this time for `//./pipe/dockerDesktopLinuxEngine/v1.55/version`. The subsequent `docker info` remained silent for another 30 seconds and was interrupted. No Supabase or release-gate action was attempted.

## Release evidence still required

- Ordered migration manifest and clean/upgrade certification logs
- RLS and lineage verification output
- Anvil release-gate output from two consecutive clean runs
- Chrome and Edge versions and real-device matrix
- Canonical asset verification results for each accepted certification take
- Final commit SHA, application version, database migration head, and deployment cohort metrics
