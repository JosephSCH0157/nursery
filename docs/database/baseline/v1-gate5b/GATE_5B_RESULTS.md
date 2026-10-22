# Gate 5B pre-Slice-A historical schema fixture

Date: 2026-10-21

Status: **local schema fixture and synthetic-history integration passed; authentic hosted-history certification remains blocked**.

No production or existing local database was modified. No hosted migration, production row, raw hosted migration-history record, credential, or operational provider configuration was copied. The only hosted operations were the supported read-only historical preflight and catalog/reference-contract queries.

## Historical starting point

The supported linked preflight confirmed:

- exactly 411 hosted migration versions forming a chronological prefix of the frozen 414-file historical lineage;
- no `forge_meta.database_lineage` marker;
- database state `historical-preflight`;
- the exact pending order `20261020171517`, `20261020171519`, `20261020171522`, and `20261022000000`;
- Supabase CLI exactly `2.84.2`.

The frozen historical manifest remains `66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40`.

## Independent hosted fingerprint

A new read-only catalog capture ran `supabase/tests/catalog/post_slice_a_contract_rows.sql` against the 411-version hosted database. The query selects catalog metadata only. Raw normalized definitions existed only in a temporary CSV, were hashed in memory, and were deleted. The retained evidence contains identities and SHA-256 values only.

The recapture exactly matched the existing production oracle:

- normalized entries: 15,924;
- query SHA-256: `739fb3589666856501cf9a2c56cc39a3cf486ec2f413223664313a4f11b9e182`;
- contract SHA-256: `817f42cfe0f57d2961b52a72b58a5273c3cc1e2bf306e3a527e6bc58bdbcbfbe`;
- fingerprint-file SHA-256: `f13e6cf9429ce7b7be3d0b1df99bfd063ae40aecdeccdf2ed62aeb87bf408e07`.

This proves that the reviewed structural definitions embedded in B1 describe the genuine pre-Slice-A hosted application catalog. Gate 5B does not assume that B1 itself is a historical starting state: the fixture removes B1-only lineage metadata and assertions, and its retained structure is independently checked against this fresh hosted fingerprint.

## Fixture construction

The fixture is `database/historical-pre-slice-a-v1/pre-slice-a-schema.sql`:

- SHA-256: `abf0d6f03dd25dc9d4af3f30bcca8d8be6047045033b399d6ba2918315bc9751`;
- bytes: 5,003,603;
- source B1 SHA-256: `73d2779c406b9428e7fdf189ab7ad084671cf1d03908041dbbe855816556c62e`.

`scripts/build-pre-slice-a-fixture.ps1` performs an anchored deterministic transformation and reproduces the exact fixture hash. It retains approved schema/security definitions, the eight Forge Storage policies, Auth signup trigger, `ensure_rls`, and the approved Quench records. It replaces B1 assertions with pre-upgrade assertions.

It excludes:

- `forge_meta` and the baseline lineage marker;
- migration-history rows;
- B1-only assertions;
- customer/Auth records;
- financial transactions, balances, credits, reservations, settlements, pricing publication, and activation;
- credentials, external accounts, foreign servers, foreign tables, and user mappings;
- state unique to the four pending migration versions.

The machine-readable inclusion/exclusion contract is `pre-slice-a-fixture.manifest.json`.

## Reference data

The read-only hosted check found exact matches for all three approved Quench destination scopes and four immutable capability revisions. The records existed before Slice A and matched their source migrations. Their workspace, connection, and creator fields were null where required.

They contain no credential, customer, financial, provider-account, or automatic publication state. The YouTube and podcast-host scopes are intent-only; the Rumble scope is manual handoff. Every other application table starts empty.

## Sensitive-definition review

The structural contract contains 987 function definitions, including 868 `SECURITY DEFINER` functions. Their complete owners, search paths, execution ACLs, bodies, and dependencies are covered by the catalog hashes and behavior tests.

The source-controlled definitions contain structural columns and parameters for encrypted credentials and tokens, but no credential values. Scanning found:

