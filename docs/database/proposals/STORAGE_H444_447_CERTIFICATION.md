# Proposed authentic H444 to 447 certification extension

Status: **Proposal / non-executing / owner approval not issued**.
Source candidate: 660a8d62732393a5e61e72d1a6fa9658c3c53f81.

This proposal extends the requirements of
[Storage full-tail certification through 446](../STORAGE_FULL_TAIL_CERTIFICATION.md)
for a future, separately authorized run. Its machine-readable commitments are in
[storage-h444-447-contract.json](storage-h444-447-contract.json). It does not amend
the approved 446 contracts, accept a restoration receipt, enable an executor,
authorize acquisition or override a consumed authorization or owner stop.
Database operations remain governed by [DATABASE_OPERATIONS.md](../DATABASE_OPERATIONS.md).
The [evidence-discovery report](H444_EVIDENCE_DISCOVERY_2026-11-20.md) records the
current BLOCKED disposition separately from these proposed requirements.

## Inputs and approval boundary

A future approval must bind the exact execution candidate (not automatically this
proposal's source candidate), reviewed procedure/adapter hashes, the ordered
447-migration manifest, and migration 445/446/447 bytes. The manifest digest is
SHA-256 of LF-joined path|version|sha256 records, with no terminal newline, from
the approved 446 list followed by the adopted 447 identity. The baseline is the
frozen B1 migration plus the identical shared tail; H447 and B1-34 are different
lineages, never interchangeable histories. Pin Supabase CLI 2.84.2 and exact
provider/PostgreSQL/Storage runtime versions in each run receipt.

Before execution, independently verify a complete authentic H444 package:

- Source project wtvdjndyxegudufrompx, snapshot identity/time, extraction or
  provider-backup provenance, original schema/catalog, roles/ACL/RLS and genuine
  private lineage marker. The exact 444-version prefix ends at 20261111201029.
- All six migration-history columns, with original row and column digests:
  created_by, idempotency_key, name, rollback, statements and version.
  Version lists and statement hashes alone are insufficient.
- Actual Test-mode financial predecessor rows and fingerprints, including the
  required pricing revision, rollout revision, cost policy and rate condition.
  Preserve journal, subscription, receipt, entitlement and authority fingerprints.
  The exact prerequisite selectors remain those in the existing full-tail
  procedure. Presence counts alone do not establish authenticity or equality.
- Exact 475 original Storage identities, versions, metadata, ownership,
  disposition, byte counts, body digests and read receipts. Bind them to the same
  source observation as the database snapshot; independently reconcile target
  metadata and retained bytes after a separately approved restoration. Do not
  infer snapshot consistency from independently timed investigation receipts.
- An independently supplied owner-approved digest binding the package, permitted
  operation, target, expiry, confidentiality/retention, costs and cleanup owner.
  A locally calculated hash, example approval or old consumed token is not approval.

For a logical route, preserve the existing six-artifact set: schema.sql, data.sql,
supabase-migrations-schema.sql, supabase-migrations-data.sql,
role-and-acl-manifest.json and snapshot-consistency.json. Require nonempty files,
exact sizes/hashes and a single-transaction snapshot proof binding their complete
digest set and source/financial/Storage observations. Preserve the existing
source/target external-effect inventories, exact neutralization identities,
pre-import isolation and trigger-suppression evidence, and prohibition on
production secrets and Vault root-key transfer. For a physical-provider route,
retain its distinct backup/restore-receipt, ownership and pre-start isolation
requirements; do not relabel logical evidence as physical recovery certification.

No presently supplied evidence or approval satisfies this section. Approval for
acquisition, if needed, is a separate phase from approval for restoration and
certification. A new authorization must explicitly address the prior owner-stop
boundary; this document does not resume that work or select paid infrastructure.

The existing historical prerequisite selectors are retained, not replaced with
fresh synthetic rows:

| Authority | Required authentic selector |
| --- | --- |
| Pricing | tongs.private_pricing_revisions id b4c4472f-0325-4c2e-b2ef-9aef5e59e64a |
| Rollout | tongs.openai_text_rollout_revisions route_code hearth.chat_completion, revision 12 |
| Cost policy | tongs.openai_text_cost_policy_revisions id 10000000-0000-4000-8000-000000000010 |
| Rate condition | tongs.openai_text_rate_condition_revisions id 51100000-0000-4000-8000-000000000004 |

Verify their full protected content and dependent authority against the approved
source observation, not just these identifiers or a nonzero row count.

## Proposed execution and observation sequence

Only a separately reviewed successor runner could perform this sequence. The
current authentic validators reject stage 447 and the current full-tail runner
retains its through-446 scope. Do not pass this proposal to those executors,
rename approval schemas, manually inject SQL or weaken their prefix assertions.

Run both permissive and restrictive ambient-default-privilege modes for each
lineage. H uses separate isolated task-owned targets from the same approved
authentic predecessor; B1 uses its approved frozen bootstrap and identical tail.
Ambient privilege differences must not change the final explicit ACL contract.
Keep B1 operational fixtures explicitly synthetic, separate from fresh financially
inactive B1 acceptance and from authentic H financial state. Never add synthetic
financial prerequisites to H to make a migration pass.

| Observed stage | H history count | B1 history count | Read-only checks and required reported stages |
| --- | ---: | ---: | --- |
| H444 predecessor / B1 equivalent | 444 | 31 | billing 4; successor 4 |
| After 445 | 445 | 32 | billing 4; successor 5 |
| After 446 | 446 | 33 | billing 4; successor 6 |
| After 447 | 447 | 34 | billing 4; successor 6; admission 7 |

The JSON pins the three SQL check files and their LF Git-byte hashes. Each must
return storage_contract_ok=true; billing/successor must retain financial_mode=test.
Stage 7 supplements the cumulative 4/6 checks; it does not replace them. Validate
the lineage marker, full ordered history, exact pending suffix and original
six-column H444 history digest before and after each separately observed stage.
The initial H pending set is exactly 445, 446, 447; then 446, 447; then 447;
finally empty. Execute only the next reviewed stage through normal discovery.
Preserve attempt commitments before execution. After failure, timeout or lost
response, inspect under the approved procedure; never automatically replay.

At every stage preserve original H financial rows and original Storage identity,
ownership, metadata and bytes. No historical exclusion/quarantine activation,
ownership repair or capacity grants occur on the authentic target. Assert the
complete catalog/ACL delta; 446 to 447 permits only the three objects in the
adopted admission contract (one function, replaced statement trigger, new identity
trigger). Verify transactional rollback and tampered-contract rejection in a
separate synthetic adapter, never by corrupting the authentic snapshot.

## Required behavior evidence

Preserve every existing physical/logical acceptance obligation: original-version
exclusions, replacement billing, ownership/RLS, Storage HTTP/retained bytes,
manifest concurrency, stale-writer rejection, global fencing/drain, and
duplicate/delayed Stripe-event behavior. This proposal performs none of them;
live Stripe operations require their own authorization and cannot be inferred
from synthetic replay. Unavailable authentic behavior remains NOT VERIFIED.

Add the following 447 regressions in both privilege modes, on clearly labeled
synthetic adapters derived from each final lineage schema:

- Every pinned identity change, including owner/owner_id/user_metadata, requires
  admission when it retires a historical exclusion; unknown owners and excess
  capacity fail with rollback. Original approved identity and access remain intact.
- Ordinary descriptive user/MIME/cache metadata updates without increased
  exposure remain possible after entitlement expiry. Growth still needs admission.
- Rollback-only overwrite probes allow legitimate small replacements. Durable
  version-only bypass and explicit identical-metadata publication are checked;
  oversized and unauthorized overwrites fail and preserve prior bytes. A new or
  replacement version is billed in full and cannot inherit the old exclusion.
- Existing RLS/ACL/ownership, financial admission/settlement, Test/Live separation,
  HTTP failure reporting and manifest publication/CAS checks continue to pass,
  including at least 25 manifest concurrency rounds per lane.

Do not modify preserved original objects to produce these tests. Separate
authentic fidelity/read-only original-actor evidence from copied-inventory tests
and synthetic write scenarios. All 475 original identities must be reconciled;
known missing ownership/workspace/manifest or playback evidence remains an
explicit limitation, never a fabricated passing historical behavior receipt.

## Final H/B1 parity and acceptance

Capture complete normalized catalogs for H447-permissive, H447-restrictive,
B1-34-permissive and B1-34-restrictive, with candidate/run/lane provenance,
entry counts, category counts, query digest and entries. Recompute each digest
from its entries and require all four fingerprints to match. Use only the existing
wrappers 0.5.6/0.5.7 compatibility normalization; no new parity exclusions.
Exact isolation neutralizations must be separately evidenced and reconciled, not
silently omitted from parity. If they prevent the approved comparison, remain
BLOCKED for review rather than create a new normalization exception.

No final 447 catalog digest is supplied or invented here. The old 16,890-entry
446 result is not the 447 expectation. Review and independently pin the complete
B1-through-447 reference before accepting H parity. Require matching security,
Data API, application, Storage and financial-invariant outcomes, while retaining
the distinction between genuine H rows and synthetic B1 operational fixtures.
Run affected application checks on the exact execution candidate. Preserve logs,
stage receipts, negative cases, original-row fingerprints and reviewed cleanup
evidence; failure or missing evidence keeps certification incomplete.

A future receipt must distinguish authentic H444-to-447 upgrade fidelity,
synthetic functional coverage, final catalog parity and unresolved historical
behavior. This cannot certify authentic 437-to-438 replay, fresh-B1 financial
initialization, production recovery, release readiness or deployment. Mandatory
release policy, hosted Apply holds and prior consumed authorizations are unchanged.

## Offline proposal validation

Preparation used two local-only validation helpers. They read repository inputs
and run in-memory contract-negative tests; they do not connect, stage a database,
accept authentic evidence or run SQL:

    node scripts/verify-storage-h444-447-proposal.mjs
    node --test scripts/test-storage-h444-447-proposal.mjs

PROPOSAL_VALID means only that the non-executing proposal matches its pinned
repository dependencies. It is never permission to execute certification.

The three-document preservation commit intentionally excludes these helper
scripts; their names above record the local validation provenance, not commands
available in a fresh checkout. The proposal adds no executable interface.
Existing checked-in tools can independently verify its pinned source membership
and frozen bytes without executing SQL:

    node scripts/lib/forge-storage-full-tail.mjs
    node scripts/verify-frozen-git-evidence.mjs --scope all --require-exact-worktree-bytes

The first tool reports its retained legacy-through-446 scope and the separately
verified repository successor 447. Neither result is authentic certification.
