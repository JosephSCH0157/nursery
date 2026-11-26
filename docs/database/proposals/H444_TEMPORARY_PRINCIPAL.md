# H444 temporary acquisition principal

**NOT APPROVED — HOSTED EXECUTION PROHIBITED**

This proposal implements the owner's local-only preparation request of
2026-11-24. It does not reopen the consumed authentication check, authorize a
retry, reuse an expired acquisition window, or authorize provisioning. Follow
`../DATABASE_OPERATIONS.md` and `../STORAGE_FULL_TAIL_CERTIFICATION.md` for the
separate acquisition, isolated restoration, certification and release gates.

## Exact procedure and source boundary

The proposed principal is exactly `forge_h444_acquire_01`, connecting directly
to `db.wtvdjndyxegudufrompx.supabase.co:5432/postgres` with the existing pinned
Docker/libpq client and CA, `sslmode=verify-full`, and no administrator fallback.
Creation is [h444-temporary-role-create.sql](h444-temporary-role-create.sql).
Cleanup is [h444-temporary-role-cleanup.sql](h444-temporary-role-cleanup.sql).
Neither file is a migration or a hosted executor. No existing migration changes.

The proposed role begins NOLOGIN, password NULL, already expired, with no
SUPERUSER/CREATEDB/CREATEROLE/REPLICATION, and connection limit two (snapshot
holder plus schema dump). Its only membership is `pg_read_all_data`, with
INHERIT true and ADMIN/SET false. BYPASSRLS is needed for complete protected
financial evidence; `row_security=off` rejects silent row filtering. There are
no application-object grants, ownership transfers or reserved-role changes.

The preserved metadata review found Auth/Storage schema dependencies that the
ordinary `postgres` principal cannot directly grant. Broad read membership
supports the existing schema-only dump, all required sequences, full six-column
history and the unchanged 110-table / 27-financial-relation data projection.
**This membership plus BYPASSRLS permits reading excluded Auth/Vault and other
database contents. The extraction allowlist is enforced by the exporter, not
by column-level database privilege restrictions.** Explicit owner acceptance
and supervised credential custody are required.

