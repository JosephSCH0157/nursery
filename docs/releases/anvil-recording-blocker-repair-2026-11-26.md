# PR #88 local recording blocker repair

Status: successor candidate evidence, November 26, 2026 (America/New_York).
Baseline: `c139014006c2dc1b73c2cd93ada781728a5f5cf1`.
Exact successor, final check results and CI links are recorded on PR #88.

## Acceptance boundary

The owner accepted physical Core/OBS recording quality, playback, destinations,
warning/confirmation refinements and recording controls at the baseline. Those
results remain recorded. The successor changes local Stop completion and media
ownership/readiness; focused physical retesting is required for this new head.
Cloud Storage activation and OBS file-ingestion acceptance remain deferred.

## Three corrections

1. Core's required mapped local file close now completes the local capture
   lifecycle. Existing artifact verification and cloud commit/completion run
   separately, after local finalization. An unresponsive cloud request cannot
   retain the recording busy lock or prevent another local take. Cloud status
   stays pending until evidence arrives; local success never fabricates canonical
   completion. Failed local writes immediately expose the existing explicit
   retry, retain bytes and block another take until recovery. A successful retry
   remains successful if a later cloud response fails. Deliberate cloud-only
   configuration retains its existing canonical requirements; no local receipt
   is invented when no local copy exists.
2. Arm tracks the API and actual mic/camera stream it acquired. Shared cleanup
   methods are called only while that acquisition is still current. Otherwise
   cleanup stops only its captured old tracks, preserving a replacement stream
   acquired by another consumer. The same rule applies to failure cleanup.
3. Core readiness uses current microphone/camera state independently of cleanup
   ownership. Closed devices cannot restore an armed snapshot after Stop. Mic
   state and camera settings notifications also refresh idle readiness. Camera
   readiness checks live video tracks and permits explicit reacquisition after
   an ended stream.

Background work retains its take's capture authority, strategy, track diagnostics
and audio-failure snapshot. A new take invalidates older status presentation and
automatic decision dialogs, without fabricating or bypassing cloud results.
Canonical authorization, approved-script checks, keep/discard authority, local
destination mapping, retry protection and OBS confirmation remain unchanged.
Transcript persistence remains disabled as before; no ASR lifecycle or scroll
engine behavior is changed.

## Regression evidence

Four assertions failed at the baseline across the focused reproduction: Core
Stop/next take, replacement acquisitions, closed microphone and closed camera.
The corrected tests include registry busy ownership, partial-arm failure cleanup,
synchronized toolbar/Settings readiness, late cloud feedback and local retry.
Device fixtures now model live/ended streams rather than treating a historical
ownership flag as device readiness.

Isolated Chromium uses real fake-device audio/video encoding, browser-local file
finalization and playback. It verifies two more local takes and Stop completions
while cloud promises never settle, with three local files and no browser download.
The separate controls fixture retains the visible OBS pill, manual/automatic
controls and zero browser media acquisition for OBS. These are synthetic checks,
not new physical acceptance or hosted Storage certification.

Private evidence: `.git/forge-anvil-blockers-20261126/`. No PR #92 changes,
migrations, hosted operations, billing changes, Storage activation, merge or
deployment are part of this repair. The independent review of the baseline is
retained separately; its findings are not erased by this successor.

## Focused owner retest

Preserve any unsaved take before using the new localhost candidate and the
existing owner-authorized approved-script workpiece.

1. With a valid mapped Core folder, record playable audio/video. Stop must finish
   after local finalization and leave Start usable independently of a failed or
   pending cloud save. Test a second local take. The automated fixture covers
   a truly never-settling request; do not bypass capture authorization to simulate
   that condition manually.
2. Arm Core, then have the existing speech/microphone controls acquire a
   replacement stream. Disarm Recording must preserve that consumer's current
   mic. Repeat with an explicitly replaced camera acquisition. Confirm owned
   resources still release when no replacement occurred.
3. Arm and record, close/release a required device, then Stop. Toolbar and Settings
   must show disarmed/needs-attention rather than armed. Explicit Arm must check
   and acquire the required live devices again.
4. If a local write fails, keep Anvil open, relink through Hearth/Forge Settings
   and use the explicit retry. Verify new capture is blocked before recovery and
   a later cloud failure does not undo the successful local save.
5. Recheck OBS Arm/Disarm without browser camera/mic acquisition, manual Start/Stop
   with Auto-record off, automatic pre-roll/live/Stop, configured OBS output,
   playback and separate local/cloud messages. Recheck the Core unmapped warning,
   mapping recovery and the visible authenticated OBS connection pill.

Keep PR #88 draft. A release decision requires successor CI and owner acceptance;
neither prior acceptance nor this document authorizes merge or deployment.
