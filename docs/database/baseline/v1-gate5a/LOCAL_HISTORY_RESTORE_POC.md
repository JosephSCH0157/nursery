# Gate 5A local synthetic history-restore proof of concept

Date: 2026-10-21
Branch: `codex/supabase-public-slice-a`
Starting commit: `c81b280bd359883f50809055fe077613dfe13582`
Supabase CLI: `2.84.2`

## Scope and conclusion

This gate tested only synthetic migration-history metadata in a new disposable local database. It did not read or export hosted history, export a production schema, apply a hosted migration, or contact a hosted database for a write.

The mechanics are proven locally: a transactionally restored, six-column, 411-version synthetic history is recognized by Supabase CLI 2.84.2 as a historical prefix, produces the exact four expected pending migrations, and is rejected when corrupted, incomplete, or extended with an unknown version.

This is not authentic historical-upgrade certification. No independently executable pre-Slice-A schema fixture exists yet, so the optional A1/A2/A3/marker execution was deliberately not run.

## Safety preflight

- The frozen manifest verified all 414 files through `20261020171522`; manifest SHA-256: `66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40`.
- The immutable B1 migration SHA-256 remained `73d2779c406b9428e7fdf189ab7ad084671cf1d03908041dbbe855816556c62e`.
- The existing Nursery project was identified by Docker label `com.supabase.cli.project=nursery`, database container `supabase_db_nursery`, and its existing named volumes. Their identities were captured before and after every run.
- Each test selected a random `forge-gate5a-*` project ID, unused nine-port block, task-labeled internal Docker network, and exact temporary path under the operating-system temp directory.
- The teardown inventory was created before Docker resources were created. Cleanup used only the generated project, network, volume, container, and validated temp path identities. No broad Docker prune, all-project stop, or root reset was used.
- The child process removed Supabase hosted credentials, database URLs, service keys, Stripe secrets, OpenAI keys, and Runway keys from its environment before starting the disposable stack.

The final run used:

- project `forge-gate5a-f03870642b1d`;
- port block `60343` through `60351`;
- internal network `forge-gate5a-net-f03870642b1d`;
- temporary root `C:\Users\Iam11\AppData\Local\Temp\forge-gate5a-history-f03870642b1d`.

All four identities were absent after teardown.

## Synthetic history contract and results

The test generated one deterministic synthetic record for each of the first 411 source-controlled manifest versions. Each record populated all six hosted metadata columns:

1. `version`
2. `statements`
3. `name`
4. `created_by`
5. `idempotency_key`
6. `rollback`

The records were inserted inside one transaction into a pristine local `supabase_migrations.schema_migrations` contract. No `migration repair`, `--include-all`, or undocumented history command was used.

Results:

| Check | Result |
| --- | --- |
| Synthetic rows | 411 |
| Source all-column SHA-256 | `8415b1505922b3411e1b2d2e0a8058bca75d30e5773bd756afaf0eac75d02c70` |
| Target all-column SHA-256 | `8415b1505922b3411e1b2d2e0a8058bca75d30e5773bd756afaf0eac75d02c70` |
| Transactional restore | Pass |
| Partial write after forced duplicate-key failure | Rejected and rolled back |
| Transactional statement corruption | Detected; rollback restored the original hash |
| Missing middle history record | Rejected as a non-chronological prefix |
| Unknown migration version | Rejected by the lineage guard |
| Supabase migration list | Recognized all 411 restored versions |
| Lineage state | `historical-preflight` |
| CLI dry-run | Exact four-version set and order |

The dry-run discovered:

1. `20261020171517`
2. `20261020171519`
3. `20261020171522`
4. `20261022000000`

## Network isolation finding

Supabase CLI 2.84.2 could not complete local startup when the database was placed directly on an internal Docker network. After normal startup, a database attached only to the internal network was reachable through `docker exec` but not through the CLI's host-side local connection.

The passing design therefore:

1. started the credential-free database on its unique default network;
2. attached the task internal network;
3. disconnected the default network before restoring or hashing history;
4. briefly reattached the default network for CLI migration listing, dry-run, and lineage queries;
5. disconnected it again before teardown.

The final CLI window lasted 10.295 seconds. The database contained no credentials, customer data, financial records, provider configuration, application schema, or callable external-integration functions. Continuous outbound denial and normal host-side CLI access cannot both be claimed with this local networking arrangement.

## Pre-upgrade schema feasibility

The existing evidence makes a future fixture plausible but does not yet provide a certified executable starting point:

- A1/A2/A3 contain the exact production-equivalent public definitions and fail-closed fingerprints.
- The approved canonical fingerprint records 15,901 normalized application catalog entries, with only the `wrappers` 0.5.6/0.5.7 environmental exception.
- B1 was derived from the approved structural capture and contains managed-schema customizations, including the `auth.users` trigger and Storage policies.
- B1 also installs seven Quench records, creates the `baseline-v1` lineage marker, performs baseline-only assertions, and creates `ensure_rls` after those sections.

Applying B1 directly would install post-Slice-A baseline lineage and would not represent a historical starting state. Ad hoc truncation of the B1 SQL would be an unreviewed transformation. The repository does not currently contain a separately hashed schema-only fixture that:

- excludes B1 reference rows and `forge_meta.database_lineage`;
- preserves all required `auth`, Storage, publication, extension, trigger, policy, ACL, owner, and default-privilege definitions;
- proves equality to the approved hosted pre-Slice-A structural/security contract;
- remains financially inactive; and
- can be restored without adding a baseline migration-history version.

Phase 3 is therefore feasible in design but not complete. Because that prerequisite did not pass, Gate 5A did not execute the four pending migrations.

## Cleanup evidence

The test harness stopped only its generated Supabase project with `--no-backup`, removed only its task network and validated temp directory, and confirmed that no task-labeled container, volume, or network remained.

All pre-existing Nursery container and volume identities matched the preflight inventory after the run. Existing unrelated working-tree changes were not staged, reset, or edited.

## Limitations and next step

This gate proves metadata restoration mechanics, CLI discovery, lineage validation, rejection behavior, isolation limits, and teardown. It does not prove that the real hosted 411-row metadata is safe to export or that the real hosted schema will upgrade successfully.

Recommended Gate 5B work, subject to owner approval:

1. define a deterministic, reviewable extraction from the already approved structural evidence into an immutable pre-Slice-A schema-only fixture;
2. exclude reference rows and lineage metadata by an explicit manifest rather than manual line editing;
3. certify its pre-upgrade catalog/security fingerprint before history restoration;
4. repeat this synthetic-history lane with the fixture;
5. apply A1, A2, A3, and the marker through normal CLI ordering;
6. compare the result to the approved post-Slice-A fingerprint and run the shared security/application/financial suites.

Authentic history transfer remains blocked pending the separate owner decision and Supabase Support response.

## Reproduction

From the repository root, with Docker Desktop already running:

```powershell
.\scripts\test-supabase-history-restore-poc.ps1
```

The harness is self-cleaning and returns a JSON result. It must not be modified to accept linked or hosted targets.
