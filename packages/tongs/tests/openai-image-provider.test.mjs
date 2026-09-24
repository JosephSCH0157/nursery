import test from "node:test";
import assert from "node:assert/strict";
import {
  ImageProviderRequestError,
  OpenAiImageProvider,
  buildOpenAiImageGenerationRequestBody,
  buildImageReferenceInstruction,
  extractOpenAiImageUsage,
  hashOpenAiImageGenerationRequestBody,
  serializeOpenAiImageGenerationRequestBody,
} from "../dist/providers/image-provider.js";

test("canonical no-reference image request has deterministic exact bytes and hash", async () => {
  const body = buildOpenAiImageGenerationRequestBody({
    prompt: "Title-agnostic gasoline base artwork",
    model: "gpt-image-2-2026-04-21",
    size: "1536x1024",
    quality: "high",
  });
  const serialized = serializeOpenAiImageGenerationRequestBody(body);
  assert.equal(serialized, '{"model":"gpt-image-2-2026-04-21","prompt":"Title-agnostic gasoline base artwork","size":"1536x1024","quality":"high","output_format":"png"}');
  assert.equal(await hashOpenAiImageGenerationRequestBody(body), "73b759bde48225c63b7ce1329239b7d0f4bd610c84389c64efb2bf850d39bde0");
  assert.deepEqual(Object.keys(body), ["model", "prompt", "size", "quality", "output_format"]);
  assert.equal("image" in body || "images" in body, false);
});

test("Timeline Image request is one exact n=2 body and parses exactly two outputs", async (t) => {
  const prompt = `Create a realistic metaphorical scene showing Gasoline pump and nozzle, World map, Oil tanker: The pump is visually linked to the tanker and world map by a continuous maritime supply route.

Set it in A cinematic editorial environment blending a clean gas-station foreground with a dark global shipping-map backdrop. Gasoline at a local pump is supplied through an interconnected global market and maritime trade network.

Keep the mood Connected, strategic, quietly consequential. A gasoline pump and nozzle dominate the foreground, with a luminous world map behind them. A single oil tanker and glowing sea route connect distant production and distribution points across the map.

Include Gasoline pump nozzle and fuel-grade display, World map spanning the background, Oil tanker on a highlighted maritime route, Glowing route line linking major coastlines.

Avoid A crowd of people or identifiable drivers, Charts, price numbers, or regional gasoline comparisons, Multiple gas stations or competing brands, Unrelated cargo ships, oil rigs, or refinery close-ups.

Style: cinematic_realism.`;
  const body = buildOpenAiImageGenerationRequestBody({ prompt, model: "gpt-image-2-2026-04-21", size: "1536x1024", quality: "high", imageCount: 2 });
  const serialized = serializeOpenAiImageGenerationRequestBody(body);
  assert.equal(new TextEncoder().encode(serialized).byteLength, 1212);
  assert.equal(await hashOpenAiImageGenerationRequestBody(body), "fafcec85a1aa05835afd27debfce641941fd0acba438f192c88a21b7735740b8");
  assert.deepEqual(Object.keys(body), ["model", "prompt", "size", "quality", "output_format", "n"]);
  const calls=[];const originalFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=originalFetch;});
  globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({id:"img-two",data:[{b64_json:"AQID"},{b64_json:"BAUG"}]}),{status:200,headers:{"x-request-id":"req-two"}});};
  const outputs=await new OpenAiImageProvider("test-key").generateImages({prompt,model:"gpt-image-2-2026-04-21",size:"1536x1024",quality:"high",imageCount:2,deadlineMs:180000});
  assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].init.body).n,2);assert.equal(outputs.length,2);
  assert.deepEqual(outputs.map((output)=>output.bytesBase64),["AQID","BAUG"]);
});

test("OpenAiImageProvider submits one explicit pinned GPT Image 2 request and preserves usage evidence", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      id: "img-response-1",
      created: 1,
      model: "gpt-image-2-2026-04-21",
      data: [{ b64_json: "AQID", revised_prompt: "Canonical revised prompt" }],
      usage: {
        input_tokens: 120,
        input_tokens_details: { text_tokens: 120, cached_text_tokens: 20 },
        output_tokens: 5488,
        total_tokens: 5608,
      },
    }), { status: 200, headers: { "x-request-id": "req-image-1" } });
  };

  const result = await new OpenAiImageProvider("test-key").generateImage({
    prompt: "A specific documentary scene",
    size: "1536x1024",
    quality: "high",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/images/generations");
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body, {
    model: "gpt-image-2-2026-04-21",
    prompt: "A specific documentary scene",
    size: "1536x1024",
    quality: "high",
    output_format: "png",
  });
  assert.equal(result.providerRequestId, "req-image-1");
  assert.equal(result.providerResponseId, "img-response-1");
  assert.equal(result.usage.textInputTokens, 100);
  assert.equal(result.usage.cachedTextInputTokens, 20);
  assert.equal(result.usage.imageOutputTokens, 5488);
  assert.equal(result.responseEvidence.data[0].b64_json, "AQID");
});

