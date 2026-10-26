# Gate 5F authentic historical-upgrade certification closeout

Status: **PASSED locally with authentic hosted migration metadata in both default-privilege lanes.**

This document supersedes the execution-status conclusions in `STAGE_A_RESULTS.md`, `ACL_RECONCILIATION_RESULTS.md`, and the Gate 5C/5D preflight reports. Those files and the frozen authentic-history contract remain unchanged as historical evidence. This closeout contains no migration statements, creator metadata, credentials, token fingerprint, owner attestation, raw API response, or encrypted capsule.

## Certified result

- Source branch at execution: `codex/supabase-public-slice-a`.
- Source commit: `87524f872e76f24de631d1cbf58580674c9df2a9`.
- Supabase CLI: exactly `2.84.2`.
- Authentic historical records restored transactionally: 411.
- Normally discovered and locally applied versions:
  - `20261020171517`
  - `20261020171519`
  - `20261020171522`
  - `20261022000000`
- Final migration-history count: 415.
- Final database lineage: `historical-v1`.
- Permissive lane: passed.
- Restrictive lane: passed.
- All seven original-history hashes remained unchanged after the shared tail.
- Normalized catalog entries: 15,901.
- Catalog contract SHA-256: `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`.
- Pre-upgrade and post-upgrade catalog fingerprints matched in both lanes.
- Catalog, function ACL, RLS, cross-user isolation, Data API, Auth, Storage, signup, profiles, workspaces, Anvil profile persistence, display pairing, Quench capability discovery, subscriptions, billing compatibility, financial inactivity, and paid-operation denial checks passed.
- Financial state remained inactive.
- Paid-provider operations: zero.
- No production schema, migration history, application row, hosted configuration, or privilege was modified.
- Existing Nursery resources remained unchanged.
- Task-created databases, containers, networks, volumes, encrypted capsules, attestations, and confidential temporary files were removed after the run.
- The process-scoped token was cleared, the PowerShell process was closed, and the owner revoked the scoped PAT.

## Evidence boundary

The one authorized hosted operation was a read-only migration-metadata export through the dedicated Management API endpoint. The four migrations ran only against disposable local databases. No production customer, financial transaction, balance, credential, Stripe object, provider state, or Storage object was copied into the certification environments.

The result proves that the authentic 411-version history discovers and applies the approved four-migration transition under both tested default-privilege environments. It does not prove behavior over every existing production row, live lock duration, production backup readiness, external GitHub integration state, or the safety of an unapproved hosted deployment.

## Authorization state

The Gate 5F transfer authorization was consumed and is closed. The revoked token must not be reused. This evidence does not authorize another export, a pull request, merge, hosted migration, application deployment, production write, financial activation, or provider operation.
