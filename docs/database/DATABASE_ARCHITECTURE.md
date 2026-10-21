# Forge Database Architecture

This document explains why Forge has two database installation lineages and one shared future. Operational commands belong in [DATABASE_OPERATIONS.md](DATABASE_OPERATIONS.md). The mandatory contributor rules are in the repository [AGENTS.md](../../AGENTS.md).

## Lineage model

Forge recognizes exactly three version domains:

| Symbol | Contract | Versions | Purpose |
| --- | --- | --- | --- |
| H | `historical-v1` | through `20261020171522` | Immutable 414-file upgrade and audit record for existing installations. |
| B1 | `baseline-v1` | `20261021000000`–`20261021235959` | Immutable fresh-install epoch. The current baseline migration is `20261021020814`. |
| T | shared forward tail | `20261022000000` and later | The only source of all future migrations, stored in `supabase/migrations`. |

H and B1 are mutually exclusive roots. A database never switches lineages. Both advance through byte-identical T migrations. A fresh database is assembled from B1 plus T; an existing hosted project retains its already-recorded H history and receives only T after its approved pending historical migrations.

The machine-readable authority is [lineage-contract.json](baseline/v1-gate2/lineage-contract.json). The frozen H hashes are in [historical-migrations.sha256.json](baseline/v1-gate1/historical-migrations.sha256.json). The B1 migration and workdir marker live under [database/canonical-baseline-v1](../../database/canonical-baseline-v1).

## Lineage marker

`forge_meta.database_lineage` is a private, singleton database-local marker. The B1 baseline creates `baseline-v1`; the first T migration, `20261022000000_establish_database_lineage.sql`, qualifies the exact 414-version H history before creating `historical-v1`.

The marker records both frozen contract hashes and the version boundaries. It is owned by `postgres`, has forced RLS, and grants no schema or relation access to `PUBLIC`, `anon`, `authenticated`, or `service_role`. Marker creation, revocation, validation, and insertion are transactional. An existing ambiguous `forge_meta` schema, unknown history, mixed roots, incompatible marker, or unexpected application-role access aborts the migration.

The marker is an enforcement aid, not permission to rewrite `supabase_migrations.schema_migrations`. Forge never fabricates, repairs, or directly edits migration history.

## Immutable roots and shared future

The 414 H files, their preserved Slice A originals, the B1 migration, and the Gate 3B fingerprints are frozen evidence. The two specifically approved historical Slice A amendments are documented artifacts; they are not precedent for more amendments.

Future schema changes use one new migration in `supabase/migrations` at version `20261022000000` or later. The B1 assembler copies those files into disposable workdirs and verifies their hashes against the historical root. Creating parallel tail directories or lineage-specific versions would reintroduce divergent database behavior and is prohibited.

Supabase CLI `2.84.2` is part of the contract. Package resolution, CI setup, workdir assembly, validation, catalog capture, and certification all reject a different CLI version.

## Baseline contents and reference data

B1 reproduces the approved post-Slice-A structural and security contract: extensions, schemas, relations, sequences, functions, triggers, indexes, ownership, RLS, policies, ACLs, revocations, default privileges, and deterministic prerequisites.

Its only application rows are the seven owner-approved Quench records: three destination scopes and four immutable capability revisions. The exact records, sources, and dependencies are linked by the [baseline manifest](baseline/v1-gate3/canonical-baseline-v1.manifest.json) to the [reference-data allowlist](baseline/v1-gate2/proposed-reference-data.allowlist.json). The source filename retains its Gate 2 “proposed” name, but the seven-row hash was approved and incorporated into the immutable B1 manifest. All customer, transaction, balance, credential, activation, external-account, and operator-state rows are excluded.

## Financially inactive installation

A fresh installation contains the financial schema and safeguards but no commercial activation. Missing price publication, environment activation, funding, reservation authority, credentials, or provider configuration denies paid execution before a provider or Stripe mutation. A signup-created zero compatibility balance is not credit authority.

The complete empty-state contract is [FINANCIAL_INACTIVE_CONTRACT.md](baseline/v1-gate2/FINANCIAL_INACTIVE_CONTRACT.md). Test and Live retain one application path and may differ only through external configuration. B1 does not create a second financial implementation.

## Security and authority boundaries

- The `tongs` schema remains the persisted-state SSOT. B1 does not move or redesign application authority.
- Data API exposure is separate from row authorization. Exposed relations require explicit relation/sequence/function grants plus RLS and exact policies; no migration may depend on historical automatic grants.
- Views retain their approved invoker/ACL contract. Privileged functions retain explicit owner, `search_path`, execution revocations, and grants.
- Security-sensitive creation is transactional so an object cannot become visible before its complete security contract exists.
- Existing production-effective behavior is the parity target. Gate 4 neither broadens access nor implements future privilege hardening.
- Hosted schema mutation and every production write require explicit owner authorization after certification evidence review.

## Catalog contract and environmental normalization

The approved application catalog contains 15,901 normalized entries. Its certification contract SHA-256 is `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`; the source-controlled fingerprint artifact is [canonical-application-catalog-fingerprint.json](baseline/v1-gate3/canonical-application-catalog-fingerprint.json).

Strict equality applies to every catalog and security entry except one explicit environmental compatibility rule: existing hosted infrastructure records `wrappers` 0.5.6, while the Supabase CLI 2.84.2 disposable PostgreSQL image provides compatible 0.5.7. [wrappers-extension-compatibility.json](baseline/v1-gate3/wrappers-extension-compatibility.json) records the evidence and rejects every unlisted version or extension difference. This exception does not authorize a hosted extension upgrade.

## Existing production and fresh installation paths

Existing hosted projects remain H databases. They must never receive B1, replay H, or have history synthesized. Read-only preflight currently proves that the observed hosted history is a chronological H prefix and that normal CLI discovery selects the pending Slice A migrations followed by T.

New local, CI, and preview databases are disposable B1 databases. They are assembled outside the repository root, then started, reset, tested, typed, and destroyed through lineage-aware scripts. The historical root is an audit/upgrade workdir, never a bootstrap source.

## Certification limit

Fresh B1 plus T certification and read-only H preflight are implemented. Genuine H upgrade execution is not yet certified. Schema-equivalent B1 testing and a hosted dry-run must not be described as genuine upgrade proof.

The remaining candidate is an owner-authorized, data-less Supabase dashboard branch or restoration that demonstrably inherits the hosted migration history without customer or financial data. Current preflight evidence predicts that dashboard replay will fail at the backdated September credit-economy migration before a branch becomes usable. Until a supported mechanism is proven, hosted application of Slice A and T remains blocked. See [HISTORICAL_UPGRADE_CERTIFICATION.md](baseline/v1-gate4/HISTORICAL_UPGRADE_CERTIFICATION.md) and [DASHBOARD_BRANCH_PREFLIGHT.md](baseline/v1-gate4/DASHBOARD_BRANCH_PREFLIGHT.md).

## Relationship to Slice B

Slice B is the separately approved future default-privilege hardening effort for `public` and `tongs`. Gate 4 preserves existing effective ACL and RLS behavior. B1 reproducibility, the `wrappers` normalization, and the lineage marker do not authorize Slice B changes or reinterpret current grants as the desired long-term security design.