test("OpenAiImageProvider classifies a complete validation response as definitive", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: "Unsupported size" } }), {
      status: 400,
      headers: { "x-request-id": "req-rejected" },
    });
  };
  await assert.rejects(
    () => new OpenAiImageProvider("test-key").generateImage({ prompt: "x", size: "1536x1024", quality: "high" }),
    (error) => error instanceof ImageProviderRequestError
      && error.delivery === "definitive_response"
      && error.status === 400
      && error.providerRequestId === "req-rejected",
  );
  assert.equal(calls, 1);
});

test("OpenAiImageProvider uses one verified reference image through the edit endpoint", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "img-edit-1", data: [{ b64_json: "AQID" }], usage: {
      input_tokens: 12, input_tokens_details: { text_tokens: 8, image_tokens: 4 }, output_tokens: 10, total_tokens: 22,
    } }), { status: 200 });
  };
  const result = await new OpenAiImageProvider("test-key").generateImage({
    prompt: "A documentary thumbnail", size: "1536x1024", quality: "high",
    referenceImage: { bytesBase64: "AQID", mimeType: "image/png", purpose: "subject" },
  });
  assert.equal(calls[0].url, "https://api.openai.com/v1/images/edits");
  assert.ok(calls[0].init.body instanceof FormData);
  assert.equal(calls[0].init.body.has("input_fidelity"), false, "the pinned GPT Image 2 model rejects input_fidelity");
  assert.equal(calls[0].init.body.get("reference_purpose"), null);
  assert.ok(calls[0].init.body.get("image") instanceof Blob);
  const submittedPrompt = String(calls[0].init.body.get("prompt"));
  assert.match(submittedPrompt, /authoritative identity reference/);
  assert.match(submittedPrompt, /livery, logos, decals, written markings/);
  assert.match(submittedPrompt, /Do not remove, replace, simplify, genericize/);
  assert.equal(result.responseEvidence.operation, "edit");
  assert.equal(result.responseEvidence.reference_purpose, "subject");
  assert.equal(result.responseEvidence.reference_contract_version, "forge-image-reference-v2");
});

test("reference purposes have distinct factual contracts", () => {
  const subject = buildImageReferenceInstruction("subject");
  const composition = buildImageReferenceInstruction("composition");
  const style = buildImageReferenceInstruction("style");
  assert.match(subject, /factual identity/);
  assert.match(subject, /county or agency identifiers/);
  assert.match(composition, /framing, camera angle/);
  assert.match(composition, /Do not treat the depicted subject/);
  assert.match(style, /lighting, palette, texture/);
  assert.match(style, /Do not copy its specific subject identity/);
  assert.notEqual(subject, composition);
  assert.notEqual(composition, style);
});

test("OpenAiImageProvider classifies a lost create response as ambiguous and never retries", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new TypeError("socket closed after transmission");
  };
  await assert.rejects(
    () => new OpenAiImageProvider("test-key").generateImage({ prompt: "x", size: "1024x1024", quality: "high" }),
    (error) => error instanceof ImageProviderRequestError && error.delivery === "ambiguous_transport",
  );
  assert.equal(calls, 1);
});

test("extractOpenAiImageUsage separates cached subsets from non-cached component quantities", () => {
  const usage = extractOpenAiImageUsage({ usage: {
    input_tokens: 150,
    input_tokens_details: { text_tokens: 100, image_tokens: 50, cached_text_tokens: 25, cached_image_tokens: 10 },
    output_tokens: 200,
    total_tokens: 350,
  } });
  assert.equal(usage.textInputTokens, 75);
  assert.equal(usage.cachedTextInputTokens, 25);
  assert.equal(usage.imageInputTokens, 40);
  assert.equal(usage.cachedImageInputTokens, 10);
});
