# Forge canonical baseline — Gate 2 evidence

Status: fingerprinting and non-deploying guards implemented. No baseline epoch, hosted write, migration-history change, deployment, or financial activation was performed.

## Catalog contract

The read-only production capture covers the combined post-Slice-A `public` and `tongs` contract. The normalized query is `supabase/tests/catalog/post_slice_a_contract_rows.sql`; it selects catalog metadata only and never selects application rows or sequence state. The capture script hashes canonical definitions in memory and commits only category, identity, and SHA-256.

- Production `public` tables: 18.
- Production `tongs` tables: 491.
- Normalized fingerprint entries: 15,924.
- Query SHA-256: `739fb3589666856501cf9a2c56cc39a3cf486ec2f413223664313a4f11b9e182`.
- Contract SHA-256: `817f42cfe0f57d2961b52a72b58a5273c3cc1e2bf306e3a527e6bc58bdbcbfbe`.
- Fingerprint-file SHA-256: `f13e6cf9429ce7b7be3d0b1df99bfd063ae40aecdeccdf2ed62aeb87bf408e07`.

| Category | Count |
|---|---:|
| columns | 6,582 |
| constraints | 4,934 |
| default ACLs | 9 |
| dependency set | 1 aggregate containing 21,790 normalized edges |
| event triggers | 1 |
| extensions | 8 |
| functions/procedures | 987 |
| indexes | 1,505 |
| policies | 364 |
| relations, views, materialized views, and sequences | 528 |
| roles | 8 |
| role memberships | 14 |
| context schemas | 5 |
| structural sequence definitions | 9 |
| ordinary triggers | 434 |
| non-row composite/domain/enum/array types | 535 |

Definitions include owners, ACLs, RLS state, policies, defaults, identities, generated expressions, constraints, indexes, routine bodies and security attributes, triggers, default privileges, relevant roles/memberships, publications, and dependencies to `public`, `auth`, `storage`, `extensions`, and Tongs. Function bodies are hashed rather than committed. Sequence start/increment/min/max/cache/cycle and ownership are included; current values are excluded.

The linked recapture matched exactly. The existing local 409-version database comparison correctly failed on object count and contract hash. That failure is expected evidence that a stale database cannot pass as post-Slice-A; its earlier pre-aggregation diagnostic count and digest are not contract oracles.

## Verification summary

- Historical static lineage guard: pass for all 414 files and hashes.
- Linked catalog recapture versus committed oracle: pass.
- Stale local catalog versus oracle: expected fail closed.
- Disposable historical lineage: pass.
- Disposable baseline lineage with marker: pass.
- Wrong-lineage selection: rejected.
- Historical-root baseline bootstrap: rejected.
- CLI version: 2.84.2 enforced.
- Targeted financial static tests: 32 passed, 0 failed.
- Full empty-baseline financial behavior: blocked until an executable baseline exists; Gate 2 was explicitly forbidden from generating one.

See `REFERENCE_DATA_DEPENDENCIES.md`, `FINANCIAL_INACTIVE_CONTRACT.md`, and `TOOLING_AND_CAPSULE.md` for decisions and remaining gates.
