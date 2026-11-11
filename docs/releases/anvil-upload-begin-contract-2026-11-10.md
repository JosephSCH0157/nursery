# Anvil/Tongs upload begin contract — local certification

Status: release-candidate evidence; not hosted acceptance or deployment authority.

Baseline: `e1c6694a3ea1c0b0a16dc5099b4aee09f380e52e`, fetched and verified as
`origin/main` before branching. Branch: `codex/anvil-upload-begin-contract-20261110`.
Toolchain: Node 20.20.0, pnpm 10.30.3, existing lockfile.

## Repair

A supplied upload ID no longer means resume-only. After existing capture and
workspace authorization and request validation, begin loads the exact session.
An explicit object-not-found permits conditional creation with `upsert: false`.
An object-exists race reloads and validates the winning session without replacing
its state. Generated upload IDs remain supported.

Resume checks session schema, recording/workspace/capture identity, path, total
size, chunk shape, media type and stored chunk metadata. Finalized replay also
checks the saved commit receipt against that session and the current canonical
file registry's revision, SHA-256, size, media type, bucket and key. A stale or
contradictory receipt is rejected. This does not remove completion's media
readback, hash verification or duration probe.

Permission errors, timeouts, unavailable Storage, malformed session JSON, missing
response data, bucket/tenant errors and contradictory status envelopes fail
closed. Error-message text alone never grants permission to create. Conditional
creation does not add retries. Existing chunk/finalize cleanup remains unchanged.

No Anvil production code, Netlify routing, database schema, financial policy,
hosted configuration or dependency changes are included.

## Local evidence

- Full Tongs suite: 687 passed, including ten new session-contract test groups.
- Anvil recording suite: 14 suites / 106 tests passed, including the released
  raw/serialized request and total-recording admission boundaries.
- Admission preparation and boundary/lifecycle tests: 13 passed.
- Media gate: audio backend, studio-rack FFmpeg plan and ten recorder smoke
  scenarios passed.
- Chromium loopback integration: actual Anvil finished-file import, authenticated
  client, Tongs HTTP handlers/service, chunk assembly, registry commit, SHA-256
  readback and local ffprobe reached the decision-required dialog. No Keep.
- `pnpm gate:fast`: workspace contracts, TypeScript, lint and architecture passed
  (existing warnings only). Explicit scoped lint also passed for the new browser
  harness, applying the Nursery TypeScript rules through stdin because its normal
  file glob does not include `.mts`.
- `pnpm build`: passed across the workspace. Existing bundle budgets passed:
  Hammer integration JavaScript 271,934 / 275,000 bytes; gzip 90,282 / 90,400
  bytes. Hearth total 1,764,316 / 1,800,000 bytes; largest chunk 964,123 /
  1,106,000 bytes. Existing Vite chunk-size warnings remain.
- Final session-contract rerun: 10 passed. `git diff --check`: passed.

An intermediate build rejected checks against fields absent from the persisted
commit receipt. Those checks were removed; upload ID/chunk shape are validated
on the session envelope. The final build and valid finalized-replay test pass.

The synthetic fixture is 480,044 bytes, 30 seconds, mono 8 kHz PCM16 WAV;
SHA-256 `1f9a9a27e445258f17fed9738b0e0b40a2db04a0999438f6eb2b68a3df4037cd`.
The browser asserts capture → begin → chunk → finalize → completion, all HTTP
200, revision 1, exact bytes/hash, 30,000 ms verified duration, two media reads
(assembly and completion verification), chunk cleanup and retained session.
Unexpected non-loopback browser requests are blocked and fail the assertion.

Session tests cover new supplied/generated IDs, matching resume, concurrent
creation and mismatched winners, identity/path/size/chunk/media mismatches,
authorization denial, malformed state, Storage failure envelopes and valid or
contradictory finalized receipts. They are registered in the existing Tongs test
command; Nursery's existing test runner discovers the new browser test.

## Limits

The integration test substitutes the OS picker with a real browser File supplied
by the test. Supabase Auth, database/Storage transport and authority RPC results
use isolated in-memory adapters; Tongs service methods and ffprobe are real.
This is application-path certification, not native-dialog, database-backed,
deployed Netlify, provider concurrency or hosted acceptance certification.
No media was transferred to hosted services and no paid provider was invoked.

Raw local logs are in `/tmp/forge-upload-begin-repair/`. Unrelated navigation,
production-state and Hammer report edits are preserved and excluded from the
commit. Separate release certification and authorization are required before
merge/deployment and another hosted acceptance attempt.
