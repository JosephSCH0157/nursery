# Forge canonical baseline v1 — Gate 1

Status: design and evidence only. This directory does not contain an executable baseline, migration, seed, or deployment command.

Gate 1 freezes the historical source boundary at commit `716c4f54d759202ebc00315c5d16fb93f66d64c1`, classifies every production `public` and `tongs` table conservatively, and defines fail-closed routing for the approved two-lineage architecture. It does not authorize baseline generation, financial activation, a hosted write, or Slice A integration.

## Evidence artifacts

- `historical-migrations.sha256.json`: all 414 historical migration paths and SHA-256 digests in CLI discovery order. The two approved historical amendments and their byte-preserved originals are identified separately.
- `data-bearing-table-inventory.csv`: the 18 production `public` tables and 491 production `tongs` tables observed by a read-only catalog query on 2026-10-20. Classification is intentionally table-wide and conservative; mixed-use tables receive the more restrictive class.
- `baseline-reference-data.allowlist.json`: the proposed machine-readable zero-record allowlist.
- `REFERENCE_DATA_CONTRACT.md`: zero-row initial allowlist, exclusions, financial inactive-state contract, and the approval needed before any records can enter a baseline.
- `LINEAGE_ROUTING.md`: migration discovery, versioning, CI/deployment entrypoints, and fail-closed lineage markers.
- `HOSTED_UPGRADE_CAPSULE.md`: disposable, schema-only upgrade certification design.
- `POST_SLICE_A_CONTRACT.md`: the exact contract boundary both lineages must reproduce.
- `DECISIONS_AND_BLOCKERS.md`: owner choices and hard stops before Gate 2.
- `scripts/verify-historical-migration-manifest.ps1`: read-only local hash verifier. It never connects to a database or invokes Supabase.

## Gate result

The historical manifest is complete and locally reproducible. The proposed baseline record allowlist is deliberately empty. That is the only record-level decision supported by current evidence without copying operator, customer, activation, or financial state. Structural schema and security remain in scope for the later baseline; rows do not become baseline reference data merely because an old migration inserted them.

Inventory totals are 439 customer/financial/operational tables, 33 environment/operator tables, 18 immutable-economic-contract tables, and 19 unknown tables requiring owner review. No table currently qualifies for deterministic application reference rows. These are conservative table-level classifications; all 509 tables have baseline disposition `EXCLUDE`.

The running local database was not reset: it had 409 applied versions and was used only as corroborating catalog evidence. The production relation names were read through a catalog-only query; no row contents were selected and no production statement mutated state.
