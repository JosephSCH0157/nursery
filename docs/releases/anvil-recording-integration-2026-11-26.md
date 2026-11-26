# PR #88 recording integration repair

Later owner-reported hardware passes and the remaining confirmation/warning
refinements are recorded in
[`anvil-recording-refinements-2026-11-26.md`](anvil-recording-refinements-2026-11-26.md).
This earlier record preserves the pre-hardware acceptance window and procedure.

Status: Draft candidate and manual acceptance runbook; not production evidence.
Date: November 26, 2026 (America/New_York).
Baseline: PR #88 `21a8179e987f2b7e0f5d52d8de2facba370a2ccd`.
Release hold: owner review and physical audio/video acceptance remain mandatory.
Do not merge or deploy. Production policy remains the canonical root AGENTS.md.

## Candidate behavior

OBS connection readiness requires SDK identification/authentication and a successful
GetVersion request. Concurrent requests wait for the same result; disarm cancels
stale readiness. The connection controller is the status writer. Header and settings
render the same state, and replacement settings controls rehydrate from live state.

Engine selection reads the recorder settings owner in memory. Cache writers preserve
each other's fields and omit passwords. Manual and automatic commands go through the
session registry; unavailable selected engines raise errors. Core no longer starts
from unqualified session/speech events. Legacy OBS timeout/disconnect paths no longer
start Bridge. OBS pre-roll does not require browser capture devices.

OBS Start confirms GetRecordStatus; Stop confirms inactivity and a local output path.
OBS controls its output directory. The existing importer separately manages authorized
file access and Tongs completion. A path returned by OBS does not prove playability.

Core checks the existing managed destination and permission before capture when a
local copy is configured. The take snapshots that directory. It writes the encoded
file independently of the cloud save, awaits writable close and recorder flush, and
never silently downloads instead. If the directory becomes unavailable, keep Anvil
open, restore permission/linkage through Hearth, and use **Retry local recording save**.
The retry writes only the local file and does not repeat cloud completion. Recovery
bytes are in memory and are lost if the page closes/reloads. A pending retry blocks a
new take so it cannot overwrite the unsaved take's recovery control.

Cloud-only configurations remain cloud-only. No competing Anvil destination setting,
new persistence authority, schema/migration, financial change, hosted configuration,
production operation or PR #92 integration is part of this repair.

## Automated evidence

Private logs are under `.git/forge-anvil-repair-20261126/`. Final command results and
candidate SHA are recorded in the PR update. Run from the canonical checkout:

- `pnpm --filter teleprompter run typecheck`
- `pnpm --filter teleprompter run lint`
- `pnpm --filter teleprompter run check:cycles`
- `pnpm --filter teleprompter run build`
- `pnpm --filter nursery sync:anvil`
- `pnpm --filter teleprompter exec jest --config jest.config.cjs --runInBand tests/recording tests/ui/obs-state-remount.test.ts tests/ui/settings.recording.test.ts tests/ui/recording-arm-control.test.ts tests/ui/nursery-mounts.test.ts`
- `pnpm --filter teleprompter run test:rec-smoke`
- `pnpm --filter teleprompter run test:recording-local-browser`
- `pnpm --filter teleprompter run test:recording-boundary-browser`
- `pnpm --filter teleprompter run smoke:strict`

The synthetic browser recording test uses Chromium fake devices, real MediaRecorder,
a real browser-private filesystem file, and playback with advancing time and one
track of each kind. Cloud and AI interfaces are isolated substitutes. It proves
encoding/local finalization/playback integration, not physical hardware, audible
speech, the owner's OS folder, hosted permissions, or live OBS output-file quality.
Bridge protocol fixtures prove commands/status handling, not a physical OBS recording.

### Observed local verification

- Expanded recording/settings/device/pre-roll/speech-boundary regressions: **176
  passed in 26 suites**. Final review subset: **34 passed in five suites**;
  additional compatibility/controller/routing run: **11 passed in three suites**.
  These runs overlap; their counts must not be added as unique tests.
- OBS bridge contract: **five passed**. Legacy recorder smoke: **nine passed**,
  including rejection of alternate-engine fallback and saved handoff preferences.
