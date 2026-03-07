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

`apps/quench` currently holds the module documentation and architecture baseline.

Runtime scaffolding and adapters can be added on top of this contract.