- no database URLs, JWTs, Supabase keys, Stripe secrets, OpenAI keys, Runway keys, or provider tokens;
- no foreign servers, foreign tables, or user mappings;
- only public URL validation classes for YouTube canonical/embed URLs and OpenAI public pricing documentation.

No raw hosted function bodies were retained during Gate 5B; the committed function definitions come from the previously reviewed structural source whose catalog hashes matched the live read-only capture.

## Disposable certification

Both permissive and restrictive ambient default-privilege lanes passed with CLI 2.84.2.

| Check | Permissive | Restrictive |
| --- | --- | --- |
| Fixture SHA-256 | Pass | Pass |
| Public Slice A catalog parity | Pass | Pass |
| RLS/security behavior | Pass | Pass |
| Signup/profile/workspace bootstrap | Pass | Pass |
| Storage policies and Auth trigger | Pass | Pass |
| Quench discovery boundary | Pass | Pass |
| Financial inactive state | Pass | Pass |
| Migration-history rows | 0 | 0 |
| Lineage marker | Absent | Absent |
| Normalized local catalog entries | 15,901 | 15,901 |
| Normalized local contract | `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f` | Same |
| Environmental differences | `wrappers` 0.5.7 only | `wrappers` 0.5.7 only |
| Cleanup/Nursery preservation | Pass | Pass |

The hosted catalog records `wrappers` 0.5.6 while the pinned local image provides 0.5.7. No other catalog/security difference was accepted.

One initial restrictive run stopped before fixture application because Windows rejected a randomly selected Docker port that was not shown as listening. The harness cleaned every task resource. Port selection was changed to prove actual bindability for the entire nine-port block; the subsequent restrictive run passed.

## Synthetic-history integration rehearsal

The passing integration sequence was:

1. start a new credential-free disposable Supabase database;
2. apply the schema fixture directly, without creating migration history;
3. verify the pre-upgrade catalog, security, empty-state, and financial assertions;
4. transactionally restore 411 deterministic synthetic six-column history rows;
5. identify the database as `historical-preflight`;
6. confirm a normal CLI dry run discovers exactly the four pending versions;
7. run `supabase migration up --local` without `--include-all` or history repair;
8. validate A1/A2/A3 and the historical lineage marker;
9. rerun catalog/security tests and the full normalized catalog comparison.

Results:

- synthetic starting history: 411 rows;
- pending order: exact four-version order;
- post-upgrade history: 415 rows;
- post-upgrade lineage: `historical-v1`;
- post-upgrade normalized entries: 15,901;
- post-upgrade contract: `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`;
- only approved wrappers difference retained;
- task resources destroyed and Nursery unchanged.

This proves the schema fixture and CLI mechanics with synthetic history. It does not prove that authentic hosted six-column history will restore identically or that an actual supported customer-free hosted restoration will behave the same.

## Isolation and teardown

Each run used a random `forge-gate5b-*` project, verified free nine-port block, exact temporary path, task-labeled internal Docker network, and credential-sanitized process environment. The database was detached from its default Docker network while fixture DDL and database tests ran. A temporary credential-free local network window was used only for CLI catalog and migration operations.

After all passing and failing attempts:

- no Gate 5B container, volume, network, or temporary directory remained;
- existing Nursery container and volume identities were unchanged;
- unrelated working-tree changes were not edited or staged;
- no hosted write or billable hosted resource was created.

## Remaining authentic-certification requirements

Authentic historical-upgrade certification still requires separate owner authorization for a supported, customer-free source of the real six-column hosted migration metadata or a provider-supported restoration/branch mechanism. Gate 5B does not authorize history transfer.

Before authentic use, rerun the read-only 411-prefix and catalog preflight, verify every authentic history column hash in protected temporary storage, apply the fixture before restoring history, reject all unexpected versions or schema differences, and preserve the same four-file dry-run and post-upgrade gates. Supabase Support confirmation remains pending.
