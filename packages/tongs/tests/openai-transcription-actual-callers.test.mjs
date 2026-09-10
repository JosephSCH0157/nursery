import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Hearth speech action obtains customer acceptance and reaches coordination before OpenAI", () => {
  const client = source("apps/hearth/src/lib/hearth-chat-api.ts");
  const server = source("apps/nursery/server/hearth/create-hearth-ai-handler.ts");
  assert.match(client, /requestCustomerSpendingAcceptance\(quote\)/);
  assert.match(client, /spending_acceptance/);
  assert.match(server, /routeCode: "hearth\.speech_transcription"/);
  assert.ok(server.indexOf("coordinateOpenAiTranscription") < server.lastIndexOf('https://api.openai.com/v1/audio/transcriptions'));
  assert.match(server, /persist_openai_transcription_result/);
});

test("Anvil chunk action binds the source revision and has no enforced retry/transcode fallback", () => {
  const client = source("apps/anvil/src/speech/engines/whisper-bridge.ts");
  const server = source("apps/nursery/server/anvil/create-anvil-whisper-handler.ts");
  assert.match(client, /source_asset_revision/);
  assert.match(client, /requestCustomerSpendingAcceptance\(quote\)/);
  assert.match(server, /routeCode: "anvil\.realtime_transcription"/);
  assert.match(server, /maximumDurationSeconds: Number\.isFinite\(durationMs\)/);
  assert.match(server, /This ASR provider has no active coordinated cost policy/);
  assert.match(server, /persist_openai_transcription_result/);
});

test("Hammer interactive prep blocks unpriced transcode and persists before settlement", () => {
  const client = source("apps/hammer/src/prep/hammerPrepApi.ts");
  const server = source("apps/nursery/scripts/mw-hammer-prep.ts");
  assert.match(client, /requestCustomerSpendingAcceptance\(quote\)/);
  assert.match(server, /supporting_cost_not_authorized/);
  assert.match(server, /routeCode: "hammer\.transcript_prep"/);
  assert.match(server, /persist_openai_transcription_result/);
  assert.match(server, /OpenAI transcription submission outcome is uncertain/);
});

test("Hammer background prep and regeneration bind accepted authority into the job and gate the runner", () => {
  const client = source("apps/hammer/src/editor/hammerWorkpieceJobsApi.ts");
  const creation = source("packages/tongs/src/workpiece-commit-api.ts");
  const runner = source("apps/nursery/server/tongs/workpiece-job-runner.ts");
  assert.match(client, /requestCustomerSpendingAcceptance\(quote\)/);
  assert.match(creation, /transcription_authority/);
  assert.match(creation, /resolveOrdinaryOpenAiTextFunding/);
  assert.match(runner, /transcription_source_authority_mismatch/);
  assert.ok(runner.indexOf("authorize_openai_text_provider_attempt_with_aggregate") < runner.indexOf("openAiResult = await runOpenAiTranscription"));
  assert.match(runner, /transcriptionMode !== "enforce"/);
  assert.match(runner, /mark_submission_unknown/);
  assert.match(runner, /customer_charge_micros: 0/);
});

test("audio rollout is separate and inactive by default", async () => {
  const previous = process.env.FORGE_OPENAI_TRANSCRIPTION_EXECUTION_MODE;
  delete process.env.FORGE_OPENAI_TRANSCRIPTION_EXECUTION_MODE;
  const boundary = await import("../dist/providers/openai-transcription-paid-boundary.js");
  assert.equal(boundary.configuredOpenAiTranscriptionMode(), "inactive");
  if (previous == null) delete process.env.FORGE_OPENAI_TRANSCRIPTION_EXECUTION_MODE;
  else process.env.FORGE_OPENAI_TRANSCRIPTION_EXECUTION_MODE = previous;
});
