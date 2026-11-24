# Storage full-tail certification through migration 446

Status: governed disposable certification procedure; no hosted execution or release authorization. Candidate foundation: `674011bf88f8f6d179e362fd394dda49b38e155f` on PR #89's Storage dependency.

The exact contract is `certification/storage-full-tail-446.json`: all 446 historical-root migration names/versions/Git-byte hashes, the B1 baseline hash, unchanged runner and operational fixture identities, and the final version `20261113214832`. New or missing migrations, altered bytes, reordered history or an unexpected pending version stop execution. No frozen migration is rewritten and no history repair or `--include-all` is used.

`scripts/certify-storage-full-tail.ps1` derives task-owned temporary runners from pinned Git objects. Original version-specific scripts and their exact-prefix assertions remain unchanged for their original scopes. The new entrypoint has its own explicit complete-tail contract. It stages migration files only in governed disposable CLI workdirs; it creates no repository clone, source snapshot or worktree. Supabase CLI remains exactly 2.84.2. Docker availability is checked before starting task-owned containers; user-owned Docker infrastructure is not restarted.

Use a new ACL-restricted run directory under the canonical repository's `.git`. The entrypoint refuses to overwrite existing results for the selected lineage and records the candidate, contract, template and generated-runner hashes:

```powershell
./scripts/certify-storage-full-tail.ps1 -Lineage baseline -RepositoryRoot (Get-Location) -EvidenceDirectory $privateEvidence
./scripts/certify-storage-full-tail.ps1 -Lineage historical -RepositoryRoot (Get-Location) -EvidenceDirectory $privateEvidence
```

## B1 operational-fixture lane

Both permissive and restrictive ambient-privilege environments first run the unmodified provider-alignment certification, including the frozen B1 bootstrap, exact predecessor stages, guarded owner-Hearth/Luna fixtures, known catalog comparison, RLS and Data API behavior. This lane explicitly contains synthetic operational prerequisites. It is not the empty financially inactive installation path and is never described as authentic historical financial state.

After certified version `20261104143249`, the new runner checks and applies exactly 439–440 through the CLI. It runs the existing Storage accounting/HTTP/concurrency and exact 475-object tests using disposable adapters derived from that complete 440 schema. The adapters apply identical 441–446 SQL bytes, including all intervening application contracts; no earlier tail migrations are omitted from their source schema. The actual B1 lineage database then receives exactly 441–446 through the normal CLI. Its complete 33-row prefix and lineage marker are revalidated.

Financial fingerprints, scalable-admission inactivity, RLS/Data API behavior and private audit ACLs are checked after the full upgrade. Both ambient-privilege lanes must produce identical normalized full-tail catalog/ACL fingerprints. The known frozen predecessor catalog is still independently enforced; no new catalog exception is introduced. The new final fingerprint is review evidence, not a substitute for authentic H/B1 parity.

## Historical evidence boundary

The historical mode exercises the governed synthetic 411-row history capsule/restorer, its tamper/duplicate/incomplete/interrupted-restore checks, and the unchanged frozen pre-slice-a schema. It applies the exact 26-version historical suffix through 437 in both privilege lanes, verifies the original six-column history hashes remain unchanged, and discovers the exact nine pending versions through 446.

It does not invent Luna financial rows. If the four required operational predecessor authorities are absent, it records `BLOCKED` at 438 and preserves the pending list and prerequisite counts. Synthetic migration metadata is explicitly labeled; it is not claimed as authentic financial history. No complete historical upgrade or final cross-lineage parity is claimed from that boundary probe.

Authentic continuation requires a separately reviewed, restorable predecessor containing actual schema, lineage marker, full six-column migration history and necessary financial data, with source identity, exact version/hash commitments, extraction provenance, confidentiality/retention controls and owner-authorized transfer scope. A 411-row migration-history capsule alone is insufficient: it does not contain the later operational financial state. The old authentic closeout states its confidential capsule was removed and its token revoked; a closeout or consumed migration-440 authorization is not a reusable snapshot or credential.

