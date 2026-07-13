# Hammer First-Class Editor — Phase 6 Completion

Phase 6 establishes multicamera and visual composition as canonical
Composition V2 timeline decisions.

## Canonical authority

`HammerSourceGroupV1` records source membership, primary source, deterministic
offsets, synchronization method, and evidence fingerprints. Timecode, waveform,
and explicit manual alignment produce the same versioned source-group contract.
Drift and unavailable measurements are distinct diagnostics. Render-plan source
operations carry the canonical group identity and synchronization offset.

Typed visual commands own angle switches, single/split-screen/PIP layouts,
crops, transforms, B-roll, stills, reference clips, lower thirds, logos,
intro/outro packaging, and color treatment intent. These commands enter the one
Composition V2 history and therefore share its acknowledgement, conflict, Undo,
and raw-restoration behavior. Preview and render receive identical visual
payload, layer order, placement, source fingerprint, and sync semantics from the
signed render plan.

## Advisory analysis boundary

Speaker and face analysis may emit an `HammerAngleProposalV1`; they never mutate
the timeline. Acceptance requires the exact composition identity, revision,
fingerprint, current immutable frame identity, and a source belonging to the
canonical source group. Stale, wrong-frame, missing-angle, and non-group
proposals fail closed.

The existing shared neutral face-analysis authority,
`ForegroundMatte.alphaMask`, exact-frame comparison, automatic-placement policy,
and `commit_allowed` refusal boundary are unchanged. Accepted automatic
placement remains an ordinary undoable Composition V2 history command.

## Migration and RLS disposition

Phase 0 established Composition V2 as the revision-scoped creative document.
Source groups and visual parameters are nested inside that existing canonical
document, so no new pointer, table, migration, or RLS policy is required. They
use the existing Tongs compare-and-swap persistence and recording-revision RLS
boundary. Browser or local state cannot acknowledge them.

## Explicit deferrals

Nested clips, advanced shot matching, dedicated source/program monitors, deep
collaboration, and broader motion-design tooling remain deferred. They may not
introduce a second timeline, placement, face, matte, or render authority.
