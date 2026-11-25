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

Provider authorization to assign BYPASSRLS must be established for this exact
project before creation is authorized. A stock PostgreSQL synthetic fixture
does not reproduce Supabase's reserved-role/supautils enforcement. Existing
CREATEROLE, BYPASSRLS and membership ADMIN observations are not by themselves
proof of permission to assign BYPASSRLS to another role. If unsupported, stop
for the provider-supported procedure; never elevate the observer or modify a
reserved role as a workaround.

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

No complete effective hosted-routine review exists yet. Local fixture results
cannot fill that gap. Before hosted provisioning approval, authorize the minimum
metadata-only prospective review needed; after separately authorized disabled-role
creation, revalidate actual effective capabilities and OID before enrollment.
The two phases must agree; unexpected differences leave the role disabled.

## Financial observation compatibility

The private `_current_financial_environment()` routine is not granted to the new
role. The acquisition-only v2 adapter checks its independently preserved full
definition/body hashes, owner, STABLE/security-definer flags and search path.
Only then does it use the identical latest-revision SELECT within the same
read-only repeatable-read snapshot. Empty or non-Test state still stops export.
All 27 financial fingerprint inputs and original governed SQL files remain
unchanged. No financial authority is initialized or modified.

## Credential enrollment, expiry and cleanup

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
   Verify provider query/audit logging will not capture the password or verifier;
   psql's encrypted enrollment still sends a reusable password verifier. If that
   confidentiality requirement cannot be established, STOP before enrollment.
4. A separately approved `ALTER ROLE forge_h444_acquire_01 LOGIN VALID UNTIL
   '<exact approved UTC end>';` enables a maximum 30-minute supervised window.
   The exact expiry must equal v2 acquisition `expiresAt`. Capture post-enrollment
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

## New approval and certification requirements

The temporary role requires `forge.h444-acquisition-approval.v2`. It retains all
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
