# forge-ffmpeg

This service is a narrow FFmpeg runtime seam for deterministic media transformations used by Forge.

## Routes

### `GET /health`

Liveness check.

Response:

```json
{
  "ok": true,
  "service": "forge-ffmpeg",
  "timestamp": "2026-04-02T00:00:00.000Z",
  "limits": {
    "max_input_bytes": 67108864,
    "ffmpeg_timeout_ms": 120000
  },
  "routes": {
    "health": "/health",
    "ffmpeg_version": "/ffmpeg/version",
    "transcode_wav": "/transcode/wav"
  }
}
```

### `GET /ffmpeg/version`

Proves the runtime can invoke `ffmpeg`.

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

- maximum request size defaults to `64 MiB`
- ffmpeg timeout defaults to `120000 ms`
- Nursery client retries one transient failure by default for `408`, `429`, `502`, `503`, and `504`
- empty request bodies return `400`
- oversized request bodies return `413`
- ffmpeg failures return JSON with a message and captured `stderr` when available

## Local Run

```powershell
cd forge-ffmpeg
node server.mjs
```

Service listens on port `8080` by default.
