# H444 confidential output design

**Proposal/Draft — NOT APPROVED — EXECUTION PROHIBITED**

Design basis: `c10a9be01362f73ed7de1e827b2fc7c9531ed404`.
Reviewed locally on 2026-11-21, 05:04–05:06 America/New_York (UTC−05:00).
Authority: [unsigned acquisition package](H444_ACQUISITION_AUTHORIZATION_NOT_APPROVED.md)
and [exporter preparation](H444_EXPORTER_PREPARATION.md). This proposal changes no
authorization, historical evidence, migration, exporter gate or certification rule.

Security profile amended 2026-11-21 at the owner's request. The owner declares
no registered customers or customer information and classifies the prelaunch
data as non-sensitive. Source contents remain uninspected. This classification
does not cover acquisition credentials, Auth/provider secrets or encryption keys.
The acquisition package now requires explicit residual-risk acceptance rather
than blanket workstation hardening. **Risk acceptance remains NOT RECORDED**;
documentation approval is not permission to acquire or acceptance of secret exposure.

## Recommendation and local evidence

Use the existing **Node `node:crypto` AES-256-GCM implementation**, with a fresh
256-bit data-encryption key per package, wrapped using **Windows DPAPI
CurrentUser** under the named owner-managed Windows account. Use a 96-bit random
nonce and full 128-bit GCM tag; never reuse a key/nonce pair or derive either
from artifact hashes. Do not fall back to DPAPI LocalMachine. Keep the unwrapped
key transient; persist only its DPAPI-protected blob. No key was located, read
or generated for this design. Offline verification and documented recovery are
prerequisites; this is a proposed mechanism, not an implemented output layer.

Read-only capability inspection found native Windows Node `v20.20.0`, bundled
OpenSSL `3.0.17`, AES-256-GCM/SHA-256 availability and the required cipher and
RSA APIs. Runtime: installed Node executable (user-specific path omitted),
SHA-256 `fda2b2a8857735f7958ba9771a2b24734ff36434e85ae606bcf7744d41d7adc0`.
This proves API availability, not cryptographic validation, current patch
suitability or permission to use keys. No encryption/decryption was executed.
No new service, paid infrastructure or package installation is proposed; this
does not establish zero acquisition/egress cost or approve spending.

The preserved `.git/forge-pr89-h444-446-preparation/package.py` uses AES-GCM with
DPAPI CurrentUser key wrapping. Preserve it unchanged; its presence is design
precedent, not verification of a new implementation. Owner-managed DPAPI replaces
the earlier RSA-recipient proposal and separate-key-custodian requirement for
this lower-sensitivity profile. It does not isolate data from processes running
as the owner or privileged host access. Those risks and profile/recovery
dependence require explicit acceptance. Independent evidence review remains
separate from key custody and is not reduced.

## Package, hashes and verification

1. Receive only a successfully completed exporter result in memory, after source
   cleanup succeeds. Preserve exact bytes of these **six logical artifacts**:
   `schema.sql`, `data.sql`, `supabase-migrations-schema.sql`,
   `supabase-migrations-data.sql`, `role-and-acl-manifest.json`,
   `snapshot-consistency.json`. Encrypt all six, including the JSON proofs.
   Keep the source observation and export receipt as encrypted sidecars, outside
   the six-member logical artifact namespace. Do not persist a plaintext manifest.
2. In memory, recompute SHA-256 and byte size for every member; check exact
   membership, all six receipt entries, the source-observation digest and the
   existing snapshot proof's digest over the other five artifacts. Retain the
   original non-MVCC sequence labeling. Encryption establishes no new snapshot,
   authenticity, secret-screening or historical certification claim.
3. Serialize a bounded, versioned container with fixed member names, lengths and
   an internal manifest binding candidate, exporter/plan digests and provenance.
   Use fixed-order length-delimited bytes, without compression, paths, symlinks,
   archive extraction or executable contents. Reject duplicate/unknown members,
   integer overflow, overlong fields, truncation and trailing bytes. The precise
   byte framing and parser require independent review before implementation.
