# Owner-supervised H444 acquisition

Status: implementation candidate; **no hosted acquisition authorization**.

This is the owner's explicit change of security model for one acquisition. The
managed `postgres` credential (Credential001 / private entry 01) remains capable
of writes and administration. `forge.h444-acquisition-approval.v4` certifies a
reviewed, controlled read-only execution path; it does not certify a read-only
credential. Existing v1/v2/v3 checks and the temporary-role implementation remain
unchanged. Temporary-principal development is suspended; index 02 is reserved
and unused. No provisioning, enrollment, ACL changes or new infrastructure form
part of this route.

## Exact authorization boundary

The independently delivered canonical approval digest binds the executable Git
HEAD, plan, client image, psql/pg_dump and CA hashes, source endpoint, output
destination, original body receipts, protected fingerprints, recovery evidence,
operator/reviewer, risk acceptance, owner supervision and exclusive DDL
coordination. The `managedExecutionApproval` additionally commits the static
execution/import/SQL/helper closure, verified postgres name and numeric server version,
one attempt and zero automatic retries. Changing any of these requires a new
reviewed approval; neither source publication nor local testing authorizes a
connection. The interval is at most 30 minutes. The existing ten-minute session,
query/dump/output limits remain in effect and must fit inside that interval.

The direct endpoint remains `db.wtvdjndyxegudufrompx.supabase.co:5432/postgres`
with verify-full TLS and the preserved CA. No proxy, pooler, hostaddr or fallback
is admitted. The existing pinned disposable client is reused; no Docker Desktop
lifecycle or configuration change is authorized.

## Controlled procedure

1. Verify clean exact HEAD, owner digest, execution closure, independent review,
   private empty destination, hashes, recovery v1 validity through the entire
   interval, and source-certificate origin ancestry before requesting a secret.
2. Owner privately supplies only entry 01 through the existing PowerShell
   secure prompt and private pipe. No credential-manager change, plaintext
   staging file, argument, output or retained credential is permitted. The
   isolated client necessarily has the password transiently in process memory
   and its private process environment; this is an accepted exposure boundary.
3. Consume an exclusive attempt journal before dispatch. Metadata-only identity
   probes explicitly use read-only repeatable-read; verify the role name,
   pinned numeric server version, BYPASSRLS and TLS, record the actual role OID
   (the earlier evidence did not record it), then roll back that transaction.
4. The existing collector starts a new read-only repeatable-read transaction,
   exports one snapshot, verifies the corrected source catalog/functions and
   protected fingerprints, and uses the same snapshot for metadata, history,
   all projected data and both pinned schema-only pg_dump operations. The
   pinned pg_dump implementation starts its own read-only snapshot transaction;
   no caller-supplied SQL, dump flags, executable or alternate transport is
   accepted. Fresh connections contain no pre-existing temporary objects.
   v4 explicitly adds `--no-subscriptions` to avoid privileged subscription
   connection-string discovery. Subscriptions are global objects already outside
   the schema-filtered artifact scope; no required schema/data is removed. Other
   pg_dump catalog discovery can exceed the 110-table row projection transiently;
   that privileged metadata exposure is part of the disclosed trusted-process
   boundary. Required output secret screening is retained.
   pg_dump resets server statement/idle/transaction timeouts: its local 180-second
   process bound and fail-closed cleanup are the deadline control, not inherited
   PGOPTIONS server timeouts. Uncertain termination prevents success.
