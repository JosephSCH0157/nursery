# Hammer cross-origin audible playback repair

Status: local implementation; release and production audible acceptance remain open.

## Correction

Hammer's audible preview element now uses `crossOrigin="anonymous"` before its
signed `src` is installed. `HammerAudibleMedia` is shared by the production preview
and the rendered canonical-open regression harness. The signed URL still carries
authorization; this change does not send cross-origin cookies, fetch a complete
Blob, or change the canonical recording/revision/SHA-256 checks.

Previously, a cross-origin element could decode video and advance its clock while
its `MediaElementAudioSourceNode` supplied silence. A running AudioContext and
advancing playhead did not detect this failure. Web Audio requires silence for a
CORS-cross-origin resource: <https://www.w3.org/TR/webaudio/#MediaElementAudioSourceNode-security>.

Cross-origin media errors now produce `cross_origin_media_load_failed` diagnostics
and an on-screen hint to check signed URL expiry, networking, and Storage CORS.
The hint does not claim that the opaque browser MediaError uniquely proves a CORS
failure. Signed URLs and credentials are not added to these diagnostics.

## Real-media regression

`pnpm --filter nursery test:hammer-playback-rendered` passed 2/2 tests. The normal
canonical-open test serves real VP9/Opus WebM from a second local HTTP origin,
retaining byte-range responses and unknown container duration. Its Tongs service
and source-authority receipt are test fixtures, not production reads.

The test observes the actual Studio Rack output with an analyser connected beside
the destination. It measured peak amplitude `0.340034544467926` across 178,176
samples after reload. It asserts nonzero output both before and after reload,
canonical signed selection, zero binary fallback, media/playhead advancement,
running AudioContext, pause/resume, Space, and early/late seeks.

Separate reloads omit CORS authorization or return the wrong allowed origin.
Both fail readiness, remain paused, produce zero measured output, avoid Blob
fallback, and display the access diagnostic. No provider requests are made.

This is local Chromium evidence, not Windows production acceptance or evidence
that Joe heard Brad's recording.

## Live verification limits

A read-only canonical-recording query confirmed Brad's source identity. However,
the enrolled Supabase management read credential and Netlify read credential each
returned HTTP 401 before a signed Storage response could be requested. Actual
Storage `Access-Control-Allow-Origin`, range headers, and audio output remain
unverified. This session has no connected Windows browser capability.

The authenticated repository browser gate prerequisite reports
`SUPABASE_PROJECT_COHERENCE_MISMATCH`; its configured API, stored login, and fixture
manifest could not be validated as one project. No fixture seeding was attempted.

## Release boundary

The implementation began in the canonical checkout on
`64c2962742e4dc7e8c6ca7b033e3d4a72c8b0e5c`. During certification, a separate writer
preserved it and switched to `codex/hammer-verified-local-playback`. Its focused
head is `bb347a163521255ed6c0a3060489ec29a3deaf24` (this CORS repair), above
`51be956570a81761bba4887d664e38903bc80ce8` (transport repair) and remote-main
baseline `1181d4d0ab15d83bf0d776f4d8ab9a5424436b37`. App/package files and lockfile
are byte-identical between the preserved work and this focused branch; the
unrelated database commits were excluded. The existing navigation edit remains
outside the playback commits. Exact-candidate browser and fast checks were
started again after this transition.

After review, use protected Git-to-Netlify release, with every required check
passing and the Ready deployment matching the merge commit. No merge or deployment
is authorized by this report. Production acceptance remains open until Joe can
personally initiate sustained, audible speech in the authenticated Windows session.

Audio-preparation issue #83 is unchanged and separately scoped. No source media,
transcript, financial authority, provider attempt, or production data was changed.
