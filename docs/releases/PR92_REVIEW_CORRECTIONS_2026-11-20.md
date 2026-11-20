# PR #92 review corrections

Status: implementation and regression record; **not release authorization**.
Starting candidate: `b357538b74e49c862ceb6de810fce36948a6d1b6`.

## Review inventory

| Finding | Latest-code assessment | Correction / evidence |
| --- | --- | --- |
| [Historical inventory](https://github.com/JosephSCH0157/nursery/pull/92#discussion_r4619724701) | Confirmed: byte-checked inventory/receipts did not bind the raw rows subsequently inserted and approved. A substituted binding/version could obtain misleading certification. | Reconcile three unique 475-object sets, paths, provider versions, metadata, owner fields, historical timestamps, read receipts, disposition and body hashes before SQL. Bind the later observation and evidence digest to this validated snapshot. |
| [Metadata admission](https://github.com/JosephSCH0157/nursery/pull/92#discussion_r4619724766) | Confirmed: changing pinned identity fields could retire an original's exclusion without admitting its newly billable bytes. | Forward correction checks the complete historical identity. Descriptive user metadata on an ordinary billable object and access bookkeeping remain possible without new financial exposure. |
| [Overwrite probes](https://github.com/JosephSCH0157/nursery/pull/92#discussion_r4619724819) | Confirmed: the permission probe carries the old size and can reject a smaller replacement that fits. | Separate metadata publication from identity-only probes using PostgreSQL column-specific triggers; keep synchronous final-write rejection and deferred durable-write enforcement. |
| [Storage HTTP source](https://github.com/JosephSCH0157/nursery/pull/92#discussion_r4618470701) | Already corrected before this assignment. | `discoverStorageHttpSource` validates the supplied database project, network identity, Storage peer and connection target. Expanded shared discovery also repairs the review-summary PostgREST network finding. |
| [Seat lifecycle](https://github.com/JosephSCH0157/nursery/pull/92#discussion_r4618470776) | Already corrected before this assignment; thread already resolved. | Both recurring-price and paid-period allowlists include `addon`. Existing lifecycle tests cover configured monthly/quarterly seat prices, Test/Live modes, cancellation, receipts and negative authority cases. |
| Concurrency test (review summary) | Confirmed: the 104-byte writer never fit in the old 103-byte space. | Leave 104 bytes, prove both writes individually succeed in rolled-back transactions, then race them and revoke the actual remaining excluded object's approval. |
| PostgREST network (review summary) | Confirmed: unrelated fixed network used for a validated caller-supplied source. | Derive and validate the source network before reading Stripe credentials or contacting Stripe. No Stripe activity is part of this assignment. |

## Database correction boundary

The SQL correction requires a forward successor to 446. No frozen SQL, historical
object, historical approval, existing access policy, financial authority or
manifest publication contract is rewritten. No application code change is
required to use it: the existing Storage writes invoke the corrected triggers.

Storage v1.37.7's permission upsert omits `metadata`; final publication explicitly
assigns it. The immediate publication trigger therefore executes even when the
new metadata equals the old value. The identity trigger permits the narrowly
defined intermediate version/owner shape; the deferred guard still rejects an
unadmitted commit. This is not a privileged bypass or a caller-controlled flag.
Provider references: [uploader](https://github.com/supabase/storage/blob/v1.37.7/src/storage/uploader.ts),
[database adapter](https://github.com/supabase/storage/blob/v1.37.7/src/storage/database/knex.ts).

## Regression procedure

Offline inventory tests use synthetic objects. A separate read-only validation
of existing restricted evidence checks all 475 retained bodies without executing
SQL or acquiring new data. Private identities and bodies are not test fixtures
or CI artifacts.

`scripts/test-storage-review-database.ps1 -Lineage baseline` derives a disposable
runner from the unchanged pinned baseline template, certifies its predecessor,
applies the exact 439–440 prefix, and runs the synthetic Storage adapter through
446 plus the proposed correction. Both privilege modes are included in PR CI.
It never runs the historical certification lane, seeds private inventory, or
contacts Stripe. The task-owned database and Storage tmpfs are cleaned up.

The SQL regression first reproduces both defects on unchanged predecessor SQL.
It then verifies interruption rollback, unchanged RLS/ACL/owners, metadata
admission, permission-probe rollback versus commit, identical-metadata final
publication, fitting/oversized replacements, and descriptive metadata after
subscription expiry. Real Storage HTTP checks verify access denial, retained
bytes after failure, a small historically excluded replacement with only ten
bytes remaining, a capacity increase, and rejection of a new object at capacity.
Existing accounting, financial, manifest concurrency and HTTP checks also run.

Final candidate and test results are recorded in the PR evidence comment after
completion. A green predecessor run is not evidence for a later candidate.

## Mandatory release holds

Review closure does not authorize merge or production. The canonical
[AGENTS.md production policy](../../AGENTS.md#production-deployment-policy-canonical)
still governs; merging `main` triggers production deployment.

Authentic historical predecessor restoration/certification, final H/B1 catalog
parity, financially inactive fresh-B1 initialization, approved physical-backup
recovery, global writer fencing/drain, retained Storage-byte and Stripe-event
reconciliation, coordinated application/Edge Function deployment, and genuine
Stripe Test paid receipts remain distinct mandatory gates. A new successor also
needs its reviewed lineage/catalog and hosted execution contract; the existing
445/446 executors remain held and cannot apply it.

The November 19 closure/merge documents' immediate-merge recommendations are
historical claims needing reconciliation, not owner approval or current-state
evidence. This record corrects their review-readiness scope without weakening
any release gate.
