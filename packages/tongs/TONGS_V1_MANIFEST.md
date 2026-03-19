# Tongs v1.0 - Canonical Manifest

Release baseline: **Forge v1.2.0 Fire Burning** (`forge-v1.2.0`).

## Purpose

Tongs is the canonical storage, registry, and workspace coordination layer for Forge.

It normalizes mount decisions, resolves active storage targets, enforces storage policy, and provides the shared calendar/session/workpiece primitives used across Forge tools.

Tongs is the system-of-record for where workspace artifacts live, how they are addressed, and how operational state is coordinated across tools.

## Responsibilities

- Define and resolve canonical storage targets for Forge workspace roots.
- Normalize and validate workspace mount registries.
- Provide typed accessors/contracts for Tongs-backed records, including:
	- workspace metadata
	- calendar events
	- recording sessions
	- workpieces / episodes
	- assets
	- operational presence/state
- Act as single source of truth for storage decisioning contracts consumed by Nursery and downstream Forge tools.
- Support hosted/cloud-backed storage flows where product entitlements and active mount configuration allow them.
- Expose read and write service surfaces used by Forge tools for canonical file registration, event logging, asset registration, and workflow coordination.

## Storage Model

Tongs defines six canonical workspace storage roots:

- `scripts`
- `barstock`
- `assets`
- `projects`
- `recordings`
- `exports`

These are canonical storage roles, not merely folders.

A root's active storage target may resolve to local storage, Tongs-hosted cloud storage, or a mirrored configuration depending on current mount configuration, runtime policy, and product entitlements.

UI and documentation MUST describe these roots in terms of current resolved storage state, and MUST NOT assume legacy local-only behavior where hosted/cloud storage is supported.

## Non-goals

Tongs does not own editorial decisions.
Tongs does not decide creative readiness or publishing strategy.
Tongs does not perform recording, editing, publishing, or analytics work itself.

Tongs coordinates canonical state and storage truth.
Other Forge tools execute domain-specific actions on top of that foundation.

## Canonical reference

If behavior conflicts with this file, update this manifest first and then align implementation/docs.
