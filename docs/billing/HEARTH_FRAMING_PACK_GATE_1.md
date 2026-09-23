# Hearth Framing Pack — Gate 1 Report

Date: 2026-09-22
Branch: `mid_september_smoke`
Scope: application, forward migration, tests, offline measurement, economic and static authority review only.

## Implemented contract

- Route: `hearth.framing_pack_generation`
- Product: `forge.hearth.framing-pack-generation.v1`
- Output: `framing_pack_seven_sections.v1`
- Model: `gpt-5.6-luna`
- Bounds: 12,000 input units, 2,048 output tokens, one attempt
- Customer price: two Forge Credits / 10,000 customer micros
- Test risk: 4,858 micros per operation and per 86,400-second window, concurrency one
- Live: no active customer scope

The strict paid parser accepts the seven required sections exactly once in any
order, rejects unknown or forbidden sections, and emits one canonical fixed-order
byte form. The historical Pack parser remains permissive and continues reading
`TITLE_OPTIONS`.

Paid Pack artifacts include the operation ID, domain result ID, product/output
contracts, structured sections, and approval identity. New success retains the
existing immediate description projection. Explicit recovery reloads Pack display
state without reapplying descriptions, so later creator edits are not overwritten.

The new generic validation-failure evidence table and recorder are additive. The
existing `hearth_tag_validation_failure_evidence` table and
`record_hearth_tag_validation_failure_evidence` function are unchanged.

## Post-implementation gasoline measurement

Canonical authority:

- Workpiece: `21d16d6a-905b-491e-8761-028789612ae5`
- Approval: `be87d40f-516b-4dcf-bd25-094b922cc682`
- Revision: 1
- Script hash: `0d32f3762a1ee766cf43ab52568407123f1ede0d0de1d1a7114819c3cc6dedfe`
- Script: 8,600 Unicode code points / 8,608 UTF-8 bytes

Measured with the implemented request builder:

- Serialized messages: 10,779 bytes
- Complete provider request: 10,870 bytes
- Request SHA-256: `6bf8fc2ce57e4fd3329beade46669bc950eef977ad8c0b3cdfb6b08fa93fc562`
- Tokenizer: `o200k_base-js-tiktoken-1.0.21`
- Input tokens: 2,501
- Protocol allowance: 16
- Conservative bound: `max(2,501 + 16, 10,870) = 10,870`

This exactly matches the planning authority; no prompt fingerprint changed.

## Economic certification

- Input: `ceil(12,000 × 200,000 / 1,000,000) = 2,400 micros`
- Output: `ceil(2,048 × 1,200,000 / 1,000,000) = 2,458 micros`
- Direct and full cost ceiling: 4,858 micros
- 33% target: `ceil(4,858 × 133 / 100) = 6,462 micros`
- Customer charge: `ceil(6,462 / 5,000) = 2 Credits`
- Settled customer value: 10,000 micros
- Rounding adjustment: 3,538 micros

## Verification

- Nursery typecheck: pass
- Hearth typecheck: pass
- Nursery lint: zero errors; four pre-existing React hook warnings in unrelated Quench/TongsBranding files
- Titles, Tags, Framing, and Hearth runtime: 72/72 pass
- Package, persistence, historical parser, and production feedback: 44/44 pass
- `git diff --check`: pass (line-ending notices only)

## Disposable database certification

The initial from-scratch divergence was reproduced at
`20260916110806_tongs_forge_credit_economy.sql`. Its bounded-Luna assertion
requires an operator-created revision-1 pricing policy with an 11,015-micro full
cost ceiling, plus the historical five-model catalog and a platform operator.
Immediately before that migration, an unassisted disposable replay contained
zero matching policy revisions, zero historical catalogs, and zero platform
operators. The historical linked database had received those prerequisites as
lived-in operator/catalog state rather than from an earlier migration.

The repair is confined to the guarded local replay fixture and disposable
certification harness. The fixture reconstructs only that historical prerequisite
at the precise migration boundary; it requires the
`forge.local_historical_replay=mid-september-v1` guard and a private loopback
database. A manifest-driven disposable exclusion mechanism lets the existing
phased certification harness apply the replay-sensitive migrations at their
documented boundaries. No historical migration was edited.

A clean isolated database replay then passed from the historical start through
HEAD and applied `20261011520000_hearth_framing_pack_generation_test_product.sql`.
Both `mid_september_migration_replay_certification.sql` and
`hearth_framing_pack_generation.sql` passed. The latter proves:

- route/model bounds of 12,000 / 2,048 / one attempt;
- 4,858 direct/full supplier micros and zero variable supporting micros;
- the 6,462-micro target, 3,538-micro rounding adjustment, and two Credits /
  10,000 customer micros;
- exactly one Test scope, zero Live scopes, concurrency one, and a 4,858-micro
  rolling exposure ceiling;
- forced RLS, immutable service-only Framing result/evidence authority, current
  approval and script-hash enforcement, and idempotent replay guards;
- the unchanged Tag evidence table/RPC contract.

The linked dry-run proposed exactly one migration:
`20261011520000_hearth_framing_pack_generation_test_product.sql`. It made no
database changes.

## Gate boundary

No migration was deployed, no customer quote was prepared or accepted, no provider
was called, and no Netlify deployment occurred. Gate 2 remains unauthorized.
