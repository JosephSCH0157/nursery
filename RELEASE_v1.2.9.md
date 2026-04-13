## Podcaster’s Forge v1.2.9

Date: 2026-04-13  
Tag: `v1.2.9`

### Highlights
- Hearth: B-roll plan retry/selection actions are fully typed again (no more `Episode…` missing-type build failures), and asset selection now normalizes `undefined` → `null` consistently.
- Hearth: B-roll video ingestion now safely passes downloaded bytes into `Blob` across TS 5.6+ typed-array semantics (avoids `SharedArrayBuffer` / `ArrayBufferLike` type mismatches).
- Tongs: AI policy RPC helpers accept any Supabase schema client, unblocking Nursery/Hammer builds when calling `resolve_ai_policy` via the `tongs` schema client.