5. Review the actual executed graph, including type output, casts, operators,
   functions and pg_dump catalog operations. Ordinary SELECT syntax and routine
   volatility are not safety evidence. Any unresolved executed external effect,
   source drift, bound violation or error means HOLD; no retry/recollection.
   Before catalog deparsing or protected rows, a metadata-only guard restricts
   projected relations to ordinary/partitioned tables, checks recursive non-system
   output handlers against specific PostgreSQL builtin scalar OIDs/symbols and
   internal enum/array/composite handlers, and rejects executable JSON casts and
   unreviewed custom output types. Domains/composites/ranges are not accepted as
   projected values. The selected pgcrypto digest overload is definition/symbol/
   library pinned to captured evidence. Unsupported source types cause HOLD,
   not omission of required data. Excluded namespaces are also checked because
   stored expressions can contain constants of their types. This is an
   execution guard, not a new audit.
   The one installed wrappers 0.5.6 `extensions.embd` output handler is separately
   pinned to captured OID/definition/symbol/library and reviewed immutable source
   `supabase/wrappers@21709a60dccd2b784e495d209a3b3e1dfda9751b`,
   `wrappers/src/fdw/s3vectors_fdw/embd.rs`. It formats a length only. It is
   accepted solely as unused extension metadata: zero non-extension dependencies
   on that type or its arrays are required. Required rows, constants, domains or
   other user objects using it cause HOLD; no lossy value conversion is allowed.
   This reviews source and observed metadata, not the hosted loaded library hash.
   The sanitized complete type/handler inventory is retained inside the existing
   encrypted role/ACL artifact for independent post-acquisition verification.
6. Require dump subprocess completion and zero sibling sessions for this
   unique application identity, authenticated holder rollback and normal client
   exit. Remove only the exact labeled local client. A killed client is not
   proof of server-session termination. Uncertain cleanup blocks success and
   requires reconciliation; this procedure cannot terminate arbitrary server
   sessions or revoke, rotate, disable or drop Credential001/postgres.
7. Reuse the restricted AES-256-GCM/DPAPI envelope, no-replacement publication,
   disk authentication/decryption round trip and secret screening. Preserve the
   six logical artifacts, 475 original Storage bodies and their receipts. v4
   also publishes a separately encrypted execution/cleanup receipt. Independent
   post-acquisition review must finish inside the authorized interval. The
   fixed retention/cleanup deadline and separate incremental cost ceiling are
   explicitly approved; old evidence deadlines do not change.

## Preserved certification gates

The original six-column H444 migration history, historical-v1 lineage, complete
110-table/27-financial-relation projection, Test-only financial state, exact
original Storage identities and 447475 preserved bytes, confidentiality and
protected exclusions remain unchanged. No financial activation or mutation is
performed. Sequence values remain labeled non-MVCC observations; no stronger
snapshot guarantee is invented. Existing recovery v1 is reused only while valid;
the reference is not restoration authorization.

The immutable Quench certificate retains its original candidate. v4 explicitly
pins that candidate in `managedExecutionApproval.interventionCandidate`; it
never rewrites the certificate or global executable candidate. The full
corrected catalog and exact three-function delta are validated in the acquired
snapshot. All source provenance continues to name the new executable HEAD.

Restoration, H/B1 convergence through the existing forward tail and release
certification remain separate gates. In particular, existing logical-restoration
v3 intentionally rejects a certificate from a different executable candidate.
A later separately reviewed versioned restoration approval must explicitly bind
the immutable certificate origin to that restoration candidate; this acquisition
does not relax shared restoration validation or claim restoration readiness.
Acquisition success alone does not close PR #92 or authorize restoration,
migration, deployment or merge.

## Independent evidence and residual risk

Before hosted approval: review exact code/SQL/import closure and selected source
types/routines against preserved evidence; test authorization downgrades,
certificate substitution, recovery validity, readonly snapshot flow, actual
PowerShell rejection-before-prompt, encrypted body custody, interruption and
cleanup failures using only synthetic network-isolated data; obtain CI results
for the exact published HEAD. Local fixtures prove mechanism, not production
state. Post-run review checks all commitments, snapshot/artifact/body integrity,
financial/history/Storage invariants, receipts and cleanup before certification.

Compromised trusted code or stolen Credential001 can write or disclose unrelated
data. Read-only transactions do not prohibit every external effect or local disk
write. Locks, load, timeouts and non-MVCC sequence observations remain risks;
rollback cannot undo external effects. No credential-wide safety verdict is
issued. PostgreSQL's transaction restrictions are documented at
<https://www.postgresql.org/docs/17/sql-set-transaction.html>.
