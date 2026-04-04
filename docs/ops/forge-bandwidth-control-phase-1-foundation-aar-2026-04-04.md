# Forge Bandwidth Control v2 — Phase 1 Foundation AAR

Date: 2026-04-04  
Status: Complete (Foundation slice)  
Branch: `codex/hammer-polish`

## Objective

Establish the canonical authority seam for media variant serving and fetch discipline in Hammer + Hearth so bandwidth policy is enforced server-first, not inferred by UI behavior.

## What Landed

1. DB contract for variant lineage and serving policy in `tongs.assets`:
   - `variant_kind`, `source_asset_id`, `width`, `height`, `cache_control`, `variant_version`
2. Canonical resolver contract in Tongs:
   - purpose-driven mapping (`list|preview|export`)
   - non-escalation enforcement
   - deterministic asset identity and canonical variant path shape
3. Server route for client resolution:
   - authenticated + membership-gated variant resolution endpoint
4. Hammer runtime fetch discipline:
   - session memoization + inflight dedupe
   - deterministic identity key usage
   - telemetry warnings on duplicate fetches
5. Hearth runtime fetch discipline:
   - thumbnail/candidate preview caching
   - duplicate fetch telemetry
6. Foundational tests:
   - resolver contract tests
   - route tests
   - Hammer dedupe tests
   - Hammer transform churn coverage

## Why This Matters

This moves variant and bandwidth policy into a single canonical path:

- clients request by purpose
- Tongs resolves variant class
- resolver enforces non-escalation
- UI no longer freelances URL/fetch identity on rerender

Result: this is now enforceable architecture, not best-effort optimization.

## Evidence Snapshot

Passing checks executed during the slice:

- `pnpm --filter @forge/tongs test:commit-api`
- `pnpm --filter @forge/hammer types`
- `pnpm --filter @forge/hammer test:source-desk-media`
- `pnpm --filter @forge/hammer test:source-desk-preview-churn`
- `pnpm --filter @forge/tongs exec node --test tests/asset-variant-resolver.test.mjs`
- `pnpm --filter @nursery/hearth types`

Known unrelated failure observed:

- `pnpm --filter @nursery/hearth test:confidence`
  - existing mocked AI request assertion issue; not part of this variant/fetch slice.

## Open Risks / Follow-Ons

1. Read-through generation/backfill worker is not fully wired yet.
2. Bucket policy hard enforcement (public preview/thumb vs private original) needs completion.
3. Full payload slimming pass for top Hammer/Hearth cold-load routes is still pending.
4. Visibility-based lazy loading rollout is pending.

## Next Execution Order

1. Implement async read-through variant generation/backfill worker.
2. Enforce Supabase bucket discipline in serving/upload paths.
3. Run asset-heavy episode smoke with `FORGE_BANDWIDTH_DEBUG=1`.
4. Finish Hammer/Hearth cold-load query payload slimming and snapshot checks.

## Milestone Call

**Bandwidth Control Phase 1 Foundation is complete.**  
Canonical model, canonical resolver, canonical identity, and observable dedupe behavior are now in place.
