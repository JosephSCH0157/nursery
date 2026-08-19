# Hammer revision editorial authority — CP-6/CP-7 production deployment receipt

Verification date: 2026-08-19 UTC

Project: `wtvdjndyxegudufrompx` (`JosephSCH0157's Project`, `us-east-1`, PostgreSQL `17.6.1.054`)

Verification baseline HEAD: `c2502e7a7b3fc1c974963bafd3779d6e567652dc`

Result: **PASS — CP-6 deployment accepted and CP-7 metadata verification complete; CP-8 unstarted and unauthorized**

## Scope and controls

This receipt verifies a deployment performed before the metadata session began. The verification itself used only Supabase project, migration-ledger, schema-dump, and data-dump reads. It did not invoke the authority RPC, an authority writer, Hammer session open, or any application mutation, and it did not open Florida Oranges or Anvil in Hammer.

The only pre-existing worktree modification was the protected `apps/nursery/public/forge-nav.json`; it was not staged or changed.

## Recovery gate

The accepted scoped recovery certification is stored outside the repository at:

```text
D:\nursery-backups\wtvdjndyxegudufrompx-20260819T043200Z\SCOPED_RECOVERY_CERTIFICATION.md
SHA-256 ADF877D4B6F08F98F14E6E066A83CBE0CDE4EE6FF73096E42FA676B62F37CEC2
```

It proves restore of all 200 `public`/`tongs` application tables and 173,432 rows with zero count differences, plus exact restoration of the pre-deployment authority contract and RPC. It certifies the complete application-owned deployment blast radius, not portable reconstruction of provider-managed Supabase services.

## Migration ledger

Verification began at `2026-08-19T05:21:15.6050490Z`. The linked project was positively identified as `wtvdjndyxegudufrompx`, status `ACTIVE_HEALTHY`.

The pre-deployment ledger captured in the CP-6 package had 184 remote versions. It lacked exactly:

```text
20260811135000_tongs_reference_visual_sequence_policy_clean_init_bridge.sql
20260819120000_tongs_hammer_editorial_authority_terminal_conflict.sql
```

The post-deployment `supabase migration list --linked` showed all 186 repository migrations paired with remote entries. Both authorized versions appeared exactly once, and no other migration changed from absent to present.

| Version | Before | After |
| --- | --- | --- |
| `20260811135000` | absent | present exactly once |
| `20260811140000` | present | present exactly once |
| `20260816190000` | present | present exactly once |
| `20260819120000` | absent | present exactly once |

Approved source hashes remained:

- `20260811135000`: `7547f3de3a04f2484c7d7445221ea22296918527c4a4ca0998fde467c71266f7`
- `20260819120000`: `1b85cd592c9705bf6a374c185e8f208afd73ba85616f31ed8f2881f32c16dd5a`

## Bridge no-op verification

The captured pre- and post-deployment schema dumps each contained exactly one `reference_visual_sequence_sequences_viewer` policy, with exact matching DDL:

```sql
CREATE POLICY "reference_visual_sequence_sequences_viewer"
ON "tongs"."reference_visual_sequence_sequences"
FOR SELECT TO "authenticated"
USING ("tongs"."has_workspace_role"("workspace_id", 'viewer'::"text"));
```

The bridge therefore caused no policy or application-schema change beyond recording its migration-ledger version. This matches its guard because `20260811140000` was already recorded.

## RPC comparison

The post-deployment RPC extraction has SHA-256:

```text
91c6cd2e6f3b5b16d7124bf056aa2ec87edfe039f5a641483fc29295ef576b5f
```

It contains `PT409` and does not contain `40001`. Replacing the single literal `'PT409'` with `'40001'` makes the complete extracted function/owner/ACL text byte-for-byte equal to the captured pre-deployment RPC. Thus the only function-text change is the approved expected-conflict SQLSTATE.

Unchanged contract:

- same nine-argument signature and `jsonb` return;
- owner `postgres`;
- `SECURITY DEFINER`;
- locked `search_path=pg_catalog, tongs`;
- editor membership enforcement;
- lowercase SHA-256 and canonical revision-path validation;
- workspace, workpiece, canonical recording, revision, and active-status predicates;
- exact timestamp, authority revision, and prior-pointer CAS predicates;
- unchanged response fields;
- public revoked; execute granted only to `authenticated` and `service_role`.

## Authority table, RLS, and grants

Every selected pre/post DDL line matched exactly:

- `editorial_authority_path text null`, no default;
- `editorial_authority_fingerprint text null`, no default;
- `editorial_authority_revision bigint not null default 0`;
- nonnegative authority-revision constraint;
- all three column comments;
- RLS enabled on `tongs.recording_revisions`;
- editor delete, editor insert, viewer select, and editor update policy definitions;
- `anon SELECT`, `authenticated SELECT, INSERT, DELETE`, `service_role ALL`.

Authenticated still has no table-level `UPDATE`, so direct revision updates remain denied even though the editor update policy remains defined.

The post-deployment data-dump header exposed all three authority fields on `tongs.recording_revisions`.

## Florida and Anvil no-change proof

The comparison was performed against the quarantined pre-deployment data capture and a post-deployment read-only `tongs` data dump. No Hammer workpiece was opened.

Canonical tuples before and after:

| Workpiece | Revision | Recording | Authority path | Fingerprint | Authority revision | Exact `updated_at` |
| --- | --- | --- | --- | --- | ---: | --- |
| Florida `85d076d6-54e6-4b56-ab60-5eff4c87cdd0` | `f642b5d9-cec2-4656-804e-49bb33bc0cb5` | `6c5b0d00-f775-4611-ac67-284dd9ae7d39` | null | null | 0 | `2026-08-18 15:26:51.680213+00` |
| Anvil `93dacc5a-e9f0-41f8-bc58-0b6ab9b199c2` | `4294915e-fd8a-49e0-ba31-81b8a3ee4bb2` | `ed948692-dd22-46da-b575-9bc0a320ac8b` | null | null | 0 | `2026-08-18 21:37:21.239965+00` |

The deterministic pre/post snapshot files had the identical SHA-256:

```text
cbe0b03ca73b44ca59869dbdf74f7f803681df9e9ff26247ab65e0abc3c20fab
```

This proves every compared pointer-tuple value, identity, status, and concurrency token remained unchanged.

## No authority artifact

- Pre-deployment `tongs` capture: zero `editorial-authority.v1.json` paths.
- Post-deployment `tongs` capture: zero `editorial-authority.v1.json` paths.
- Post-deployment read-only `storage` data dump: zero `editorial-authority.v1.json` objects.

No editorial-authority artifact or registry entry was created.

## Completion boundary

All CP-7 metadata checks passed. CP-6 and CP-7 are complete. CP-8 has not begun and remains unauthorized. This receipt grants no Florida or Anvil access, dry run, artifact write, pointer acknowledgement, writer release, or other application mutation.
