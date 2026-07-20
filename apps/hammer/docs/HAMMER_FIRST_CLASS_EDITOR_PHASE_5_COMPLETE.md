# Hammer First-Class Editor — Phase 5 Completion

Phase 5 establishes one non-destructive audio-post authority inside canonical
`HammerCompositionV2` history.

## Canonical authority

Ordered, typed `HammerAudioTreatmentV1` commands persist only as part of the
Composition V2 transaction. They cover clip/track gain, speaker-scoped EQ and
dynamics, gating, limiting, de-essing, noise and room treatment, crossfades,
program loudness, and sidechain ducking. Every change therefore uses the
existing compare-and-swap acknowledgement and can be undone to untouched raw
source media.

`HammerAudioGraphV1` is a deterministic derived projection. It binds every
audible source node to the canonical media fingerprint and feeds both
interactive preview and export selection. Bypass/compare is an explicit
execution mode over the same signed graph; it is not alternate creative state.

Original source media is immutable. Waveforms, proxies, processed previews,
analysis, and render intermediates remain regenerable derived artifacts.

## Output ownership

Hammer owns the creative video master, creative audio master, and neutral
finished master. Quench owns noncreative destination encoding, upload,
scheduling, publishing, RSS, and delivery receipts. The audio graph declares no
platform-specific output authority.

## Migration and RLS disposition

No migration or RLS change is required. Audio parameters are carried inside the
already versioned Composition V2 document and its concurrency-controlled Tongs
persistence boundary. No new table, browser acknowledgement, or local
persistence path was introduced.

## Permanent proof

The Hammer first-class-editor foundation suite proves deterministic graph
fingerprints, canonical source binding, preview/export graph equality,
per-treatment bypass and full bypass comparison, loudness and clipping
diagnostics, invalid limiter and crossfade refusal, master intent ownership, and
repeated Undo to the raw-source composition.

## Explicit deferrals

Specialist mastering controls beyond podcast delivery needs, background render
distribution, hardware-specific optimization, and advanced cache eviction are
deferred. They may not create a second audio graph or persistence authority.
