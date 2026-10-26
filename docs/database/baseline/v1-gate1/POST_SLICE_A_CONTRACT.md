# Post-Slice-A contract boundary

Both lineages must reproduce the same normalized database contract, not the same migration history and not production data.

## Exact source boundary

- Commit: `716c4f54d759202ebc00315c5d16fb93f66d64c1`.
- Historical source: the 414 entries and bytes in `historical-migrations.sha256.json`.
- Approved historical exceptions: only the two amendments recorded in that manifest, with byte-preserved originals under `docs/database/reconciliation/slice-a/original/`.
- Final historical versions: A1 `20261020171517`, A2 `20261020171519`, A3 `20261020171522`.
- Public contract: 18 tables, two security-invoker views, two owned sequences, 15 functions, seven ordinary triggers, and event trigger `ensure_rls`, as enumerated in `docs/database/reconciliation/slice-a/PUBLIC_OBJECT_INVENTORY.md`.
- Public normalized fingerprints: `supabase/tests/public_slice_a_catalog_parity.sql` is the executable oracle for relation DDL/security, functions, triggers, object counts, and sequence ownership.
- Public behavior oracle: `supabase/tests/public_slice_a_security_behavior.sql` plus `scripts/test-public-slice-a-data-api.ps1`.
- Tongs/current schema boundary: every schema, relation, view, materialized view, sequence, type, constraint, index, function/procedure, trigger/event trigger, policy, owner, ACL, default privilege, extension, publication, and storage/auth dependency present in the owner-approved schema-only production capture at this commit.

The baseline must normalize away nondeterministic OIDs, timestamps, physical layout, statistics, and generated internal names while preserving definitions, dependency edges, security attributes, and privileges. Data parity is not required; the reference-data contract controls rows separately.

## Required parity dimensions

1. extensions and versions supported by the pinned local stack;
2. schemas and owners;
3. tables/partitions, columns, identity/sequence ownership, defaults, generated expressions, constraints, and indexes—including intentional duplicates;
4. views/materialized views and security options;
5. routines including body hash, owner, language, volatility, strictness, parallel/leakproof flags, security-definer posture, configuration/search path, and execute ACL;
6. ordinary and event triggers;
7. RLS enable/force state, policies, relation/column/sequence ACLs, and schema/default privileges;
8. auth/storage hooks and dependencies;
9. Data API exposed-schema behavior and grants;
10. the empty initial-data and financially inactive contract.

## Current evidence and blocker

Slice A already provides an exact public oracle. The full post-Slice-A Tongs fingerprint has not yet been captured as a source-controlled, normalized artifact; Gate 1 inventories its 491 production tables but does not claim table names alone are full catalog parity. Baseline generation must stop until a fresh read-only production schema/security capture at the accepted commit is normalized, reviewed for secrets/data, and approved. This is evidence acquisition, not permission to copy production rows.
