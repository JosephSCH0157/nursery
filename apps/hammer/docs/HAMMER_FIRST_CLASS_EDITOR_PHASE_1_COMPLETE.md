# Hammer First-Class Editor — Phase 1 Complete

Completed: 2026-07-13.

## Canonical authority

`HammerMediaProvenanceManifest` is the revision-scoped Tongs artifact for source provenance and derived-artifact metadata. A source is identified by stable `media_id`, canonical asset reference, and content fingerprint. Relinking may change its resolvable path only after the candidate fingerprint matches; editing commands cannot rewrite source identity or bytes.

Derived proxies, waveforms, thumbnails, analysis products, and render intermediates are non-authoritative, regenerable artifacts. Their identity key is:

```text
source fingerprint + artifact kind + generator version
```

Tongs persists their metadata and canonical asset/path references through `media_provenance_path`. Browser memory, IndexedDB, and local files may cache bytes but never acknowledge provenance, relink, or canonical availability.

## Availability and diagnostics

The executable contract distinguishes `missing`, `unavailable`, and `fingerprint_mismatch`; none collapses into an empty source. Each blocks render-plan compilation and produces an explicit relink-capable diagnostic. A relink candidate that is unavailable or fingerprint-mismatched is refused without mutating provenance.

## Preview and render

Render-plan operations carry the canonical source fingerprint. Interactive preview may select a current proxy, while final render selects the canonical source. Both resolutions must match the fingerprint embedded in the plan; a stale proxy is ignored and a mismatched source blocks execution.

## Persistence and RLS disposition

No additional Phase 1 migration is required beyond `20260713023000_tongs_hammer_composition_v2.sql`, which introduced `media_provenance_path` on the revision row. The pointer remains protected by the existing `recording_revisions` viewer/editor RLS policies and the workspace/workpiece/revision-bound Tongs save path. Artifact metadata is stored under the canonical revision path; no local persistence fallback exists.

## Permanent regression proof

The Hammer foundation suite covers missing, unavailable, mismatched, successfully relinked, candidate-unavailable, stale-generator, stale-fingerprint, proxy-preview, canonical-render, and shared-fingerprint behavior. Complete test discovery, strict compilation, coverage, lint, and production build remain the permanent gate.

## Explicit deferrals

Background proxy scheduling and advanced cache eviction remain deferred. They must consume this registry and may not introduce another source identity or persistence authority.