The 2026-11-24 source metadata review (02:08 UTC on November 25) confirmed
PostgreSQL 17.6, authenticated `postgres`, CREATEROLE, BYPASSRLS, and ADMIN OPTION
on `pg_read_all_data`. PostgreSQL 17 permits a BYPASSRLS creator to assign that
attribute; the observed Supabase reserved-role/membership lists exclude the
proposed role and `pg_read_all_data`. This establishes the documented authority
and catalog prerequisites, not a completed CREATE ROLE test. The role was absent.
Stop on any provider rejection; never elevate the observer or change a reserved
role. See [PostgreSQL 17 CREATE ROLE](https://www.postgresql.org/docs/17/sql-createrole.html).

## Effective privileges: independent review required

`PRINCIPAL_METADATA_SQL` in `scripts/lib/storage-h444-principal.mjs` is a fixed,
metadata-only inventory. It returns role OID/attributes/expiry/settings,
effective inherited and SET-able roles, ownership count, database CREATE/TEMP,
schema CREATE, table and column writes, sequence USAGE/UPDATE, large-object writes,
explicit parameter privileges, incoming membership/default ACLs, and every
effectively executable routine (including PUBLIC and built-ins) with identity,
owner, ACL, language, volatility, security-definer flag, search path and definition
digest. No passwords, password hashes, row contents or routine bodies are returned.
The fixed `PRINCIPAL_REVIEW_METADATA_SQL` variant lets an approved observer
inventory the disabled role without SET ROLE or password authentication. Run
metadata review with `search_path=pg_catalog` for stable routine identities.
Preserve disabled-role evidence and independently re-pin the final enrolled
inventory; LOGIN and expiry changes are intentional, not digest-equivalent.

The v2 gate rejects unexpected write rights, ownership, role switching, settings,
expiry, identity substitution or inventory drift before financial observations or
row extraction. The sole relation-write allowance is PostgreSQL's exact
`pg_catalog.pg_settings` session-settings view; its complete rule fingerprint is
included in the independently reviewed inventory. PUBLIC TEMP and CONNECT rights
are retained and explicitly disclosed. No blanket pg_catalog or schema exception
is introduced.

An independent reviewer must classify the exact effective routine inventory,
including SECURITY DEFINER and extension/external-effect routines, and record
the supporting review evidence. Unknown or unsafe capabilities are a HOLD.
Function volatility labels, read-only defaults, a digest alone, or absence of
explicit grants are not proof of safe execution. Role-specific REVOKE cannot
remove privileges granted to PUBLIC. No proposal here changes PUBLIC ACLs.
The approval verdict `PASS_NO_UNREVIEWED_OR_UNSAFE_CAPABILITIES` is an independent
attestation bound to the routine/inventory hashes, not an automated claim by the
exporter. Its review reference must support the classification; never fill it in
merely to satisfy JSON validation. Built-in session operations and TEMP require
explicit residual-risk acceptance. Newly discovered unsafe capabilities require
owner review of a new procedure, not silent acceptance.

The prospective source review is **HOLD**, independently corroborated by a separate
Codex review agent. At 2026-11-25T02:09:38.839307Z, PUBLIC plus `pg_read_all_data`
exposed 3,361 executable routines (inventory SHA-256
`5a2a01aaf1c135354715cd8cc4e7cbc64d2eafa6f3ec52a7d6125f9e0363c182`). Three
PUBLIC-executable, postgres-owned SECURITY DEFINER routines have write-capable
bodies matching the frozen migration
`20260904120000_tongs_quench_destination_packages_youtube_jobs.sql`:

- `tongs.finalize_quench_destination_package(uuid,uuid,uuid,uuid,uuid,text,integer,text,uuid,jsonb)`;
- `tongs.enqueue_youtube_publication_job(uuid,uuid,uuid)`;
- `tongs.retry_youtube_publication_stage(uuid,uuid,uuid)`.

Their JWT/workspace guards do not establish a credential-wide read-only boundary
for a direct SQL client that can set request JWT session settings. No routine was
invoked, protected row inspected, or live write effect demonstrated. This is a
blocking capability finding, not a claim that every routine has been certified
safe or that an exploit was executed. Trigger-only routines are not treated as
directly callable mutators. The exporter READ ONLY transaction remains necessary
but does not remove capabilities from the credential outside that transaction.

Private metadata, exact queries and body hashes are preserved beneath
`.git/forge-private-evidence/h444-approval-readiness-20261124/temporary-role-readiness-2f896915/`.
Do not create or enroll the role while this HOLD remains. A separately reviewed
privilege correction or provider-enforced restriction must preserve authentic
H444 catalog evidence; changing PUBLIC ACLs is a source change, not an implicit
permission in this proposal. Role-specific REVOKE cannot solve the finding.
After any separately authorized disabled-role creation, revalidate actual
capabilities/OID and independently pin them before enrollment. Unknown capabilities
or unexplained differences leave the role disabled.

## Financial observation compatibility

The private `_current_financial_environment()` routine is not granted to the new
role. The acquisition-only v2 adapter checks its independently preserved full
definition/body hashes, owner, STABLE/security-definer flags and search path.
Only then does it use the identical latest-revision SELECT within the same
read-only repeatable-read snapshot. Empty or non-Test state still stops export.
All 27 financial fingerprint inputs and original governed SQL files remain
unchanged. No financial authority is initialized or modified.

## Credential enrollment, expiry and cleanup

**Forge Credential Index:** obtain the assigned index number from the owner before
creating a credential. No number is assigned by this proposal. The owner-controlled
index records only credential identity (including its assigned index), project
`wtvdjndyxegudufrompx`, role `forge_h444_acquire_01`, H444 acquisition purpose,
actual creation date, and approved expiration. Leave dates unassigned until known;
never invent an enrollment event. Passwords/verifiers are not index fields and
must not enter Git, chat, logs or evidence. The owner alone retains the password
and enters it through the approved private prompt. Do not use the existing managed
administrator credential enrollment command for this role or retest old credentials.

1. Separately approve exact candidate, create/cleanup SQL hashes, source, capable
   provisioning operator, intended role membership and risks. Confirm no other
   operator is changing this role during provisioning/enrollment/cleanup. Require
   no existing same-name role; never reuse it implicitly. Capture created OID in
   restricted metadata evidence. Credential absence is a boolean check only.
2. Independently verify the disabled role's actual effective privileges and
   provider support. Resolve every unsafe/unknown function before enrollment.
3. Owner enrolls a fresh, unique, one-use password through supervised private
   `psql` `\password forge_h444_acquire_01`, using SCRAM-SHA-256, verified TLS and
   an explicitly approved provisioning session. No SQL literal, shell argument,
   environment file, clipboard automation, transcript or credential-manager reuse.
   Follow the transaction-local logging procedure below; psql's encrypted
   enrollment still sends a sensitive password verifier. If confidentiality cannot
   be established, STOP before enrollment. Keep the role NOLOGIN and expired.
4. A separately approved `ALTER ROLE forge_h444_acquire_01 LOGIN VALID UNTIL
   '<exact approved UTC end>';` enables a maximum 30-minute supervised window.
   Do not open that window until owner-held credential availability and exact
   indexed project/role identity are established. The exact expiry must equal v2
   acquisition `expiresAt`. Capture post-enrollment
   metadata without reading a password/verifier. Re-pin its actual OID, expiry,
   settings and effective capabilities. A password-presence boolean is sufficient.
5. Acquisition uses the existing private SecureString-to-stdin delivery and
   encrypted evidence destination. No credential persistence or automatic retry.
   Query/lock/connect/session limits remain enforced by the existing transport;
   role settings provide defense in depth but the user can change them. DPAPI
   recovery, memory/pagefile residual risks, seven-day evidence retention, source
   load and the cost ceiling need renewed candidate-bound owner approval.
6. Execute approved cleanup on success, failure, interruption or window expiry.
   Pin role OID; commit NOLOGIN and PASSWORD NULL before terminating only that
   role's sessions. Verify no sessions remain, revoke its exact membership, then
   DROP ROLE without CASCADE, DROP OWNED, REASSIGN OWNED or forced dependency
   removal. A dependency failure leaves login/password revoked. Unexpected OID,
   remaining sessions or dependencies is a HOLD requiring reconciliation.
   Password expiry alone does not close existing sessions. Do not automatically
   retry uncertain cleanup. The supervising owner/operator must remain available
   to perform cleanup if the workstation or acquisition process fails.
7. Verify role absence, session absence and no application ACL/catalog changes.
   Dispose the one-use owner-held credential and clear private prompts/buffers.
   Plaintext in managed memory, swap, crash dumps or backups cannot be guaranteed
   securely erased; preserve the existing documented risk acceptance and evidence
   retention requirements. Do not delete historical evidence or acquisition receipts.

### Enrollment logging: proposed control, not yet executed

Source metadata showed `log_statement=ddl`, `log_min_error_statement=error`,
`pg_stat_statements.track_utility=on`, `pgaudit.log=none` and SCRAM-SHA-256.
Ordinary statement masking alone does not cover errors or statement statistics.
[Supabase's credential logging procedure](https://supabase.com/kb/troubleshooting/provisioning-credentials-without-log-exposure)
supports the following same-connection transaction before private `\password`:

```sql
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SET LOCAL idle_in_transaction_session_timeout='120s';
SET LOCAL transaction_timeout='180s';
SET LOCAL log_statement='none';
SET LOCAL log_min_error_statement='panic';
SET LOCAL log_min_messages='fatal';
SET LOCAL pg_stat_statements.track='none';
SET LOCAL pgaudit.log='none';
```

This is **NOT APPROVED** SQL preparation, not permission to change logging now.
Use direct verified TLS and a private interactive `psql -X` session with
ON_ERROR_STOP, no echo/transcript/recording, and no credential-bearing command
arguments. Before any secret prompt, read back every setting above, verify
`password_encryption=scram-sha-256`, the exact disabled role OID, source and
operator identity. On any error/mismatch/timeout, rollback and close without
prompting. Only after all gates pass may the owner privately run
`\password forge_h444_acquire_01`; commit only confirmed success. On failure,
rollback/close, preserve only sanitized status, and do not retry automatically.
Confirm logging settings revert after commit/rollback; connection loss is an
uncertain enrollment, requiring metadata reconciliation rather than retry.

Supautils' observed allowed configuration list includes these logging controls;
core `has_parameter_privilege=false` does not establish their unavailability.
Their actual use/readback in the exact enrollment session remains **NOT VERIFIED**.
No setting was changed during this review. Provider logging behavior is documented,
not empirically certified here; private client diagnostics and auxiliary recording
must also be excluded. Enrollment authorization must explicitly cover this brief
transaction-local suppression, its reduced error visibility, and reset verification.

### Consolidated owner decisions still required

1. Assign the Forge Credential Index number; designate the owner as password
   custodian and confirm the exact project/role/purpose. Supply no password in chat.
2. Authorize the exact closed H444 Quench intervention under
   DATABASE_OPERATIONS.md after independent before/after commitments are pinned.
   Local implementation approval does not clear the source privilege HOLD.
3. After that HOLD clears, approve the exact candidate and pinned creation/cleanup
   SQL, provisioning operator, broad-read/BYPASSRLS and PUBLIC residual risks,
   private enrollment procedure, and exact UTC role expiration/activation window.
4. Name the cleanup operator available through interruption/expiry and approve
   revocation/drain/drop on every exit, evidence retention, cost ceiling and recovery
   limitations. Acquisition from the corrected source needs its own fresh v3 package and explicit approval;
   neither prior consumed authorization nor this document opens a window.

## New approval and certification requirements

The unmodified-source temporary-role contract remains
`forge.h444-acquisition-approval.v2`. The corrected H444 source requires
`forge.h444-acquisition-approval.v3` and the independently reviewed intervention
receipt, original/corrected full catalog commitments and unchanged protected
evidence described in DATABASE_OPERATIONS.md. Old contracts cannot substitute
for that receipt. The v3 route uses the same principal lifecycle and retains
all v2 principal controls. It retains all
v1 candidate, scope, source, TLS, financial/Storage, historical-body, cost,
destination and time pins, and adds `principalApproval`: exact role OID/expiry,
effective privilege and routine digests, create/cleanup SQL hashes, independent
reviewer/reference, routine-review verdict, PUBLIC/broad-read risk acceptance
and cleanup authorization reference. Old v1 approval cannot select this role.
No approval digest is issued by this implementation.

The encrypted role/ACL artifact preserves the raw temporary role and its
effective privilege observation. Do not restore the login credential or treat
the temporary role as an automatic catalog exception. The isolated restoration
package must separately explain any exact role/membership omission, prove no
owned objects or application ACL changes, and pass existing catalog/isolation
and H/B1 parity checks. No physical-restoration, historical-object, release or
production physical-recovery requirement changes.

Offline validation: `node --test scripts/test-storage-h444-principal.mjs` runs
pure contract checks and, on Windows with the already-running Docker engine,
disposable network-none PostgreSQL tests. These tests deliberately create only
synthetic roles/data, demonstrate PUBLIC definer and column/sequence risks,
verify financial-mode equivalence, exercise the same encrypted acquisition
coordinator, and check failed and successful cleanup. They are not authentic
certification, source inspection or hosted provisioning evidence.
