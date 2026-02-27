# Tongs v1.0 - Canonical Manifest

Release baseline: **Forge v1.2.0 Fire Burning** (`forge-v1.2.0`).

## Purpose

Tongs is the canonical storage and registry layer for Forge.
It normalizes mount decisions, enforces role-based storage policy, and provides calendar/session primitives used across tools.

## Responsibilities

- Define canonical mount target resolution (`local` vs `tongs_cloud`) by role policy.
- Normalize and validate workspace mount registries.
- Provide typed accessors/contracts for Tongs-backed records (including calendar events and workspace metadata).
- Act as single source of truth for storage decisioning contracts consumed by Nursery and tool apps.

## Non-goals

- Tongs does not own editorial workflow decisions.
- Tongs does not execute recording, editing, publishing, or analytics actions.

## Canonical reference

If behavior conflicts with this file, update this manifest first and then align implementation/docs.
