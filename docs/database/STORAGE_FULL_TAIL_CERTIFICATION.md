# Storage full-tail certification through migration 446

Status: governed disposable certification procedure; no hosted execution or release authorization. Candidate foundation: `674011bf88f8f6d179e362fd394dda49b38e155f` on PR #89's Storage dependency.

The exact contract is `certification/storage-full-tail-446.json`: all 446 historical-root migration names/versions/Git-byte hashes, the B1 baseline hash, unchanged runner and operational fixture identities, and the final version `20261113214832`. New or missing migrations, altered bytes, reordered history or an unexpected pending version stop execution. No frozen migration is rewritten and no history repair or `--include-all` is used.

`scripts/certify-storage-full-tail.ps1` derives task-owned temporary runners from pinned Git objects. Original version-specific scripts and their exact-prefix assertions remain unchanged for their original scopes. The new entrypoint has its own explicit complete-tail contract. It stages migration files only in governed disposable CLI workdirs; it creates no repository clone, source snapshot or worktree. Supabase CLI remains exactly 2.84.2. Docker availability is checked before starting task-owned containers; user-owned Docker infrastructure is not restarted.

Use an existing ACL-restricted evidence directory under the canonical repository's `.git`:

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

Once such evidence is available, validate and restore it only to an isolated task-owned environment through an approved restoration procedure. Verify schema/catalog, migration-history prefix, financial fingerprints and exact remaining versions before applying any pending SQL. Apply the identical shared-tail bytes through 446, retaining before/after original history and financial fingerprints; run the same Storage HTTP/accounting/concurrency/RLS/application checks and compare the final normalized H/B1 catalog. Any mismatch remains a hold. No hosted export or new restoration mechanism is authorized implicitly by this runbook.

## Acceptance and release boundary

Keep separate outcomes for B1 synthetic operational certification, H synthetic boundary verification, and authentic H full-tail certification. Missing authentic evidence is a release blocker, not an exemption. Empty-B1 operational initialization remains a separate reviewed contract; never seed commercial authority into fresh installations to conceal that limitation.

Retain exact candidate SHA, CLI version, pinned input hashes, per-stage pending sets, applied history, all test output, catalog fingerprints and cleanup verification in restricted evidence. Run affected application tests on the same SHA. Preserve prior accepted receipts and all 475 original objects and references. No exclusion/quarantine activation, ownership assignment, capacity grant, hosted write, merge or deployment belongs to this procedure. Production deployment policy remains the canonical AGENTS.md policy.
