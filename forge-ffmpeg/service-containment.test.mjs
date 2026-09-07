import assert from "node:assert/strict";

const tokens = {
  netlify: "netlify-current-service-token-000000000001",
  netlifyNext: "netlify-next-service-token-0000000000002",
  supabase: "supabase-current-service-token-00000000001",
  worker: "worker-current-service-token-0000000000001",
};

process.env.FORGE_FFMPEG_DISABLE_LISTEN = "1";
process.env.FORGE_FFMPEG_NETLIFY_SERVICE_TOKEN_CURRENT = tokens.netlify;
process.env.FORGE_FFMPEG_NETLIFY_SERVICE_TOKEN_NEXT = tokens.netlifyNext;
process.env.FORGE_FFMPEG_SUPABASE_SERVICE_TOKEN_CURRENT = tokens.supabase;
process.env.FORGE_FFMPEG_WORKER_SERVICE_TOKEN_CURRENT = tokens.worker;
process.env.MAX_TRANSCODE_INPUT_BYTES = "4";
process.env.MAX_POSTER_INPUT_BYTES = "4";

const { server } = await import("./server.mjs");

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Containment test server did not bind.");
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: "forge-ffmpeg" });

  const root = await fetch(`${baseUrl}/`);
  assert.equal(root.status, 404);

  const anonymous = await fetch(`${baseUrl}/transcode/wav`, {
    method: "POST",
    body: new Uint8Array([1]),
  });
  assert.equal(anonymous.status, 401);

  const anonymousPoster = await fetch(`${baseUrl}/derive/poster`, {
    method: "POST",
    body: new Uint8Array([1]),
  });
  assert.equal(anonymousPoster.status, 401);

  const invalid = await fetch(`${baseUrl}/probe/media`, {
    method: "POST",
    headers: { authorization: "Bearer invalid-service-token-00000000000000000" },
    body: new Uint8Array([1]),
  });
  assert.equal(invalid.status, 401);

  const netlify = await fetch(`${baseUrl}/transcode/wav`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.netlify}` },
    body: new Uint8Array(),
  });
  assert.equal(netlify.status, 400);
  assert.equal(netlify.headers.get("x-forge-caller-id"), "netlify");

  const rotated = await fetch(`${baseUrl}/transcode/wav`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.netlifyNext}` },
    body: new Uint8Array(),
  });
  assert.equal(rotated.status, 400);
  assert.equal(rotated.headers.get("x-forge-caller-id"), "netlify");

  const poster = await fetch(`${baseUrl}/derive/poster`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.netlify}` },
    body: new Uint8Array(),
  });
  assert.equal(poster.status, 400);
  assert.equal(poster.headers.get("x-forge-caller-id"), "netlify");

  const supabase = await fetch(`${baseUrl}/probe/media`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.supabase}` },
    body: new Uint8Array(),
  });
  assert.equal(supabase.status, 400);
  assert.equal(supabase.headers.get("x-forge-caller-id"), "supabase");

  const worker = await fetch(`${baseUrl}/transcode/wav`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokens.worker}`,
      "x-forge-caller-id": "netlify",
    },
    body: new Uint8Array([1, 2, 3, 4, 5]),
  });
  assert.equal(worker.status, 413);
  assert.equal(worker.headers.get("x-forge-caller-id"), "worker");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log("forge-ffmpeg service containment tests passed");
