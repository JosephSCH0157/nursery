# Hammer CP-10 Florida reopen-quiescence retest

## Decision

**PASS.** On 2026-08-19, Florida Oranges reopened once through the normal authenticated Hammer project-library workflow using repair commit `6a8ba65354c959f958ad49b5ad4e0cf5b9f74bca`. Canonical revision authority installed successfully and the completed mount remained quiescent through hydration and the autosave debounce window. The complete relevant production state and all seven advertised artifact byte streams were identical before and after the open.

This checkpoint performed no edit, retry, reload, recovery, manual save, history action, or navigation after the Florida selection. It did not restore CP-9 state. Florida's existing authority revision 2 was the baseline.

## Runtime and scope

- Production project: `wtvdjndyxegudufrompx`
- Workspace: `494c2ae5-9037-4208-b898-fab4898ab430`
- Workpiece: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`
- Sealed recording: `6c5b0d00-f775-4611-ac67-284dd9ae7d39`
- Active revision: `f642b5d9-cec2-4656-804e-49bb33bc0cb5`
- Repair HEAD: `6a8ba65354c959f958ad49b5ad4e0cf5b9f74bca`
- Fresh Vite process: started `2026-08-19T11:29:46.0195591Z`; localhost port 5173 served HTTP 200 from repository HEAD above.
- Served-source check: the live Vite module exposed both `areHammerAuthorityGraphsSemanticallyEqual` and `createHammerSingleFlightCoordinator` from the repair.
- Florida open count: exactly one, at `2026-08-19T11:32:29.831Z`.
- Observation completed: `2026-08-19T11:32:53.888Z`, after complete hydration and the autosave debounce window.

The protected `apps/nursery/public/forge-nav.json` modification remained present, unstaged, and excluded.

## Read-only baseline

The authenticated production capture and Storage downloads completed before the open. Leaving the pre-existing editor tab for the project library was separately checked: the resulting pre-open state was byte-identical to the baseline (`C68275145F1CAFF032F2BAFD2C64361A56A0F8D21F50A6F07E364C6E4E1447D1`).

- revision status: `active`
- revision row token: `2026-08-19 11:11:01.882348+00`
- authority path: `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/editorial-authority.v1.json`
- authority fingerprint: `4a233d406b37abab0d9fb7ae708464aacc03cba6a188af96211669b6bde2a7bc`
- authority revision: `2`
- authority graph: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0:plan:authority`
- authority session: `session_fc4374ab-0097-4c0f-abd5-5a0099940abf`
- transcript identity: `hammer_transcript_85d076d6-54e6-4b56-ab60-5eff4c87cdd0_20260815124901`
- transcript: 137 segments
- timeline: v2, revision 3, 30 assets, 30 clips, one lane
- placements: 30
- history: v1, three entries, base `hammer-state:beaa7731`, head `entry:4bb8bdbc-1412-413d-ab90-d777b45d5ea9`

| Artifact | Bytes | SHA-256 | Registry revision | Registry token |
| --- | ---: | --- | ---: | --- |
| audio polish | 83,717 | `1795e76c65badd8bd85eebb822cbb31bd3b5827c22c2c16f62adfacd5302a7b4` | 212 | `2026-08-19 09:02:15.624366+00` |
| editor session | 1,477 | `dbb55ed1d7a4ce7122daf2582f0d87762a4d3bec7bd200e5785c826dee6f11a3` | 151 | `2026-08-19 09:02:13.322908+00` |
| editorial authority | 751 | `4a233d406b37abab0d9fb7ae708464aacc03cba6a188af96211669b6bde2a7bc` | 2 | `2026-08-19 09:02:21.504185+00` |
| history | 208,379 | `5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb` | 80 | `2026-08-18 15:26:50.828229+00` |
| transcript | 20,204 | `005e41d5a16c4ed813324a50589243f8257dd664b04dc440d7b078d690c078ef` | 150 | `2026-08-19 09:02:14.488718+00` |
| visual placements | 66,394 | `ec26a26fbc0be12e90581dad49b8d225c6d5e223cfa81a3da9a8375aac4eb4e6` | 192 | `2026-08-19 09:02:17.641662+00` |
| visual timeline | 81,728 | `b25949c9346245e0f44cc7db2021db0f366edf284cf2b7869a2a4382dab460e3` | 150 | `2026-08-19 09:02:16.657883+00` |

## Browser acceptance

The authenticated library displayed Florida as recorded, ready, backed by the canonical recording, saved Hammer session, and transcript artifact. The single Florida selection loaded:

- canonical persistence rather than transitional recovery;
- no missing-editorial-authority or transitional banner;
- the sealed recording and native playback source;
- the 137-segment transcript with zero modified segments and in-sync status;
- timeline v2 content with 30 accepted visual placements and three existing uncertainty flags;
- the expected revision-owned authority identities;
- the existing `history_current_head_mismatch` recovery notice, unchanged and untouched.

Browser evidence captured the loaded DOM, viewport, and console/request-adjacent diagnostics. No save, writer, CAS, conflict, retry, or recovery message appeared. The final persisted-state and artifact readbacks below are the authoritative network-side proof that no write path committed.

## Exact post-open comparison

The post-open Florida state JSON was byte-identical to baseline:

- baseline SHA-256: `C68275145F1CAFF032F2BAFD2C64361A56A0F8D21F50A6F07E364C6E4E1447D1`
- post-open SHA-256: `C68275145F1CAFF032F2BAFD2C64361A56A0F8D21F50A6F07E364C6E4E1447D1`

All seven post-open Storage downloads matched their baseline bytes exactly. Consequently:

- artifact writes: 0
- authority artifact writes: 0
- authority pointer/CAS changes: 0
- registry revision or timestamp increments: 0
- authority revision/fingerprint/path changes: 0
- revision-row token changes: 0
- editor-session rewrites: 0
- transcript, timeline, placement, audio, history, or authority byte changes: 0

The history artifact remained exactly `5fd59f66...43ccb`, with the same three entries, base, head, undo stack, registry revision, and timestamp. No history investigation or repair occurred.

## Evidence package and stop state

The ACL-restricted package at `D:\nursery\cp10-retest-20260819-1128` contains:

- baseline, pre-open, and post-open production captures;
- normalized Florida state records and SHA comparisons;
- baseline and post-open downloads of all seven revision artifacts;
- registry/hash/byte receipts and parsed identity summaries;
- browser DOM, console log, and viewport screenshot evidence;
- the local read-only download helper (no credentials embedded).

CP-10 reopen-quiescence acceptance is complete. The browser was left untouched after evidence capture. No history work or subsequent checkpoint was started or authorized.
