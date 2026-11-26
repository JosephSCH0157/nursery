# PR #88 final local recording refinements

Status: Draft candidate evidence and retest procedure; not production evidence.
Baseline: `2ea86cf4c07cbf9947bcc92d590c54b9b58deeb2`.
Date: November 26, 2026 (America/New_York).
PR #92 remains isolated. Do not merge or deploy without owner approval.

## Owner-reported hardware results at the baseline

These findings were supplied by the owner in this task. The agent has not
independently listened to or inspected the physical recording files.

| Acceptance item | Owner result |
| --- | --- |
| Core audio/video capture, playback and quality | Pass |
| Core mapped destination | Pass |
| Core refusal when destination is unmapped | Pass |
| OBS connectivity and Anvil-controlled recording | Pass |
| OBS configured destination | Pass |
| OBS playback and audio/video quality | Pass |
| Unmapped destination warning visibility | Needs refinement |
| OBS Start/Stop confirmation reliability | Needs refinement |
| Tongs cloud persistence | Deferred; HTTP 502 after local OBS file creation |

The earlier acceptance record's hardware-pending statements precede this owner
report. These passes do not establish cloud persistence or acceptance of the new
warning/confirmation behavior; those refinements require focused retesting.

## Root cause and complete lifecycle trace

1. Existing approved-script/capture authorization runs before StartRecord. It
   remains unchanged.
2. The authenticated client already registers RecordStateChanged. Ordinary output
   events are included in the protocol's default subscriptions; a missing
   subscription was not established as the cause.
3. The baseline confirmation code ignored those events. After the StartRecord ACK
   it made exactly one GetRecordStatus call and threw if the output was not yet
   active. An early or delayed terminal event could not rescue the result. A
   captured browser warning at 16:41:08 UTC on November 26 identifies this exact
   rejection. The physical take's complete packet timing was not retained.
4. StopRecord supplies a saved outputPath, but the baseline also demanded a
   subsequent status RPC. A stale active response or failed RPC could reject an
   already completed recording. The stopped event's path was ignored. These Stop
   defects were established by source analysis and deterministic reproduction;
   no physical Stop packet trace is claimed.
5. The registry promoted captureMayBeActive uncertainty into recording=true,
   leaving active indicators after unsuccessful confirmation. Stop ownership now
   survives uncertainty while confirmed recording remains false.
6. Tongs import is invoked after local Stop, so downstream HTTP 502 cannot explain
   the earlier Start race. Import invocation is now deferred through a separate
   promise even if a caller throws synchronously. Cloud errors have their own
   message and cannot reject a locally successful Stop. Existing file access,
   authority and canonical completion operations are unchanged.

Before implementation, all four new event/saved-path reproductions failed against
the baseline (five prior cases passed). The corrected cases pass, with additional
coverage for polling fallback, STARTING versus STARTED, genuine failures, missing
confirmation, uncertainty without an active claim, and downstream Tongs 502.

Protocol authority: [OBS WebSocket 5.x requests](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md#record-requests)
and [RecordStateChanged](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md#recordstatechanged).

## Refinement behavior and validation

The persistent Core warning appears beside primary controls and in Recording
Settings. It explains the missing folder or permission and opens the existing
Hearth/Forge storage settings in another tab, preserving any current take.
Directory notifications, cross-tab mount changes and focus/visibility return
refresh readiness. Start is disabled while the existing requirement is unmet;
the capture path retains its independent hard gate. OBS is exempt. No new
destination preference, Downloads fallback or persistence authority is introduced.

OBS observes before sending commands, buffers events before ACK, and confirms
Start from terminal event or bounded polling evidence. A successful Stop response
with its saved path is sufficient; a stopped event supplies the path if omitted
from the response. Real command failures and missing confirmation remain visible.
Local success and cloud pending/deferred/failed/completed messages are separate.
Cloud feedback is tagged with its take's outputPath to avoid relabeling a newer
local take. No Storage reconciliation, billing, infrastructure, schema/migration,
entitlement or production configuration changes are part of this candidate.

Private evidence is in `.git/forge-anvil-refinements-20261126/`. Final automated
results and exact candidate are recorded on PR #88. Synthetic browser tests use
fake devices with real encoding, local file I/O and playback; they are separate
from the owner's physical hardware findings and the new candidate's retest.

Observed local results: 172 affected tests passed in 25 suites; 15 OBS protocol
cases passed, including the four reproductions that failed at the baseline;
nine recorder smoke checks and 19 existing Tongs authority/media tests passed.
Type checking, build, asset checks, cycle checks and Chromium application smoke
passed. Lint passed with zero errors and 14 existing warnings. Chromium also
verified unmapped blocking, recovery after mapping, separate Tongs-502 feedback,
and a real synthetic 1920x1080 WebM with one audio and one video track and
advancing playback. Visual QA checked that the warning stays compact and visible
within the primary-controls viewport. CI and owner retesting are recorded
separately on the PR; none of these automated results repeats physical acceptance.

## Focused owner retest

Use the isolated localhost origin and an owner-authorized approved-script
workpiece. Preserve recording files and pending retry data; do not reload an
unsaved take.

1. Select Core and remove the folder mapping through the existing Hearth/Forge
   settings. Confirm a prominent persistent warning explains the fix and Start
   is blocked. No Downloads substitute should be offered.
2. Map/grant the folder, return to Anvil without reloading, and confirm readiness
   recovers. Revoke permission and verify blocking returns. Reopen Recording
   Settings and check its warning matches the main controls.
3. Leave the Core folder unmapped and select OBS. Confirm the Core warning/gate
   does not apply. Arm without recording, then test manual Start/Stop with
   Auto-record off and automatic pre-roll/live/Stop. Repeat several short takes
   to exercise event/ACK timing and check Anvil agrees with OBS.
4. After Stop, verify the actual local path and playable audio/video. If Tongs
   fails, local success must remain visible with a separate cloud failure or
   deferred message. A new local take must remain usable.
5. Test a real OBS failure/disconnect: actionable error, no alternate recorder,
   no active claim without confirmation. If Start is uncertain, check OBS and
   use Stop before another take.
6. Recheck Core capture/playback in the mapped folder. Record these refinement
   results separately from the deferred cloud stage. PR #88 remains draft.
