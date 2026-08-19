# Hammer editorial authority CP-10 Florida reopen acceptance

## Decision

CP-10 failed its no-write acceptance gate on 2026-08-19. The revision-owned authority artifact was found and canonical persistence opened successfully without the missing-authority or transitional-recovery banner, but the ordinary read-only reopen unexpectedly initiated autosave. That autosave rewrote revision artifacts and advanced the authority tuple from revision 1 to revision 2. No retry, recovery, manual save, edit, or repair was performed after the failure was detected.

## Authorized scope and execution

- Production project: `wtvdjndyxegudufrompx`
- Workspace: `494c2ae5-9037-4208-b898-fab4898ab430`
- Workpiece: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`
- Sealed recording: `6c5b0d00-f775-4611-ac67-284dd9ae7d39`
- Active revision: `f642b5d9-cec2-4656-804e-49bb33bc0cb5`
- Repository HEAD before this record: `eda3d60ca779b44f211e0dd9ce187cce4e44a221`
- Open count: exactly one
- Route: normal authenticated workspace home → Hammer Project Library → Florida Oranges
- No direct editor URL was entered.

The user-protected `apps/nursery/public/forge-nav.json` modification was preserved and excluded from this commit.

## Pre-open baseline

At `2026-08-19T09:01:15.742Z`, authenticated read-only database and Storage reads established:

- episode, sealed recording, and active revision identities matched CP-8/CP-9;
- revision row token: `2026-08-19 08:38:06.030311+00`;
- authority tuple: path `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/editorial-authority.v1.json`, fingerprint `6d6c4a4d3ca2ae9a792326d6d3bc011076d07aefc31f03e78bff4c0cbc025d35`, revision `1`;
- authority registry row: 751 bytes, registry revision 1, `updated_at` `2026-08-19 08:38:04.196909+00`;
- transcript: 137 segments, SHA-256 `005e41d5a16c4ed813324a50589243f8257dd664b04dc440d7b078d690c078ef`;
- timeline: v2 revision 3, 30 assets, 30 clips, one lane, SHA-256 `36779b5c15475679354050e8a2aaf0f1cea89b3ea2159c2b60c9c5c65b212a1a`;
- placements: 30 rows, SHA-256 `ec26a26fbc0be12e90581dad49b8d225c6d5e223cfa81a3da9a8375aac4eb4e6`;
- history: three entries, base `hammer-state:beaa7731`, head `entry:4bb8bdbc-1412-413d-ab90-d777b45d5ea9`, SHA-256 `5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb`;
- editor session and audio artifacts matched their CP-8/CP-9 hashes and registry tokens.

All seven advertised revision artifacts were downloaded and matched their registry byte counts and hashes before the open.

## Browser acceptance evidence

The single Florida selection navigated to the authorized editor route and loaded the editor without repeated navigation or reload.

Positive authority evidence:

- Florida Oranges and the expected workspace loaded;
- no `canonical editorial authority missing` banner appeared;
- no transitional-recovery banner appeared;
- the editor presented the 137-segment transcript and canonical recording playback identity;
- the UI reported 30 visual placements with three uncertainty flags;
- the authority-backed canonical editor loaded rather than the transcript-only transitional fallback.

Browser evidence is stored outside the repository at `D:\nursery\cp10-florida-acceptance-20260819` as `browser-editor.png`, `browser-dom.txt`, and `browser-logs.json`.

## Deferred history result

During initial hydration the editor displayed:

`History verification failed (history_current_head_mismatch). Canonical history was not installed.`

No recovery control or `Reload latest` action was used. The warning later disappeared from the rendered banner area without interaction, but the Edit History region still showed `0 undo / 0 redo` and `No edits recorded yet`. The production history artifact itself remained byte-identical with the same three entries and head. This deferred history failure was observed and not repaired.

## No-write gate failure

The post-open read-only snapshot was not equal to the baseline. The revision authority tuple changed to:

- path: unchanged canonical path;
- fingerprint: `4a233d406b37abab0d9fb7ae708464aacc03cba6a188af96211669b6bde2a7bc`;
- authority revision: `2`;
- revision row token: `2026-08-19 09:02:23.26494+00`.

The authority artifact remained 751 bytes, but its graph `updated_at` changed from `2026-08-15T23:04:36.397Z` to `2026-08-19T09:02:08.374Z`. Its registry row advanced from revision 1 to revision 2 at `2026-08-19 09:02:21.504185+00`.

Additional automatic persistence occurred:

- editor session changed from 1,521 bytes / `57d106...` to 1,477 bytes / `dbb55e...`; `last_opened_at`, selected segment, and selected overlay changed;
- visual timeline changed from 81,774 bytes / `36779b...` to 81,728 bytes / `b25949...`; its structural v2 revision/assets/clips/lanes remained 3/30/30/1, while `selected_clip_id` became null and `debug_origin` changed from `legacy_migration` to `canonical_load`;
- audio, transcript, and placement payload hashes remained identical, but each registry row was rewritten and its registry revision/timestamp advanced by two;
- history bytes, hash, registry revision, and registry timestamp remained unchanged.

The episode row, sealed recording row/media identity, active revision identity, transcript payload, placement payload, history payload, and timeline structural counts were preserved. Nevertheless, the artifact rewrites and pointer increment directly violate CP-10 acceptance requirements.

## Stop conditions honored

After detecting the mutation:

- browser interaction stopped;
- no reload, recovery, manual save, edit, or second open occurred;
- no transcript, timeline, placement, visual, audio, history, packaging, or session control was clicked;
- no repair or rollback was attempted;
- no history diagnosis or subsequent checkpoint began.

## Evidence and next state

The ACL-restricted evidence directory `D:\nursery\cp10-florida-acceptance-20260819` contains baseline/post database captures, normalized state records, verified artifact downloads, browser evidence, and `comparison.json`.

CP-10 is not accepted. The canonical-authority reader seam worked, but read-only reopen is not mutation-free and therefore requires a separately authorized diagnosis before any further Florida open or correction. No history repair or later checkpoint is authorized.
