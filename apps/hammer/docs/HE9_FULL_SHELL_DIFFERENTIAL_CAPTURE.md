# HE-9 full-shell differential capture

Captured read-only on 2026-08-24 from the authenticated Hammer full-shell mount. No
editor or recovery control was activated. The tab and local server were closed after
capture.

## Mounted identity and durable authority

- Workspace: `494c2ae5-9037-4208-b898-fab4898ab430`
- Workpiece: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`
- Revision: `f642b5d9-cec2-4656-804e-49bb33bc0cb5`
- Revision token: `2026-08-23T08:00:37.108321+00:00`
- Sequence-one head: `hammer-state:8387e7e6`
- History bytes / SHA-256: `298829` / `6508f167c4ba54438a81a14a657a9d545466e35dd04f88703f0f842bd74eeb05`
- Placements bytes / SHA-256: `64059` / `1aaf975dd6f5ee6ae0bfa86d8c027fc89b73b312ed5f30024947a516026f4569`
- Timeline bytes / SHA-256: `79616` / `2c2084582746b...`
- Transcript bytes / SHA-256: `20204` / `005e...`
- Audio bytes / SHA-256: `83717` / `1795...`
- Component-authority bytes / SHA-256: `751` / `4a233...`

The full shell resolved `137` transcript segments, `29` canonical placements,
`28` mounted composition clips, and `2` uncertain clips. These values match the
previous HE-9 branch acceptance capture, so the failure is not a different durable
placement projection or a rejected component-authority promotion.

## Failure boundary

Immediately before history installation, durable hydration projected
`selectedSegmentId=turn_137` and `playheadSec=0`. The accepted sequence-one history
head records the HE-8 interaction state `selectedSegmentId=turn_102` and
`playheadSec=386.5`. Both fields participate in the strict current-head hash, so the
full shell reported `history_current_head_mismatch`, installed `0 undo / 0 redo`, and
showed recovery even though its durable artifact projection was correct.

The earlier passing authenticated evidence used the dedicated acceptance route. It
proved component-authority equality but did not execute the full shell's strict
`verifyHammerHistoryAgainstCanonicalHead` installation boundary.

## Observed completion ordering

The development server caused three Vite dependency-optimization reloads, in this
order:

1. React Router / Supabase dependencies at 12:09:46.
2. MediaPipe selfie segmentation at 12:11:46.
3. MediaPipe tasks vision at 12:12:15.

Every completed mount reached the same mismatch. The available browser-control API
exposed DOM and console state but not a completed HTTP-response ledger, so individual
response completion timestamps and bodies could not be exported from the live tab.
Artifact tuples above are correlated with the frozen HE-8/HE-9 authority evidence;
they are not represented as a fresh network-log capture.

## Correction boundary

Before strict verification, Hammer now overlays only the session fields owned by the
active undo stack (`selectedSegmentId` and `playheadSec`) onto the freshly hydrated
durable canonical state. Durable artifacts remain sourced from canonical hydration,
and the unchanged strict verifier still rejects a stale 30-placement projection. The
regression repeats the captured reload ordering and proves deterministic projection.
