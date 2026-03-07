# Quench

Distribution and release engine for Podcaster's Forge.

## Overview

Quench is the final execution layer in the Forge pipeline.

It takes completed exports and finalized metadata from Tongs, then publishes those assets to external platforms and RSS feeds.

Quench is intentionally non-creative. It does not write scripts, edit media, or generate assets.

## Forge Pipeline Context

Bar Stock -> Hearth -> Anvil -> Hammer -> Tongs -> Quench -> Ledger

- Tongs owns canonical release metadata and publish history.
- Hammer provides finalized exports.
- Quench executes distribution.
- Ledger consumes release outputs and downstream performance later.

## Status

- Status: v1 design drafted
- Canonical manifest: [`../../docs/QUENCH_MANIFEST.md`](../../docs/QUENCH_MANIFEST.md)
- Technical architecture: [`./QUENCH_TECHNICAL_ARCHITECTURE.md`](./QUENCH_TECHNICAL_ARCHITECTURE.md)

## Scope of this scaffold

This package is contract-first. It establishes the types and adapter boundaries Quench will build around without pretending the platform integrations are live.

Current scaffold includes:

- release packet and platform option types
- deterministic readiness checks
- asset resolver interface plus a static dev resolver
- adapter contract shared by platform implementations
- stubbed RSS adapter
- stubbed YouTube adapter

## Initial Scope

- release packet resolution from Tongs
- readiness validation
- multi-platform publish orchestration
- RSS generation and update
- receipt persistence back to Tongs

## Non-Goals

- creative AI assistance
- thumbnail generation
- editing workflows
- canonical asset storage

## Local Development

`apps/quench` currently holds the module documentation, typed scaffold, and architecture baseline.

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

Runtime scaffolding and adapters can be added on top of this contract.

## Design Rule

Quench must not fake persistence or publishing. If a path is not implemented, adapters must say so explicitly rather than simulating success in live mode.
