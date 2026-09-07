# forge-ffmpeg

This service is a narrow FFmpeg runtime seam for deterministic media transformations used by Forge.

## Routes

### `GET /health`

Liveness check.

Response:

```json
{
  "ok": true,
  "service": "forge-ffmpeg"
}
```

This is the only unauthenticated endpoint. It performs no media work and does not expose route or limit configuration.

## Service authentication

Every compute endpoint requires `Authorization: Bearer <service-token>`. Tokens are distinct per caller and must be at least 32 characters:

- `FORGE_FFMPEG_NETLIFY_SERVICE_TOKEN_CURRENT` / `_NEXT`
- `FORGE_FFMPEG_SUPABASE_SERVICE_TOKEN_CURRENT` / `_NEXT`
- `FORGE_FFMPEG_WORKER_SERVICE_TOKEN_CURRENT` / `_NEXT`

The service accepts current and next tokens during rotation and derives the caller identity from the matched token. It does not trust a caller-supplied identity header. Missing or duplicate token configuration fails closed.

For the first containment rollout, create three unrelated high-entropy tokens, deploy the matching caller headers first while the old Fly service still ignores them, then configure and deploy the protected Fly service. Verify each caller before removing the unauthenticated revision. For later rotation, add each replacement as `_NEXT`, deploy and verify callers with the replacement value, then promote it to `_CURRENT` and remove the old token.

### `GET /ffmpeg/version`

Proves the runtime can invoke `ffmpeg`.

Requires service authentication.

Response:

```json
{
  "ok": true,
  "service": "forge-ffmpeg",
  "ffmpeg": {
    "first_line": "ffmpeg version ...",
    "lines": ["ffmpeg version ..."]
  }
}
```

Failure response:

```json
{
  "ok": false,
  "error": {
    "message": "spawn EPERM",
    "stderr": null
  }
}
```

### `POST /transcode/wav`

Runs one deterministic audio transform:

- request body: raw binary media file
- response body: `audio/wav`
- output format: mono `48000 Hz` PCM WAV

Optional request headers:

- `Content-Type`: source MIME type when known
- `x-file-name`: source filename or extension hint

Required request header:

- `Authorization`: caller-specific service bearer token

Success response:

- status: `200`
- content-type: `audio/wav`
- headers:
  - `x-forge-request-id`
  - `x-forge-output-format: wav`
  - `x-forge-output-sample-rate: 48000`
  - `x-forge-output-channels: 1`

Failure response:

```json
{
  "ok": false,
  "error": {
    "message": "POST /transcode/wav requires a non-empty binary body.",
    "stderr": null
  }
}
```

## Guardrails

- per-route request, output, duration, concurrency, and requests-per-minute limits are enforced before the expensive route handler runs
- transcode and probe request size defaults to `64 MiB`
- background-effect request size defaults to `64 MiB`
- transcode and probe input duration defaults to `4 hours`; background-effect input defaults to `2 hours`
- ffmpeg timeout defaults to `120000 ms`
- Nursery client retries one transient failure by default for `408`, `429`, `502`, `503`, and `504`
- empty request bodies return `400`
- oversized request bodies return `413`
- ffmpeg failures return JSON with a message and captured `stderr` when available
- structured request logs include caller identity, request ID, route, status, byte counts, and elapsed time; tokens are never logged

## Local Run

```powershell
cd forge-ffmpeg
node server.mjs
```

Service listens on port `8080` by default.
## Final background-effect render

`POST /render/background-effect` accepts a bounded JSON body containing `source_base64`, an immutable `plan`, and optional `audio_master_base64` / `replacement_asset_base64`. The plan must carry the pinned fail-closed segmentation authority. The response is the rendered MP4; `x-forge-render-evidence` contains base64url-encoded deterministic evidence. The service never downloads models during a render and deletes request scratch data before responding.

This route requires the worker service token.
