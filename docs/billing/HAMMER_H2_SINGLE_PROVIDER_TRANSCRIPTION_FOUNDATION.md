# Hammer H2 Single-Provider Transcription Foundation

Status: inactive implementation foundation, 2026-10-28. This document publishes
no customer SKU, creates no provider credential, authorizes no provider request,
and changes no Tongs rollout.

## Certification recommendation

Use AssemblyAI Universal-3.5 Pro as Hammer's first bounded candidate, with the
model explicitly pinned as `universal-3-5-pro` and `speaker_labels: true`.

AssemblyAI's pre-recorded API produces a single transcript containing word-level
timestamps and confidence plus speaker-separated `utterances`, whose words also
carry speaker labels. Universal-3.5 Pro jointly produces transcription and
speaker changes, reducing the number of independent alignment stages Hammer must
trust. The current documented list price is $0.21/hour plus $0.02/hour for
speaker diarization. These public prices are discovery evidence only, not an
approved Forge cost policy.

Deepgram Nova-3 remains a viable fallback candidate. A single `/v1/listen`
request with `model=nova-3`, `utterances=true`, and `diarize_model=v2` returns
utterances and word-level timestamps/speaker numbers. Pin `v2`; do not use
`latest`, because Deepgram documents `latest` as a moving diarizer alias. The
current public pre-recorded monolingual price is $0.0043/minute and diarization
is included. Deepgram requires more normalization because Hammer must validate
and reconstruct stable turns from numeric speaker labels and utterance/word
evidence.

Neither provider promises perfect overlap representation. Silence is represented
by timestamp gaps. Interruptions and short turns require representative audio
certification; AssemblyAI notes that very short contributions may be attributed
to a nearby speaker when there is insufficient speaker audio. Hammer therefore
rejects missing speaker labels, missing words, cross-speaker words inside a turn,
non-monotonic timestamps, and duration/recording mismatches instead of silently
repairing them.

Official references:

- https://www.assemblyai.com/docs/pre-recorded-audio/label-speakers
- https://www.assemblyai.com/blog/universal-3-5-pro-code-switching-contextual-prompting
- https://www.assemblyai.com/pricing/
- https://www.assemblyai.com/docs/faq/how-are-individual-speakers-identified-and-how-does-the-speaker-label-feature-work
- https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded
- https://developers.deepgram.com/docs/diarization
- https://developers.deepgram.com/docs/utterances
- https://developers.deepgram.com/docs/pre-recorded-audio
- https://deepgram.com/pricing

## Implemented inactive boundary

`HammerCanonicalTranscriptV2` binds every transcript to the exact workspace,
workpiece, canonical recording, recording revision, media signature, SHA-256,
byte count, and verified duration. It preserves provider/model/diarizer versions,
provider request identity, response hash, timing evidence, stable Forge speaker
IDs, word timestamps, confidence, and segment-to-word membership.

Provider adapters accept only complete deterministic responses. They do not call
provider APIs. The v2 projection produces Hammer's existing v1 editor segment
and speaker-map shapes without rewriting or pretending to upgrade persisted v1
artifacts.

The financial plan is permanently `inactive`, `publishable: false`, and
`providerExecutionAuthorized: false`. It requires separately reviewed billing
increment/minimum evidence and complete supporting-cost ceilings before it can
calculate the existing 33% cost-plus target and whole-Credit rounding. Its
execution assertion always fails.

## Financial lifecycle required before activation

The eventual customer operation must use `hammer.transcript_prep` through the
existing Tongs quote/reservation/attempt/settlement path:

1. Bind the request fingerprint to canonical media SHA-256, bytes, duration,
   revision, provider, pinned model, diarizer version, and output contract.
2. Produce a fixed customer quote from an approved supplier rate, billing
   increment/minimum, complete supporting-cost ceiling, 33% markup, and
   whole-Credit rounding.
3. Require exact customer acceptance and reserve verified customer funds.
4. Admit one provider attempt only; uncertain submission is not auto-retried.
5. Validate and persist the canonical transcript before settlement.
6. Release or relieve the customer charge on provider, validation, or
   persistence failure while preserving supplier exposure evidence.
7. Reconcile the provider invoice against request identity and billed duration.

Forge-funded customer transcription and BYO accounting are out of scope.

## Evidence still required

Before a paid certification, obtain account-specific written evidence for:

- exact AssemblyAI Universal-3.5 Pro and diarization rates;
- billable duration unit, rounding increment, minimum charge, and multichannel
  multiplier;
- whether accepted-but-failed, canceled, timeout, upload, and polling failures
  are billed;
- invoice/usage fields that bind charge, transcript ID, model, features, audio
  duration, and request time;
- model and diarizer retirement/version-notice terms;
- data retention, deletion, region, model-improvement, and support terms;
- Forge upload/download, normalization, storage, compute, and reconciliation
  ceilings for the largest allowed recording;
- representative cpWER/turn-boundary results for silence, interruptions,
  overlap, short backchannels, noise, and the expected speaker range.
