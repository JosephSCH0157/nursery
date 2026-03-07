# Quench

Distribution and release skeleton for Podcaster's Forge.

## Scope of this scaffold

This package is contract-first. It establishes the types and adapter boundaries Quench will build around without pretending the platform integrations are live.

Current scaffold includes:

- release packet and platform option types
- deterministic readiness checks
- asset resolver interface plus a static dev resolver
- adapter contract shared by platform implementations
- stubbed RSS adapter
- stubbed YouTube adapter

## Stubbed vs real adapters

`src/adapters/rss/rss.adapter.ts` and `src/adapters/youtube/youtube.adapter.ts` are stubs.

What stubbed means here:

- validation is real enough to exercise Quench control flow
- capability reporting is real enough to drive UI gating
- `publish()` in `stub` mode returns deterministic receipts for shell and queue work
- `publish()` in `live` mode intentionally returns `not_implemented`

What a real adapter must add later:

- server-side auth and connection handling
- payload mapping to provider APIs
- upload and schedule execution
- provider response normalization
- retry semantics tied to persisted receipts in Tongs

## Design rule

Quench must not fake persistence or publishing. If a path is not implemented, adapters must say so explicitly rather than simulating success in live mode.