4. Encrypt that entire container as one AES-GCM message. The clear envelope has
   only a format/version, fixed algorithm suite, opaque run ID, DPAPI CurrentUser
   wrapping identifier, DPAPI-protected data-key blob, nonce and bounded ciphertext length.
   Authenticate its exact serialized header and framing as GCM additional
   authenticated data. Bind the versioned `forge.h444.confidential-output.v1`
   format; reject algorithm/wrapping-scope downgrade or extra fields. Any DPAPI
   helper must transfer key bytes only through supervised private in-memory IPC,
   never argv, environment variables, ordinary files or console/transcript output.
   Store the tag with the ciphertext. Source identities, plaintext hashes,
   original filenames, row counts and detailed receipts remain encrypted.
   The clear header/protected-key blob and ciphertext size still disclose
   metadata; this design does not promise identity or traffic-size hiding.
5. Hash the complete final envelope bytes separately with SHA-256. This
   ciphertext hash changes on each encryption; plaintext artifact hashes remain
   deterministic. Keep the ciphertext hash outside the container to avoid a
   circular digest. Neither a hash nor GCM identifies the historical source:
   a process with access to the owner's DPAPI context can create a different
   valid envelope. Independent
   approval must bind the exact ciphertext hash and verified internal evidence.
6. Before publication, reread the ciphertext and authenticate/decrypt using the
   still-ephemeral data key. Treat any output of `decipher.update` as untrusted
   until tag verification in `final` succeeds; only then parse and compare all
   internal bytes/hashes in bounded memory. Never extract to disk or execute SQL.
   This verifies storage round-trip, not recovery. Before acquisition, separately
   demonstrate DPAPI unwrap/decrypt under the designated account and the
   documented recovery procedure using synthetic evidence. An independent reviewer
   must later verify the authentic package through approved controlled access;
   do not distribute owner account credentials to enable that review.

The current `validateLogicalArtifactDirectory` requires plaintext files. A future
in-memory verifier must reuse its membership/hash/proof checks without weakening
the existing validator or materializing a directory. Current synthetic receipts
must remain synthetic and must not be relabeled or marked approved by encryption.
Retain the current 128 MiB six-artifact cap; separately approve bounded sidecar,
container, verification-memory and ciphertext/disk budgets before collection.
The existing cap does not bound Node process RSS or its multiple plaintext copies.

## Storage, plaintext exposure and credentials

| Surface | Required control / limitation |
| --- | --- |
| Persistent output | Owner selects an exact unused private path excluded from Git, serving, deployment, sync and automatic backups. Establish and verify Windows owner/SYSTEM DACLs on the parent **before** creating a file; `0600` or `.git` placement alone is insufficient. Reject reparse points and path substitution. |
| Publication | Write ciphertext only to an exclusively created staging file, flush/close, reread and verify. Publish without replacement on the same volume, then recheck bytes and ACLs. Implement/test Windows no-clobber and crash-durability semantics; do not assume generic rename is safe. An incomplete envelope or missing verified receipt is never success. |
| Plaintext files and IPC | No SQL/JSON temp files, plaintext archives, shell redirection, command substitution, clipboard or transcript transport. Pipe client output directly to the supervised process; encrypt before any persistent write. Existing fixture-only plaintext test directories are unsuitable for authentic data. |
| Memory and paging | The exporter retains buffers and immutable JavaScript strings, including decoded rows. Minimize copies/lifetime; clear mutable key/plaintext buffers best-effort and terminate workers. Neither GC, buffer clearing, process exit nor a RAM filesystem proves erasure or prevents paging. |
| Logs | Emit only opaque run ID, stage/error code and approved ciphertext digest/status. Never log SQL results, arguments containing secrets, raw stderr, stack-local objects or environment dumps. The runner must not request tracing, heap snapshots or debug reports. Residual host logging/dumps require explicit risk acceptance, not a mandatory workstation-wide shutdown. No settings change is authorized here. |
| Credentials | Use the designated owner DPAPI context and ephemeral data key, without retrieving Windows credentials or DPAPI master keys. Source credential handling remains a blocker: no URLs/argv, inherited broad environments, plaintext password files or captured console prompts. A reviewed protected injection mechanism is required; child environment variables alone do not prove secrecy. Explicit residual paging/dump risk acceptance must include both source credentials and encryption keys. |
| Secret-bearing evidence | Encryption is not permission to include forbidden credentials. An approved in-memory schema/history/data screen must stop on required secret-bearing values; never silently redact history or assert a clean package without evidence. Do not persist unreviewed diagnostic payloads even encrypted. |

Use native Windows execution for this proposed output layer. Do not introduce
WSL, Docker or tmpfs as a confidentiality shortcut. Any future acquisition
transport using them would add its VM memory, swap, virtual disks and logging
to the required review. This design does not configure or approve a transport.

## Workstation findings and unresolved protections

