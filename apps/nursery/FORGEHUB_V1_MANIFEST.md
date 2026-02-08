# ForgeHub v1.0 - Canonical Manifest

Release baseline: **Forge v1.0.0** (`forge-v1.0.0`).

## Purpose

ForgeHub is Nursery's authenticated workspace shell and routing hub.
It is the entrypoint where a signed-in user navigates to Forge tools (`/app/*`) under one session.

## Responsibilities

- Own auth-gated routing under `/app`.
- Preserve shared Supabase session context across tool handoffs.
- Provide navigation surface for Forge tools and settings.
- Host mount points for tool routes, including placeholder shells where a full integration is not yet mounted.

## Non-goals

- ForgeHub does not implement tool-specific business logic.
- ForgeHub does not replace canonical docs for downstream tools.

## Canonical reference

If behavior conflicts with this file, update this manifest first and then align implementation/docs.
