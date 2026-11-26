# PR #88 recording controls and readiness

Status: candidate evidence, November 26, 2026 (America/New_York).
Baseline: `bec52333734608e96f8e846ee8e24ef1048dbbc5`.
Exact successor and completed CI runs are recorded on draft PR #88.

## Accepted physical results

The owner confirmed both engines produce good-quality, playable audio/video in
their correct destinations. Core's unmapped-destination protection, prominent
warning and mapping recovery passed. The OBS Start/Stop confirmation refinements
also passed physical testing. Preserve that acceptance; these controls changes
need a separate physical retest. Cloud persistence remains deferred.

## Findings and changes

The header declared an empty `obsChip` with `topbar-secondary-status`, whose CSS
explicitly hides it. The installer populated a label only when creating a new
chip; the pre-existing empty chip had no label for the authoritative binder.
The chip now has structured markup inside `topbarRight`, outside the hidden
secondary-status class. The existing `obs-status-bind` remains the sole connection
renderer. It projects authenticated bridge state through the recorder settings
store; socket-open, selection and arming do not establish connection success.

The Auto-record-off path previously returned after a console message. Pre-roll
could also refuse recording for missing resources without a persistent primary
control explanation. The new `recording-readiness` view shows the current engine,
connection, arming, Auto-record policy, session refusal and command errors next to
the toolbar controls and inside Recording Settings. Errors remain until confirmed
capture succeeds, including across Settings remounts. No notice initiates capture.

Manual Start/Stop are now directly accessible beside Arm and use the same registry
as Settings. They remain independent of Auto-record. Turning Auto-record off
during pre-roll prevents a previously planned automatic start at live. Arming
does not start capture. An uncertain request retains Stop ownership without an
active claim.

The arm controller previously consumed both registry confirmation and legacy
`rec:state`, allowing a separate producer to strand the control in a stale active
state. It now consumes registry confirmation for active capture. OBS selection
does not disable Arm or require browser devices. Toolbar and Settings share its
snapshot; remounted buttons reflect the current state. Engine changes wait for
owned resources to be released and invalidate stale configuration readiness.
Manual capture retains its engine configuration when reconciling Stop.

These findings establish code paths and regression reproductions; no physical
OBS packet trace is claimed for the owner's specific disabled-control observation.

## Validation and limits

Focused regressions cover Core/OBS, Auto-record on/off, explicit arming without
capture, manual Start/Stop, actual live session initiation, preference revocation,
engine transitions, connection states, legacy-event isolation, remounted controls,
persistent refusal messages and the real header markup. Existing destination,
confirmation, authorization and local/cloud separation regressions remain in the
affected test run. Exact counts and final results are recorded on PR #88.

The isolated Chromium controls fixture uses the actual header and stylesheet,
checks the OBS pill's visible viewport geometry, performs synthetic manual and
automatic takes, verifies zero browser media requests for OBS, and checks
persistent failure feedback. It calls no actual OBS server, cloud or paid service.
The separate synthetic Core test still exercises real browser encoding, local
file finalization and playback with fake media devices. Neither replaces physical
hardware retesting. Full application build/browser smoke and CI are separate gates.

Private evidence: `.git/forge-anvil-controls-20261126/`. PR #92's branch, 22 raw
working files, original index and stash list remain preserved independently.
The sole canonical checkout remains the source of the localhost test server.

## Focused physical retest

Preserve any unsaved take before opening the new candidate. Use the existing
owner-authorized approved-script workpiece at the isolated localhost origin.

1. Verify the upper-right OBS pill remains visible and tracks authenticated
   connecting, connected, disconnected and error states. Reopen Settings and
   compare its indicator. Connection alone must not claim capture.
2. Select OBS with Auto-record off. Arm from the toolbar and disarm from Settings;
   repeat in reverse. Neither action should record or turn on browser camera/mic.
3. Arm OBS and start script scrolling with Auto-record off. Verify the persistent
   explanation and no OBS capture. Use toolbar manual Start/Stop; verify OBS state,
   its saved file and playback. Repeat with Settings Start/Stop.
4. Enable Auto-record and test pre-roll/live/Stop. Repeat after turning Auto-record
   off during pre-roll; no automatic capture should start in that case.
5. Disconnect OBS or use a genuine failed request. Verify persistent actionable
   feedback, no false active claim and no alternate engine. For uncertain capture,
   inspect OBS and use Stop before another take.
6. Switch between Core and OBS, including after arming, and verify both control
   surfaces reset appropriately. Recheck mapped Core audio/video and the accepted
   unmapped warning/blocking/recovery behavior. OBS must not inherit Core's folder
   gate. Recheck local/cloud messages remain separate.

Keep PR #88 draft. No merge, deploy, cloud Storage, infrastructure, billing,
database/migration or PR #92 changes are authorized by this candidate.