| Local observation | Consequence |
| --- | --- |
| `Win32_PageFileUsage`: active `C:\pagefile.sys`, allocated size 34,000 MiB | Plaintext paging is possible. No verified no-page guarantee exists for this exporter. |
| `manage-bde -status C:` and `D:` both denied access | Encryption of the pagefile volume and possible destination volume is **NOT VERIFIED**. Do not infer encryption from Windows defaults or prior documentation. |
| CrashControl reports `CrashDumpEnabled=3`, `LogEvent=1`, dump/minidump paths | Crash-related persistence is configured; exact captured contents, access, encryption and user-process/EDR dumps are **NOT VERIFIED**. No dump files were opened. |
| Subsequent read-only audit, 2026-11-21 05:11–05:12 EST: `hiberfil.sys` exists, `powercfg /a` lists Hibernate/Fast Startup, `HiberbootEnabled=1` | Hibernation/Fast Startup are enabled; protection of persisted memory remains **NOT VERIFIED**. This supplements the earlier inconclusive Power-registry observation. |
| No destination or custodian designated | Effective destination ACLs, sync/backup exclusions, key storage/recovery and retention cannot yet be verified. |
| Logging/EDR/administrator access not comprehensively audited | Transcripts, telemetry, live memory inspection and elevated access remain unverified. File encryption and volume encryption do not protect plaintext from a compromised active host. |

**Residual-risk acceptance is PENDING; acquisition remains BLOCKED.** Before
acquisition, the owner must record acceptance or require mitigation of the
observed/unknown paging, hibernation, dump, volume-encryption and logging risks,
including transient credentials and keys. No administrative hardening or fresh
encryption-status proof is automatically required under the simplified profile.
Mandatory process controls still require verification. If the owner requires a
strict no-plaintext-on-disk guarantee, this workstation is not verified suitable.
Unknown protections must stay unknown; no risk acceptance is inferred here.

## Custody, retention and failure disposition

Name the owner custodian, exact Windows account/profile and recovery operator
(which may be the owner). Document and test a protected recovery method using
synthetic evidence, including account/profile loss and interrupted operation.
Ordinary same-session decryption is not a recovery test. Do not export Windows
credentials/master keys or place unwrapped data keys in files/logs. No separate
RSA key or independent key custodian is required. Recovery availability, approved
backup location and rotation remain undecided; profile deletion/reset may render
evidence unreadable. No keys or recovery secrets were accessed or generated here.
Any later key/recovery operations require explicit authority.

After verified publication, clear reachable mutable data/key buffers and close
handles; report only best-effort memory cleanup. After interruption or failure,
cancel/drain clients, roll back/close the source and prohibit publication. Retain
only bounded sanitized failure metadata and ciphertext partials under the same
restricted policy; never retry/resume with a reused key/nonce or silently append.
Unknown cleanup outcome is a hold. Suspected plaintext leakage requires an owner
incident decision, not automatic deletion or a successful completion receipt.

The owner must specify UTC retention/review deadlines, custodian, backup rules,
failure retention and exact-artifact disposal approval. Expiry is not permission
to delete existing evidence. Ordinary deletion/overwriting cannot guarantee
erasure on SSDs, snapshots, backups or paged/crash-captured memory. Destroying a
recoverable data-key copy does not erase packages still decryptable via DPAPI
profile/recovery material and protected key blobs. Destroying shared Windows
profile material could affect unrelated data; it is not an authorized cleanup
method. No crypto-erasure claim is allowed without a reviewed
complete key/copy inventory. Never delete historical evidence or original bodies.

## Review decision and next permitted work

The mechanism is feasible with installed APIs, but the output layer is **not
implemented or approved**. Required decisions: exact destination/DACLs; owner
account and tested recovery; explicit host residual-risk acceptance and threat model;
budgets/retention; exact framing and in-memory verification; independent review
of the implementation and a new bounded acquisition authorization addressing the
prior owner stop. Existing source-scope, TLS and credential blockers remain.

Future authorized offline implementation must test synthetic round-trip,
DPAPI account/recovery behavior, wrong key/tag/header, mixed/truncated members, size limits,
unsafe paths/ACLs, no-clobber races, disk-full/interruption and logging failures.
None of those encryption tests ran in this design-only task. Inspection verified
only local capabilities, selected host settings and consistency with repository
contracts. No provider/database connection, encryption, extraction, restoration,
certification, credential operation or configuration change occurred.

**Stop after design review. No push, acquisition, merge or deployment.**