- Existing Tongs venue/capture/media authority tests: **19 passed**. No database,
  hosted or financial certification was rerun; those artifacts are unchanged.
- Type check (including build:logic), Anvil build, asset assertions, one-way mirror
  generation and dependency-cycle check passed. Lint passed with **14 existing
  warnings and zero errors**; no warning remains in the changed recording code.
- Isolated Chromium boundary and strict application smoke passed. The synthetic
  Core file was about 80 KB with 1920x1080 video, one audio track, one video track
  and advancing playback time; local close succeeded while cloud save was denied.

These are local automated observations on the repair working tree; the PR binds
its final Git candidate to the retained logs. They are not a production deployment
or completed owner/hardware acceptance.

## Isolated owner manual acceptance

Use only `D:\nursery\nursery`. Coordinate the source transition and all watchers
before switching branches. Preserve PR #92 and evidence in place. Do not create a
clone/worktree or reuse an existing production/customer episode for experiments.
Use an owner-authorized synthetic workspace/workpiece and a legitimately approved
current script. Record the candidate SHA, browser/version/origin, OBS version, device
names, folder paths, and timestamps with timezone. Do not record passwords/tokens.
Use a separate unused localhost port; stop only servers created for this procedure.

1. In Hearth, link the intended local recordings destination through its existing
   settings and grant browser permission at the same origin used for Anvil. Confirm
   the workpiece's approved script is ready. Anvil must not bypass capture authority.
2. In OBS, verify the intended microphone/camera and output folder independently.
   Select OBS in Anvil; enter the existing authenticated WebSocket address/password.
   Check header and settings, then close/reopen and remount settings. They must remain
   enabled/connected. Wrong passwords and OBS shutdown must show failure/disconnection.
3. With Auto-record off, Arm OBS. No browser capture devices should be acquired and
   OBS must remain idle. Disarm/rearm. Manual recording Start must start OBS; Stop
   must stop it. Confirm the returned path matches OBS's configured output folder.
4. Open the resulting OS file outside Anvil. Confirm visible moving video, audible
   speech from the expected microphone, sensible duration and seeking/playback.
   Record path/size/probe output and the human listening result separately.
5. With OBS selected, enable Auto-record and exercise pre-roll: no recording while
   counting down; one OBS recording on live; Stop ends that take. Disable Auto-record
   and confirm session playback alone does not record. Manual recording still works.
6. Disconnect OBS before Start: actionable error, no Core capture. Disconnect during
   capture: accurate connection failure, no alternate recorder/device acquisition.
   Inspect OBS itself before reconnecting/retrying Stop; a disconnected client cannot
   prove whether an external OBS process has stopped recording.
7. Stop the OBS take, select Core, and Arm. Verify microphone/camera readiness without
   recording. Manual Start/Stop with Auto-record off must produce a playable local
   file in the exact Hearth folder, with audible speech and moving video. Repeat
   automatic pre-roll/live/stop. Test audio-only independently if used.
8. Deny/revoke folder access before Start: capture must fail with a relink/permission
   message. Remove access after Start: local failure must be visible, no Downloads
   substitution, encoded bytes retained, and a new take blocked. Restore the Hearth
   link, click Retry, and verify playable bytes in that folder. The cloud operation
   count must not increase as a result of this local-only retry.
9. Record local-file and cloud-completion outcomes separately. Verify canonical cloud
   reload only if legitimately authorized and available; local success does not imply
   that stage passed. Keep failed-file evidence and protect creator media from cleanup.

## Separate cloud dependencies and acceptance hold

The PR's earlier November 13 hosted acceptance reported Storage reconciliation and
recognized-capacity blockers while saving a Hearth draft. That is historical evidence,
not a fresh production-state claim. This task makes no hosted reads/writes or changes
to those safeguards. If a valid approved script/capture authorization cannot be obtained
through existing paths, record manual acceptance as blocked and seek separate owner
authority before changing PR #92, Supabase, entitlements or shared Storage. Never grant
capacity, fabricate authority, bypass upload guards or fake refresh persistence.

Physical OBS and Core acceptance is **pending**, regardless of automated results.