For the existing physical-provider path, restore the reviewed predecessor only to an isolated task-owned environment through its approved restoration procedure. Verify schema/catalog, migration-history prefix, financial fingerprints and exact remaining versions before applying any pending SQL. Apply the identical shared-tail bytes through 446, retaining before/after original history and financial fingerprints; run the same Storage HTTP/accounting/concurrency/RLS/application checks and compare the final normalized H/B1 catalog. Any mismatch remains a hold. This logical evidence contract does not alter that physical path or authorize a hosted export or restoration.

## Logical-restoration evidence contract (v1)

The additional `forge.storage-h444-logical-restoration-approval.v1` method can
substantiate the H444 source and H full-tail evidence using an authentic,
independently verified logical snapshot imported into an isolated target. Its
offline validator is
[`storage-logical-restoration-certification.mjs`](../../scripts/lib/storage-logical-restoration-certification.mjs).
It validates supplied evidence only: it does not export, import, connect to a
database, run migrations, or grant hosted certification. An `OFFLINE_EVIDENCE_VALID`
result is not a release receipt.

The executing `certify-storage-authentic-restoration.mjs` coordinator accepts
physical-provider approvals only. The logical validator is not connected to an
export/import or migration execution path. The later
[H444-to-447 proposal](proposals/STORAGE_H444_447_CERTIFICATION.md) remains
non-executing; a reviewed logical execution adapter and 447-capable successor
runner are prerequisites for that route. Offline tests and CI cannot satisfy
this integration requirement or authorize running either route.

The owner-approved evidence package must bind the exact current candidate and
the complete pinned 446-migration manifest, including the exact 445–446 bytes.
The logical artifact directory contains exactly the schema, data, migration
schema/data, role/ACL manifest, and `snapshot-consistency.json` artifacts. The
validator streams and verifies every artifact's SHA-256 and size. The
consistency proof must bind the same source project and snapshot identifier,
transaction-snapshot method, start/completion times, six-column migration
history, financial observation, Storage metadata observation, source
observation digest, and digest set of the other export artifacts. The source
and target observations must preserve the complete six-column history and
matching lineage, financial, and Storage fingerprints at 444, 445, and 446.
The source must retain the required Test-mode predecessor authorities; no
synthetic history-only capsule substitutes for them.

The Storage manifest must reconcile exactly 475 original object identities
with source and target metadata digests, byte counts, independently recorded
source/target byte hashes, and read receipts. The required behavior receipt
still covers the complete physical-path acceptance set, including Storage HTTP
and retained-byte behavior, ownership/RLS, concurrency, stale-writer rejection,
global fencing/drain, and delayed/duplicate Stripe events. Final H/B1 catalog
parity remains mandatory.

Isolation evidence must inventory every required external-effect category on
both source and target, with explicit per-category coverage, counts, evidence
hashes, and inventory fingerprints. Every active source mechanism must have one
exact-identity neutralization; all target mechanisms must be inactive.
Catalog fingerprints must cover the complete supplied source and target
catalogs. Every catalog difference must be an exact exception tied to the
matching neutralized identity. Wildcards, unexplained differences, unclassified
effects, and incomplete inventories fail closed. Timestamped isolation and
trigger-suppression evidence must precede import. Production secrets and Vault
root keys must not be transferred.

Import must start after the bound export snapshot has completed, and its
completion cannot be in the future at evidence validation time.

The owner-approved digest must be independently captured and supplied to the
validator; valid JSON or a self-computed digest is not owner approval. Any
actual production export, logical restoration, or hosted certification requires
separate authorization and handling of restricted evidence. This method does
not weaken or replace the unchanged physical-provider restoration contract and
tests. A successful logical H444 certification also does not satisfy the
separate mandatory production physical-backup recovery certification gate.

## Acceptance and release boundary

Keep separate outcomes for B1 synthetic operational certification, H synthetic boundary verification, and authentic H full-tail certification. Missing authentic evidence is a release blocker, not an exemption. Empty-B1 operational initialization remains a separate reviewed contract; never seed commercial authority into fresh installations to conceal that limitation.

Retain exact candidate SHA, CLI version, pinned input hashes, per-stage pending sets, applied history, all test output, catalog fingerprints and cleanup verification in restricted evidence. Run affected application tests on the same SHA. Preserve prior accepted receipts and all 475 original objects and references. No exclusion/quarantine activation, ownership assignment, capacity grant, hosted write, merge or deployment belongs to this procedure. Production deployment policy remains the canonical AGENTS.md policy.
