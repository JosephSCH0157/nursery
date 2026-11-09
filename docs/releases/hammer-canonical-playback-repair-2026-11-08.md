# Hammer Canonical Playback Repair Certification

Status: **Publication-review candidate**

Verified: **2026-11-08 (America/New_York)**

Production baseline: `24c74ced12dc7a16089c1946ebc4c595e4542c27` (PR #81)

The working branch began at PR #81's second parent, `45878cec8cd5e20a158f355a8d7a3c59a98b8a81`. The Hammer source and rendered-playback fixture paths changed by this repair have no baseline difference between that parent and the production merge. No deployment was performed.

## Root causes and focused repair

1. `bindLaunchContextToCanonicalRecording` rebuilt the media reference with the canonical media ID and path, but retained SHA-256 and duration only when the stale launch preview already matched those values. Normal hydration therefore lost canonical source identity before playback-source resolution.
2. An incomplete canonical identity fell through to the generic Source Desk binary loader, which downloaded the complete recording into a Blob. Canonical playback now fails with `hammer_canonical_playback_identity_incomplete` instead; generic, non-canonical assets retain the existing buffered-preview behavior.
3. Readiness treated every non-finite duration as invalid. A decoded WebM with `duration === Infinity` is now accepted only when the selected signed source carries a finite positive duration bound to the same canonical recording, active revision, and SHA-256. A later finite duration remains subject to contradiction checks, and `durationchange` does not replace the source or reset playback.
4. Timeline scrubbing snapped by default to transcript boundaries, so a coarse one-segment transcript could capture a late seek. Boundary snapping is now opt-in. Scrubbing also seeks the actual media elements immediately, including while paused.

The effective verified duration is used for readiness, transport bounds, media synchronization, scrubbing, and end clamping. Media errors, unknown duration without authority, mismatched signed receipts, and finite duration contradictions remain fail-closed.

## Changed files

- `apps/hammer/src/persistence/hammerRecordingRevisionPersistence.ts`
- `apps/hammer/src/editor/hammerCanonicalMediaBinding.ts`
- `apps/hammer/src/editor/hammerCanonicalPlayback.ts`
- `apps/hammer/src/editor/hammerPlaybackReadiness.ts`
- `apps/hammer/src/editor/HammerWorkspaceShell.tsx`
- `apps/hammer/src/editor/HammerWorkspaceShellTimelineDock.tsx`
- `apps/hammer/src/editor/useHammerWorkspaceShellAudioFinishing.ts`
- `apps/hammer/src/editor/useHammerWorkspaceShellPlayback.ts`
- `apps/hammer/src/editor/useHammerWorkspaceShellPreviewRuntime.ts`
- `apps/hammer/src/lib/hammerSourceDeskMediaApi.ts`
- `apps/hammer/tests/hammerCanonicalPlayback.test.ts`
- `apps/hammer/tests/hammerOpenHydration.test.ts`
- `apps/hammer/tests/hammerSourceDeskMediaApi.test.ts`
- `apps/nursery/tests/fixtures/hammerPlaybackRenderedHarness.tsx`
- `apps/nursery/tests/fixtures/hammer-canonical-playback-harness.html`
- `apps/nursery/tests/fixtures/hammerCanonicalPlaybackRenderedHarness.tsx`
- `apps/nursery/tests/hammer-playback-rendered.test.mts`

## Mocked-state certification

- Canonical playback lifecycle bundle: pass.
- Open hydration: 7/7 pass, including restoration of canonical media ID, path, SHA-256, byte size, and `603.848s` duration over a stale preview identity.
- Source Desk media API bundle: pass, including rejection of a signed receipt whose recording, revision, or SHA-256 does not match the request.
- Additional pure-state coverage proves: `Infinity` plus verified authority is playable; `Infinity` without authority is rejected; a finite contradictory duration is rejected; canonical open uses the signed resolver and never calls the binary fallback; incomplete canonical identity performs no fetch.

## Real-media browser certification

The rendered normal-open harness uses the existing playable VP9/Opus WebM fixture with its container Duration element made unknown. This is decoded by real Chromium rather than represented by mocked media state.

Observed results:

- Initial native media duration: `Infinity`; `readyState` became playable with duration source `verified_authority` and no `MediaError`.
- Hydration selected `canonical_signed` with SHA-256 `595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24`.
- Signed endpoint calls: `1`; generic binary fallback calls: `0`.
- Play advanced native `currentTime` and rendered playhead; `AudioContext.state` became `running`.
- Pause, button resume, and Space resume with focus on a non-input element worked.
- Early `0.35s` and late `2.35s` requests remained near their requested media positions (rendered to the transport's tenth-second precision as `0.4s` and `2.4s`) and resumed from those positions.
- Chrome later reported finite native duration `2.521s`; readiness stayed playable and playback was not reset.
- Reload repeated canonical signed resolution and playback with one signed request, zero fallback requests, and a running AudioContext after Play.
- Browser console errors: none.

The checked-in rendered test repeats the same normal-open, pause/resume, Space, seek, contradiction, authority, and reload assertions.

## Automatic audio-polish write behavior

Ordinary saved-transcript reuse and canonical hydration both call `ensureAudioPolish`. A matching `prepared` artifact is reusable; failed artifacts are reusable only for terminal `unsupported_source` or `source_unavailable` codes. The observed route 404 becomes `processing_failed`, which is not reusable.

Consequently, each reopen currently persists a `preparing` audio-polish revision, calls the missing route, and then persists a failed `processing_failed` revision. That is two automatic revision writes per reopen. The failed artifact does not become the playback source: preferred-playback selection returns the raw source with reason `audio_polish_failed`, and only a current `prepared` artifact with an output path can select polished media.

This repeated-write defect is documented but intentionally not repaired here because it is not required for canonical raw playback. It should be handled as a separate audio-polish route/idempotency change.

## Certification limitation

The repository's installed `node_modules` contains WSL-created reparse links that Windows cannot traverse (`EACCES`/unreadable package links). The normal workspace TypeScript and package-script entrypoints could not run from the Windows-native checkout. Windows-native esbuild syntax/bundle checks, the focused Node test bundles, and the real Chromium certification above passed. No user-owned server or Docker process was restarted.

No transcript, source media, Supabase data, financial authority, provider state, or production deployment was changed.
