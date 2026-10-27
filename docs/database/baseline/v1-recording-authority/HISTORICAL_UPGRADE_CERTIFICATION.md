# Recording-authority certified-chain historical successor

This successor closes the tooling gap between the frozen Gate 6P historical
predecessor (418 migration rows) and
`20261027030139_anvil_recording_authority_repair.sql` (419 rows). It does not
modify or replace the Gate 6P harness or its evidence.

## Normal certified-chain procedure

Gate 5F is the completed authentic 411-row foundation. Gate 6H, Gate 6O, and
Gate 6P are its immutable reviewed successors through 418 rows. Normal forward
successor certification reconstructs that protected foundation and chain in
disposable databases; it does not repeat the confidential hosted export.

```powershell
pwsh -NoProfile -File scripts/invoke-anvil-recording-authority-historical-certification.ps1 `
  -Mode CertifiedChain
```

This is the default mode. It rejects project references, attestations,
authorization switches, and loaded Gate 5D credentials, makes zero hosted
requests, and runs both privilege configurations.

## Exceptional authentic re-anchoring

The retained exceptional Authentic mode requires all of the following:

1. a newly owner-authorized read-only export from the dedicated history
   endpoint;
2. the reviewed scoped token and scope attestation required by Gate 5F;
3. an encrypted `forge-gate5d-read-only-*` capsule beneath the operating-system
   temporary directory; and
4. the explicit `-AuthorizeExternalAuthenticCapsule` switch.

The previous Gate 5F authorization and revoked token are not reusable. The
capsule must never enter Git, CI artifacts, chat attachments, a served path, or
another user or machine. Decrypted contents remain in memory and all
task-created capsule, container, volume, network, and temporary resources are
removed in `finally`.

The non-secret CLI preflight and static tooling tests also remain available:

```powershell
pwsh -NoProfile -File scripts/invoke-anvil-recording-authority-historical-certification.ps1 -Mode ToolingPreflight
pnpm test:db:anvil-recording:historical-tooling
```

## Authorized disposable re-anchoring

After a newly authorized Gate 5F-compatible capsule has been created in the
same execution context, run:

```powershell
pwsh -NoProfile -File scripts/invoke-anvil-recording-authority-historical-certification.ps1 `
  -Mode Authentic `
  -ProjectRef $projectRef `
  -ScopeAttestationPath $scopeAttestationPath `
  -AuthorizeAuthenticHistoryTransfer
```

The coordinator calls the frozen Gate 5F read-only exporter, keeps the encrypted
capsule only in the operating-system temporary directory, passes it directly to
the successor, and clears the process token, capsule, and attestation directory
in `finally`. The harness restores only into task-created, internal-network
disposable databases. In CertifiedChain mode it reconstructs the protected
411-row Gate 5F foundation; in Authentic mode it restores the newly authorized
capsule. Both modes construct the reviewed seven-migration Gate 6P predecessor,
require 418 rows and
`historical-v1`, and then stages only `20261027030139`. It requires that exact
single pending version, reaches 419 rows, and rechecks all authentic-prefix
hashes.

Before the target migration, the production-drift fixture supplies the legacy
completion, Keep, and Discard shapes needed for byte-preservation testing. That
fixture is behavioral test data; it does not replace the certified historical
foundation or an encrypted capsule used for re-anchoring. The harness hashes existing receipt identities,
evidence, fingerprints, and media metadata before and after the migration,
then verifies venue-neutral decisions, idempotency, conflicts, immutable
receipts, function grants, pending decisions, and Hammer discovery.

The existing production-shaped harness separately proves the target
migration's invalid-lineage rejection and transactional rollback. Both default
privilege lanes must pass. The result reports zero hosted requests, zero paid
provider operations, financial inactivity, and scoped teardown.

## Hosted boundary

Passing this certification does not authorize hosted execution. Hosted apply
still requires verified backup/PITR, password-authenticated historical
preflight, exactly one pending version, a reviewed change window, and separate
owner approval. No unrestricted direct-SQL route is introduced.

Once committed, the migration has no routine down migration: customer decisions
may rely on nullable execution IDs and venue-neutral authority. Recovery is PITR
or a separately reviewed forward correction. Never fabricate or rewrite
recording receipts.
