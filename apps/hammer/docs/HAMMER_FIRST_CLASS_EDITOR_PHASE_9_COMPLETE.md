# Hammer First-Class Editor Phase 9 Completion

Phase 9 establishes render jobs, creative masters, and receiver-validated Quench handoff as revision-bound Hammer authority.

## Authority impact

Render jobs are immutable work orders over:

- exact Composition V2 revision and fingerprint;
- complete source fingerprint set;
- render-plan compiler version and fingerprint;
- renderer version;
- output profile.

Render results cannot acknowledge or overwrite composition truth. A completed result may become stale when the canonical composition changes before acknowledgement, and stale jobs cannot enter the release packet.

Hammer owns finished creative video/audio masters, captions, transcript, thumbnail reference, render manifest, and release-packet validation. Quench owns destination encoding, scheduling, upload, RSS, publishing, and delivery receipts.

## Permanent regression proof

The Phase 9 foundation gate proves:

- queued jobs can start;
- running jobs can resume;
- queued/running jobs can cancel;
- failed, cancelled, and stale jobs can retry as new queued jobs;
- source fingerprint mismatch fails closed;
- stale completion cannot be acknowledged;
- duplicate acknowledgement is rejected;
- incomplete render results cannot build a release packet;
- release packets include render-plan, renderer, output-profile, source, asset, and result-fingerprint evidence;
- Quench rejects identity, stale composition, render-plan, source, and unauthorized-asset mismatches.

## Preview/render implications

The golden semantic render plan and mounted preview frame remain signed and covered.

`HammerRenderJobV1` captures the render-plan version and fingerprint that preview already uses. `HammerReleasePacketV2` carries that render-plan fingerprint through to Quench validation, so preview/render parity is not replaced by a release-time assertion.

## Migration and RLS disposition

No new migration or RLS policy is required for Phase 9.

Phase 0 and the Composition V2 baseline already established:

- `render_jobs_path`;
- `release_packet_path`;
- recording-revision RLS;
- Tongs compare-and-swap composition acknowledgement.

Phase 9 tightens the JSON contracts stored through those existing revision-scoped artifact paths. It does not introduce a new durable table or shared write path.

## Explicit deferrals

Deferred refinements:

- distributed rendering;
- hardware-specific optimization;
- render-farm scheduling;
- platform-specific destination encodes, which remain Quench-owned.

These deferrals do not block the first complete podcast-editing path.
