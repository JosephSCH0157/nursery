# Lineage routing and deployment safety

## Immutable lineages

Let `H` be the 414-file historical manifest ending at `20261020171522`, `B1` the not-yet-generated immutable baseline epoch, and `T` the single shared tail after the baseline cutoff.

- Existing databases: `H + T`.
- Fresh databases: `B1 + T`.
- A database never changes lineage.

The repository root `supabase/migrations` remains the historical upgrade lane. It is not a supported fresh-install input. Baseline sources must live outside every Supabase workdir migration-discovery path. A later approved assembler will materialize a temporary fresh workdir containing only `B1 + T`; it must copy tail files byte-for-byte from the canonical shared-tail source.

Supabase CLI 2.84.2 is the certification pin. Normal CLI discovery reads `<workdir>/supabase/migrations` and compares filename versions with `supabase_migrations.schema_migrations`. The design uses that behavior and normal `migration up`, `db reset`, and `db push`; it does not use `--include-all`, history repair, renumbering, or a second independently edited tail.

## Markers and fail-closed preflight

The later baseline epoch must create an immutable singleton lineage marker in a non-exposed administrative schema, with lineage `baseline-v1`, baseline contract digest, manifest digest, and install timestamp. The first shared-tail migration must create the same marker shape for historical databases with lineage `historical-v1` only when the complete `H` version set is already present. It must reject partial or mixed histories.

Every database command wrapper must perform a read-only preflight before migration discovery:

1. identify the selected lane explicitly (`historical-upgrade` or `fresh-baseline`); no default;
2. verify CLI version is exactly 2.84.2;
3. verify the workdir path is generated/approved for that lane;
4. compute the historical manifest digest and shared-tail digest;
5. read remote/local migration versions and the lineage marker;
6. reject an absent marker on non-empty post-cutoff histories, mixed `H`/`B1` versions, a marker/lane mismatch, unknown versions, missing tail files, or a hash mismatch;
7. only then invoke a normal Supabase command without `--include-all`.

The baseline version range must be allocated only after Gate 2. Every `B1` version must be greater than `20261020171522`; the baseline-end cutoff is immutable once approved; every shared-tail version must be greater than the baseline-end cutoff. No ordinary migration may be assigned inside the reserved baseline range.

## Protection by workflow

| Activity | Required lane and entrypoint behavior |
|---|---|
| Existing hosted upgrade | Historical wrapper uses root workdir, verifies all `H` hashes and linked history/marker, then normal `supabase db push`. It rejects any `B1` version. |
| Fresh local reset | Fresh wrapper assembles an ephemeral workdir from immutable `B1` plus canonical `T`, verifies hashes, then `supabase db reset --local --no-seed --workdir <generated>`. Root `supabase db reset` is prohibited by CI and documentation. |
| CI database tests | Matrix runs fresh baseline creation, tail application, historical upgrade capsule, and parity. Each job receives an explicit lane; no job calls Supabase directly against root without historical-upgrade intent. |
| Preview project | Created only through fresh wrapper; linked project must have an empty migration history or matching `baseline-v1` marker. Destroy after testing. |
| Type generation | Generate against the already-certified disposable database selected by lane, using local URL/project binding. The current direct production command in `package.json` is not an acceptable reproducibility gate and must be replaced in a later authorized change. |
| Production deployment | Existing hosted projects use historical wrapper only. Git-backed application production deployment remains separate and must not bootstrap a database. Baseline artifacts are never present in the historical workdir. |

## Current entrypoints requiring Gate 2 adaptation

- `package.json` `supabase:types` targets production project `wtvdjndyxegudufrompx` directly and has no lineage preflight.
- `package.json` declares `supabase` as `^2.84.4`, while the approved certification binary is 2.84.2; Gate 2 must choose and enforce one exact package/binary source rather than a range.
- `.github/workflows/pr-smoke.yml` calls `supabase start` at the root and, in the browser lane, assembles a workdir then calls `supabase migration up`; both need explicit lane wrappers.
- Two database jobs in that workflow pin 2.84.2, while a separate remote smoke job still pins 2.72.7. The remote smoke may remain application-only, but it cannot be treated as database-lineage certification.
- `scripts/certify-mid-september-migration-replay.ps1` and `scripts/certify-anvil-migration-chain.mjs` use `--include-all`. They remain historical diagnostic artifacts but cannot certify either supported lineage.
- Any developer invocation of `supabase start`, `db reset`, `migration up`, or `db push` at repository root can accidentally select `H`; supported runbooks must route through wrappers and CI must reject raw invocations outside an audited allowlist.

No entrypoint is changed in Gate 1 because doing so would change executable database behavior before routing approval.

## Shared-tail divergence controls

There is one canonical tail directory. Fresh workdirs receive a generated copy and a manifest; generated workdirs are ignored and never edited. CI compares relative path, length, and SHA-256 byte-for-byte and rejects duplicate tail filenames elsewhere. A pull request that changes an `H` file fails the historical-manifest gate. A pull request that changes `B1` after its freeze fails the baseline-manifest gate. Tail migrations are append-only and must pass both lineage matrices before integration.
