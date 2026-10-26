# Gate 6H Bar Stock archival successor

Gate 6H is a versioned shared-tail successor to the frozen Gate 5F database contract. It does not alter the 414 historical migrations, the B1 baseline, the pre-Slice-A fixture, the 451-file Gate 6B trust anchor, or the recorded Gate 5F authentic result.

## Defect and repair

The certified predecessor had three mutually dependent defects in one lifecycle unit:

1. `trg_barstock_assignments_archive_graduates_sparks` ran `BEFORE` the Project row became archived, so the Spark atomicity trigger rejected Project-driven graduation.
2. `barstock_sparks_status_check` omitted the already-used terminal value `graduated`.
3. `enforce_barstock_project_atomicity_on_sparks()` used `old is not null`, a row-wide null test that could be false when nullable fields existed, so terminal reversal was not reliably rejected.

Migration `20261024164519_barstock_project_archive_atomic_graduation.sql` fails closed on incompatible predecessor definitions, adds only `graduated` to the existing status constraint, corrects the reversal predicate to `tg_op = 'UPDATE'`, and changes the Project archive trigger from `BEFORE` to `AFTER`. The function remains PostgreSQL-invoker, owned by `postgres`, with the same search path and ACL. RLS, policies, relation grants, RPC grants, and financial behavior are unchanged.

An `AFTER` row trigger sees the archived Project row while remaining inside the same SQL statement and transaction. If any contained Spark update fails, PostgreSQL rolls back the Spark updates and the Project update together.

## Versioned evidence

- Gate 5F predecessor: 415 migration rows, 15,901 catalog entries, `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`.
- Gate 6H successor: 416 migration rows, 15,901 catalog entries.
- Production-normalized successor catalog: `6953a105d5f7fbfe2813c5e3349cd5364ba9c273f3dc023f042f86c6e7c9c5d5`.
- Local successor with approved `wrappers` 0.5.7: `dd364abfe6fcdb726148d209431d2476461b040d17cfd1c8bc45e23c8785bb9e`.
- Complete machine-readable contract: [successor-contract.v1.json](successor-contract.v1.json).
- Catalog rows: [successor-catalog-fingerprint.json](successor-catalog-fingerprint.json).

The only catalog changes from Gate 5F are the Bar Stock Spark status constraint, Spark Project-atomicity trigger function, and Project archive trigger. The `wrappers` difference remains the separately approved 0.5.6 hosted versus 0.5.7 local environmental exception.

## Certification

From the repository root with Supabase CLI 2.84.2 and an already-running Docker Desktop:

```powershell
pnpm certify:db:canonical-baseline
pnpm certify:db:gate6h-successor
```

Both commands use task-created disposable databases, permissive and restrictive default-privilege lanes, synthetic application data, and scoped teardown. The historical successor command restores 411 deterministic six-column records, verifies all seven prefix hashes, discovers the exact five pending versions normally, reaches 416 records with `historical-v1`, and verifies the original 411 records unchanged. It makes no hosted request and does not replace the authentic Gate 5F predecessor evidence.

No hosted migration, merge, production write, financial activation, or deployment is authorized by this evidence.
