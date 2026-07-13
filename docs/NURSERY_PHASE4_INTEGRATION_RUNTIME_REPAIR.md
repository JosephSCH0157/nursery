# Phase 4 — Integration and Runtime Contract Repair

## Baseline classification

All three accepted failures reproduced independently under Node 20.20.0 and
pnpm 10.30.3.

| Test | Classification | Root cause |
| --- | --- | --- |
| `forge-money-path-matrix.test.mts` | Stale fixture plus production runtime-boundary defect | The harness returned an empty generic RPC response instead of the current policy row. The shared policy parser also trusted structurally incomplete `ALLOW` rows. |
| `hammer-transcript-normalization.test.mts` | Genuine production defect | Video normalization produced WAV bytes, but automatic candidate selection still considered the original `video/webm` directly acceptable and submitted it first. |
| `hearth-ai-runtime.test.mts` | Stale assertions plus production contract defect | Pacing cues were incorrectly asserted as mandatory. Separately, rotated same-speaker blocks were merged back beyond the established three-line maximum. |

## AI policy and billing authority

The money-path backend now returns the complete current policy RPC response:
decision, reason, funding source, fallback flags, and effective policy snapshot.
The Tongs policy boundary validates all of those fields before normalizing the
decision. `ALLOW` without a valid funding source is rejected. Missing rows,
malformed rows, RPC unavailability, soft deny, and hard deny all stop before
generation and billing.

The focused matrix proves:

- valid allow reaches generation and creates an acknowledged deduction;
- soft and hard deny return policy denial without generation or billing;
- missing, malformed, and unavailable policy authority fail closed;
- a zero balance returns insufficient funds before generation;
- deduction failure remains visible as `forge_deduction_failed`;
- duplicate action replay uses the same request identity and charges once;
- missing authentication cannot generate, record usage, or deduct credits.

Assertions include cloned controlled response bodies so a failing status names
the stage response rather than reporting only the numeric mismatch.

## Hammer normalized-media proof

Video MIME types are no longer direct-transcription candidates. For a
`video/webm` source, Forge FFmpeg must complete first and return a non-empty WAV;
only those returned bytes are placed in the transcription `FormData`.

The focused test captures the exact upload and proves:

- source: `video/webm`, bytes `fake-video-bytes`;
- FFmpeg result: `audio/wav`, filename `source.wav`, bytes
  `RIFFfake-transcript-wave`;
- uploaded bytes equal the FFmpeg result and differ from the source;
- event order is `ffmpeg` then `transcription`;
- normalization failure, FFmpeg unavailability, and empty output do not invoke
  transcription and never fall back to the original video;
- transcription refusal remains a non-success response with a WAV payload.

Local FFmpeg and ffprobe scratch directories remain owned by their helper
functions and are removed in `finally` blocks. The Forge-service path keeps the
result in memory and does not create a persistent output file.

## Hearth runtime contract

The authoritative recording shape requires valid standalone tags, short spoken
lines, intentional block spacing, and no more than three spoken lines per
speaker block. It recommends sparse natural pacing cues; it does not require a
synthetic cue for every short script.

The stale mandatory-cue assertion was removed. Runtime rotation is now kept
authoritative by preventing the thinning pass from merging adjacent blocks when
the result would exceed the three-line or 45-word limits. The test retains
grounded request context, workspace-scoped episode context, policy resolution,
valid Anvil tags, bounded line lengths, and controlled failure behavior.

## Runtime/export boundary

No new cross-tool export was needed. Readiness contracts continue through the
approved `@forge/contracts` surface. AI policy remains tool-specific Tongs
authority through `@forge/tongs/ai-policy`; it was not moved into the contracts
package. The full production build exercised the changed Tongs policy runtime,
Hearth shaping runtime, and Nursery Hammer middleware.

## Quarantine review

Three small candidate concepts were selectively reused after review: the
current money-path policy response fields, exclusion of video from direct
transcription candidates, and bounded Hearth same-speaker block merging. The
quarantine branch was not merged. Its tests were expanded independently to
cover fail-closed policy states and media failure paths.

## Verification

Passed:

```text
pnpm exec tsx tests/forge-money-path-matrix.test.mts
pnpm exec tsx tests/hammer-transcript-normalization.test.mts
pnpm --filter nursery test:hearth-runtime
pnpm --filter nursery test
pnpm --filter @forge/tongs test
pnpm --filter @nursery/hearth test
pnpm --filter @forge/hammer test
pnpm --filter @forge/contracts test
pnpm preflight:workspace
pnpm typecheck
pnpm build
git diff --check
```

Nursery inventory changed from the three accepted failing files to zero failing
files. Hammer reported 121/121 test files passed. The Tongs policy tests and
full Tongs package suite passed.

`pnpm gate:integration` remains red only in the previously accepted Anvil ASR
cluster: 8 suites and 14 assertions fail while 93 suites and 845 assertions
pass. The observed failures remain in ASR cursor/stall rescue, backend restart
payload shape, visual chairperson, skipped-line proof, script-end/postroll,
terminal watchdog, and commit-motion behavior. No Phase 4 failure appears in
that gate and no Anvil production or test file was changed.

## Scope boundary

No Bar-Stock, Quench readiness, Anvil ASR, browser fixture, Ledger, or Phase 5
lifecycle behavior was modified.
