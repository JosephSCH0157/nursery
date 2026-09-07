import assert from "node:assert/strict";
/* global Headers */
import test from "node:test";
import { BadRequestError } from "@runwayml/sdk";
import { RunwayBrollVideoProvider, RunwayTransportError } from "../dist/providers/runway-broll-video-provider.js";

test("Runway adapter exposes creation response before polling and retrieves only by durable task ID", async () => {
  let creates = 0; let retrieves = 0; let createBody = null;
  const client = {
    textToVideo: { create: async (body, options) => { creates += 1; createBody = body; assert.equal(options.maxRetries, 0); return { id: "task-12345678" }; } },
    tasks: { retrieve: async (id, options) => { retrieves += 1; assert.equal(id, "task-12345678"); assert.equal(options.maxRetries, 0); return { id, status: "SUCCEEDED", createdAt: new Date(0).toISOString(), output: ["https://example.invalid/video.mp4"] }; } },
  };
  const provider = new RunwayBrollVideoProvider("", client);
  const submitted = await provider.submit({ prompt: "A slow documentary tracking shot", model: "gen4.5", durationSeconds: 5, ratio: "1280:720", attemptId: "attempt-1" });
  assert.equal(submitted.taskId, "task-12345678"); assert.equal(creates, 1); assert.equal(retrieves, 0);
  assert.deepEqual(createBody, { model: "gen4.5", promptText: "A slow documentary tracking shot", ratio: "1280:720", duration: 5 });
  const completed = await provider.poll(submitted.taskId);
  assert.equal(completed.state, "completed"); assert.equal(retrieves, 1); assert.equal(creates, 1);
});

test("Runway adapter sends multiple ordered historical references through a reference-capable video model", async () => {
  let body = null;
  const client = {
    textToVideo: { create: async (value) => { body = value; return { id: "task-references" }; } },
    imageToVideo: { create: async () => { throw new Error("multiple references must not use first-frame generation"); } },
    tasks: { retrieve: async () => ({}) },
  };
  const provider = new RunwayBrollVideoProvider("", client);
  await provider.submit({ prompt: "Move from museum display through repair to operation", model: "seedance2", durationSeconds: 5, ratio: "1280:720", attemptId: "attempt-references", referenceImages: [
    { mimeType: "image/jpeg", bytesBase64: "b25l" },
    { mimeType: "image/png", bytesBase64: "dHdv" },
    { mimeType: "image/webp", bytesBase64: "dGhyZWU=" },
  ] });
  assert.equal(body.model, "seedance2");
  assert.deepEqual(body.references, [
    { uri: "data:image/jpeg;base64,b25l" },
    { uri: "data:image/png;base64,dHdv" },
    { uri: "data:image/webp;base64,dGhyZWU=" },
  ]);
});

test("Runway adapter classifies lost creation responses as ambiguous and never retries inside the SDK", async () => {
  let creates = 0;
  const client = { textToVideo: { create: async () => { creates += 1; throw new Error("connection reset"); } }, tasks: { retrieve: async () => { throw new Error("not reached"); } } };
  const provider = new RunwayBrollVideoProvider("", client);
  await assert.rejects(() => provider.submit({ prompt: "A slow documentary tracking shot", model: "gen4.5", durationSeconds: 5, ratio: "1280:720", attemptId: "attempt-2" }), (error) => error instanceof RunwayTransportError && error.ambiguous === true);
  assert.equal(creates, 1);
});

test("Runway adapter rejects overlong canonical prompts before transmission", async () => {
  let creates = 0;
  const client = { textToVideo: { create: async () => { creates += 1; return { id: "never" }; } }, tasks: { retrieve: async () => ({}) } };
  const provider = new RunwayBrollVideoProvider("", client);
  await assert.rejects(() => provider.submit({ prompt: "x".repeat(1001), model: "gen4.5", durationSeconds: 5, ratio: "1280:720", attemptId: "attempt-3" }), (error) => error instanceof RunwayTransportError && error.ambiguous === false);
  assert.equal(creates, 0);
});

test("Runway adapter classifies a complete HTTP 400 as confirmed not created with sanitized evidence", async () => {
  let creates = 0;
  const headers = new Headers({ "x-request-id": "request-400" });
  const client = { textToVideo: { create: async () => { creates += 1; throw new BadRequestError(400, { error: "Validation of body failed", issues: [{ path: ["duration"], message: "Invalid input" }] }, "Validation failed", headers); } }, tasks: { retrieve: async () => { throw new Error("not reached"); } } };
  const provider = new RunwayBrollVideoProvider("", client);
  await assert.rejects(() => provider.submit({ prompt: "A slow documentary tracking shot", model: "gen4.5", durationSeconds: 5, ratio: "1280:720", attemptId: "attempt-400" }), (error) => {
    assert.ok(error instanceof RunwayTransportError); assert.equal(error.ambiguous, false); assert.equal(error.evidence.http_status, 400); assert.equal(error.evidence.provider_request_id, "request-400"); assert.equal(error.evidence.endpoint, "/v1/text_to_video"); assert.deepEqual(error.evidence.validation_issues, [{ path: ["duration"], message: "Invalid input", code: null }]); return true;
  });
  assert.equal(creates, 1);
});
