# Hammer history epochs — HE-4 production deployment receipt

Verification date: 2026-08-20 UTC

Project: `wtvdjndyxegudufrompx` (`JosephSCH0157's Project`, `us-east-1`, PostgreSQL `17.6.1.054`)

Deployment baseline HEAD: `9a7b14fbd56979fbc5711b183b53b31bb841a31f`

Result: **PASS — the two approved migrations were deployed; immediate metadata verification and ledger reconciliation passed**

## Authorized and applied scope

The approved command was:

```text
supabase db push --linked --include-all
```

It applied exactly, in order:

```text
20260819130000_tongs_hammer_history_epochs.sql
20260819140000_tongs_hammer_history_epoch_heads.sql
```

The source hashes matched the approval and recovery package:

| Version | SHA-256 |
| --- | --- |
| `20260819130000` | `451ab7715e700378ba705db50b6889a26bd075310208c7707252490135ac5700` |
| `20260819140000` | `1b6561f6fe1cc7654b91e403062ad3010b0f04bbe4d5db07153368047c6cb988` |

No application was deployed. No Hammer route, writer, commit/readback RPC, artifact endpoint, Florida workpiece, or Anvil workpiece was invoked.

## Mandatory ledger reconciliation

The authoritative counting rule is one physical row per `version` in `supabase_migrations.schema_migrations`. The current production result is:

| Measurement | Result |
| --- | ---: |
| Physical ledger rows | 187 |
| Distinct versions | 187 |
| Duplicate versions | 0 |
| Repository `.sql` migration files | 187 |
| Repository distinct SQL versions | 187 |
| Remote versions missing locally | 0 |
| Local SQL versions missing remotely | 0 |

The four specifically required versions each occur exactly once:

| Version | Count |
| --- | ---: |
| `20260811135000` | 1 |
| `20260819120000` | 1 |
| `20260819130000` | 1 |
| `20260819140000` | 1 |

The ordered ledger ends with:

```text
20260810130000
20260811120000
20260811130000
20260811135000
20260811140000
20260811150000
20260811160000
20260811170000
20260811173000
20260811180000
20260811190000
20260811200000
20260812143000
20260812150000
20260812153000
20260812190000
20260816190000
20260819120000
20260819130000
20260819140000
```

The complete ordered list and raw CLI output are retained in the external evidence package below.

### Count correction

The ledger discrepancy was two documentation/counting errors, not a missing row, overwritten version, or database defect:

1. The CP-6/CP-7 receipt reported 184 remote versions before its two-file deployment and 186 afterward. At its recorded repository commit, `c2502e7a7b3fc1c974963bafd3779d6e567652dc`, Git contains 185 SQL migration files. The receipt's totals included the ignored non-SQL file `PROD_DEPLOY_2026-03-03.md`, producing a consistent `+1`. The corrected CP-6/CP-7 physical-ledger transition is **183 → 185**.
2. The first HE-4 post-deployment report stated **184 → 186**. Its parser accepted only 14-digit versions and omitted the legitimate legacy ledger version `20260207`. The corrected HE-4 physical-ledger transition is **185 → 187**.

This correction agrees with the HE-4 approval preflight and HE-4A recovery capture: both directly established 185 distinct remote versions before this deployment, with only `20260819130000` and `20260819140000` absent. Deployment added those two versions exactly once.

## External evidence

Read-only ledger evidence is stored outside the repository at:

```text
D:\nursery-backups\wtvdjndyxegudufrompx-he4-ledger-reconciliation-20260820T162942Z
```

| File | SHA-256 |
| --- | --- |
| `supabase-migration-list-linked.raw.txt` | `13e560be9d6d247ba39b2ec7a9f6b54c97077630f629f0be9da8c3fee050eaaf` |
| `supabase-migrations-data.sql` | `aaf622e568847ed4138a139dfc689db57558876fe75a075b041f4ba6861f6f8a` |
| `ledger-analysis.json` | `5b0561526079bb44c7e7a44d59ca8d95f84ed5d9cc11c71dcae105daf23db313` |

`supabase-migration-list-linked.raw.txt` is the unmodified `supabase migration list --linked` output. `supabase-migrations-data.sql` is a read-only dump of `supabase_migrations`; `ledger-analysis.json` records the physical, distinct, duplicate, ordered, required-version, and local/remote set comparisons.

## Immediate metadata verification

The deployed contract matches the HE-4/HE-4A reviewed contract:

- the four epoch/head authority and transition tables exist;
- all four tables have RLS enabled and the approved authenticated workspace-viewer SELECT policies;
- all four tables contain zero rows;
- the expected 79 constraints and 21 total indexes are installed;
- commit RPCs are owned by `postgres`, are `SECURITY DEFINER`, and lock `search_path` to `pg_catalog, tongs`;
- readback RPCs remain security-invoker with the same locked search path;
- public execution is revoked and authenticated/service-role execution matches the approved contract;
- authenticated table access is read-only; no direct authenticated insert, update, or delete grant was introduced.

The post-deployment data dump compared every pre-existing Tongs table to the HE-4A recovery capture:

- 182 pre-existing Tongs tables compared;
- 173,262 rows compared;
- zero row-count, column-list, or deterministic content-hash differences;
- four new tables present with zero rows;
- all nine `recording_revisions` history-pointer projections were byte-identical, including microsecond `updated_at` tokens;
- the pointer snapshot SHA-256 remained `965eca49f8475cc56af459c3e97c374f6bd80cfdb96851190a6a43d7ccfa62cd`.

Therefore no existing history pointer or application-owned row changed during deployment. No epoch, head, transition, registry row, or artifact was created.

## Repository boundary

The pre-existing modification to `apps/nursery/public/forge-nav.json` remained excluded and untouched. This receipt is the only file authorized for the HE-4 receipt commit.
