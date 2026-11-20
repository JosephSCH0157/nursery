# Storage admission successor 447

Status: governed source adoption for PR #92; **not release authorization**.
Predecessor candidate: `930063de537619c995edcee7efbb1f1016c91c08`.

Migration `20261120161347_storage_accounting_identity_admission.sql` is the
single shared-tail successor to 446. Its SHA-256 is
`0b4d5a53bf73ca3f10f1b6dc90ab91ecd74c0e58c6bb0dbf714e7d3814040eda`.
Only the explanatory header differs from the tested proposal; its executable
transaction is identical. The proposal and all 446 predecessor migrations remain
byte-identical historical evidence. H has 447 migration identities; B1 has 34.
These are repository membership counts, not claims about an installed database.

The machine-readable [successor contract](storage-admission-447.json) pins the
predecessor catalog, original proposal, migration, read-only execution contract,
and complete allowed catalog delta: replace `_enforce_storage_capacity()`,
replace its statement trigger, and add its identity trigger. Regression tests
compare all application function/trigger definitions and relation access
contracts before and after, reject any other delta, and test rollback and
deliberate contract drift. The read-only successor check composes with the
unchanged cumulative contracts through 444 and 446.

`forge-storage-full-tail.mjs` verifies the exact 446-prefix plus this one
successor; legacy callers retain their original through-446 scope. Explicit
staging may select 447 for either lineage. Current CI requires the exact seven
Storage migrations and the stage-7 execution contract. Old hosted executors
remain limited to their original versions and retain their hard Apply hold.
There is no hosted 447 executor or authorization in this change.

Focused verification uses `test-storage-review-database.ps1 -Lineage baseline`
with permissive and restrictive privilege modes. An optional explicit existing
disposable source is read for schema only; otherwise the runner builds a pinned
synthetic predecessor fixture through 438. Writes occur only in task-owned
databases and Storage tmpfs. The runner does not invoke H/B1 certification,
restoration, private-inventory acquisition, financial initialization or Stripe
validation. CI additionally verifies normal migration discovery and execution
through 447 in its existing disposable application test setup.

Exact candidate results and review-thread dispositions are recorded on PR #92.
Authentic H/B1 certification, financial initialization, recovery, fencing,
deployment and Stripe validation remain separate release gates. None is claimed
or started by this adoption. PR #92 must remain draft and unmerged.
