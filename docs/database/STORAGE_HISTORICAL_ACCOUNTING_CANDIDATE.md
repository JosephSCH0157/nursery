# Historical Storage accounting candidate

Status: **Draft, blocked for integration and hosted execution**. November 13, 2026.

Dependency: `codex/storage-billing-reconciliation-20261111` at
`87ca2259db9ca9ed6a42bcc275c7f4044d5a58ae`. This candidate does not merge that
branch or the pending Anvil, Hearth or episode-split implementations. Current
remote main was observed at `2ecab8e8fd82e45824bfcfc405cbccdb534bbfc8`.

## Implemented contract

The new shared-tail migration is
`20261113175455_storage_historical_accounting.sql`, ordered after installed
historical head 444 (`20261111201029`). Existing migrations 441–444 remain
byte-exact. No historical inventory or commercial activation is seeded.

Separate operator observation and approval RPCs record an exact database
identity manifest plus the SHA-256 of separately reviewed byte evidence.
Approval is bounded to at most 475 observed historical objects over the
lifetime of this mechanism. Age alone does not approve anything. Observations
expire after ten minutes; approval rechecks locked objects and current operator
authority. Exact replay is idempotent; conflicting replay fails.

The identity pins the provider version, object ID, bucket/path binding, all
provider metadata (including size and eTag), creation time and ownership fields.
Only access bookkeeping timestamps are omitted. Raw-byte evidence is an
operator-reviewed external artifact: a database metadata digest alone does not
prove the object body. The private certification manifest records both SHA-256
and provider eTag corroboration.

Approved original generations are excluded from customer retained usage and
the unresolved-history blocker, and counted separately as unassigned historical
bytes. No credit, subscription, admission, public access or ownership is added.
Existing RLS, grants and signing authority remain unchanged. The existing
quarantine tables and mutation guards are untouched and remain inactive for this
inventory.

Generation retirement is immutable, transactional audit. It never blocks an
otherwise lawful mutation. Replacements, copies, renamed bindings and
delete/recreate do not inherit the exclusion. A successor's full size passes
ordinary ownership, entitlement and capacity checks; an excluded predecessor
does not create billable debt or a transferable allowance. Failed mutations
roll retirement back. Restoring the original version string/metadata does not
revive a retired exclusion. Revocation changes accounting only and requires its
own impact review; it does not remove or freeze objects.

New RPCs are `observe_storage_historical_accounting`,
`approve_storage_historical_accounting`, `revoke_storage_historical_accounting`
and `read_storage_historical_accounting`. All require an authenticated platform
operator. Direct table access is revoked from public/application/service roles;
the five audit tables have RLS and immutable update/delete guards. No customer
UI or automatic activation calls these RPCs.

Tongs now reports an incomplete commit stage if upload succeeds but subsequent
registry/manifest/event publication fails. Capacity error identity is retained.
The error says retained bytes may exist and retry requires reconciliation; it
does not claim rollback, automatically overwrite a racing writer or hide the
failure. Database accounting includes retained objects independently of registry
publication.

## Certification and limits

Private detailed evidence is under
`.git/forge-storage-investigation-20261113/accounting-repair` and its sibling
`accounting-repair-followup`, excluded from
Git, application serving and deployment, with operator/SYSTEM access only.
No private object IDs, body data, user identifiers, credentials or signed URLs
belong in this document or its PR.

- All 475 bodies were read and SHA-256 hashed: 447,475 bytes. Provider eTags
  match the actual bytes for all 475, and prior raw hashes remain unchanged.
  Exact original metadata was also copied into a disposable SQL adapter and
  all 475 exclusions exercised without changing object identities. This is
  local certification, not hosted approval or end-user access proof.
- Isolated SQL coverage includes operator/RLS denial, immutable audit,
  interrupted approval, replay, read bookkeeping, unknown-owner denial,
  replacement/copy/rename/delete-recreate enforcement, version replay,
  concurrent capacity admission, revocation, and unchanged financial records.
- Scoped catalog comparison requires that only the two intended existing
  capacity functions change, and that existing policies, relation grants,
  owners and RLS settings remain exact. Full successor catalog/ACL and both
  complete lineage gates remain required.
- Real disposable Storage HTTP passes existing STT-policy authenticated reads
  before/after exclusion, unrelated-user and anonymous denial, signed byte
  delivery, preservation after an owner-denied replacement, and full successor
  accounting. Generic workspace keys do not grant direct authenticated SELECT;
  that initial fixture failed and was corrected to the existing STT policy,
  without changing RLS. This is not certification of Tongs signing authorization
  or the historical episodes. Existing Tongs Storage HTTP and subscription
  lifecycle/concurrency regression suites also pass in their documented
  disposable adapters, not against Stripe or hosted data.
- Ordinary save/registry failure and reviewed retry regressions pass. The
  manifest registry identifies final serialized bytes, while the embedded
  self-entry intentionally hashes the first pass.
- The original concurrent-save regression is retained. The replacement protocol
  uses provider-version compare-and-swap, not a process/browser mutex. Repeated
  eight-writer unit rounds and forced stale reads over real disposable Storage
  HTTP exercise successful reference retention. Exact-candidate receipts and
  any failures are recorded in the follow-up evidence directory.
- Empty B1 stops at immutable `20261104143249` with `reviewed Luna predecessor
  policy changed`. That migration asserts operational rate, policy, published
  price and rollout rows deliberately absent from a schema-only baseline.
  `certify-canonical-baseline-v1.ps1 -CatalogStage provider-alignment` has an
  existing guarded synthetic fixture for that separate operational-state lane.
  A fixture-lane result is not proof that empty financially inactive B1 can
  traverse this migration, nor authentic historical financial-state proof.
- Complete H and B1 certification through both new migrations remains a release
  gate. Older predecessor receipts cannot certify this candidate. No frozen
  migration, policy assertion or catalog exception is weakened.

## Manifest concurrency contract

The additional forward migration is
`20261113214832_workpiece_manifest_optimistic_concurrency.sql`. Existing 445
accounting SQL remains byte-exact. There is no backfill, historical manifest
rewrite, new ownership or entitlement. The service-only
`read_workpiece_manifest_version` RPC binds a read to provider version and,
for new publications, SHA-256. Tongs checks version before and after download
and verifies published bytes before deriving a modification.

Every managed manifest upload includes an operation ID, expected provider
version (null only for creation), final-byte SHA-256 and writer attribution.
The Storage transaction checks the precondition under its row lock, registers
final bytes in `workpiece_files`, and appends an immutable publication receipt.
Stale writes roll back. Tongs rebases only the requested delta onto the latest
manifest, retaining disjoint successful changes. Conflicting same-entry changes
or pointers return an explicit conflict; retry count is bounded. Late registry
or capacity rejection does not publish a new manifest/receipt.

Storage's rollback-only permission probe may temporarily change only an object
version. A deferred constraint requires any durable changed version to have
its matching publication receipt, so permitting the intermediate probe is not
an enforcement bypass. Bookkeeping-only reads remain allowed, including old
objects with no publication receipt. Direct stale registry upserts are rejected.
The audit table has RLS, no direct application/service grants, and immutable
update/delete guards; the new functions explicitly pin owner and execution ACLs.

This transaction covers manifest publication and its registry, not the entire
file-upload/event pipeline. A file may already be retained when publication or
an event fails; that remains an explicit incomplete operation requiring
reconciliation. Concurrent edits of the same source document still require
that document's existing conflict/authority contract. No old content is
restored over a newer writer to disguise a failed operation.

Deployment must coordinate the new application writer with the forward schema:
old writers lack required preconditions and fail closed. No standalone database
apply, mixed-writer rollout, or downgrade to the old writer is authorized by
this draft. Preserve receipts and use a reviewed forward repair on failure.

## Integrity and historical access

The disputed historical manifest and its registry hash are retained unchanged.
Its embedded first-pass hash recomputes correctly, but the registry hash does
not equal either the observed final hash or the embedded self hash. It is not
explained by line endings or ordinary two-pass hashing. No historical cause is
proven; a reproduced current save concurrency defect is not proof of what
happened to that historical object.

Full-byte inspection additionally found 28 non-manifest objects whose bytes
disagree with historical manifest claims (27 draft snapshots and one chat
snapshot). These are separate from provider integrity: all provider eTags match
the actual bytes. Normalizing line endings/trimming or canonicalizing JSON did
not reconcile the claims. Preserve the conflicting claims as evidence; never
use the stale manifest hash in place of the actual observed provider identity.
Any hosted approval must explicitly review these exceptions.

The 29 exceptions are classified individually in private follow-up evidence:

- 27 content-claim discrepancies have no surviving episode or registry. Ordinary
  canonical reads cannot resolve them; preserved Storage bytes and manifest
  claims remain available as evidence, not reconstructed authorized episodes.
- One surviving draft snapshot has a stale manifest claim but a matching registry
  hash and size. The current JSON reader verifies its bytes against the registry;
  the stale manifest alone does not invalidate that read. Missing workspace
  authority still blocks a claim of normal authorized edit/save operation.
- One surviving manifest has a registry hash that fails the current JSON reader's
  integrity check. Its embedded first-pass hash is valid but is not the registry's
  final-byte hash. Correcting it requires an explicit reviewed historical repair.

Tests feed the exact preserved bytes through the current Tongs JSON reader with
recorded metadata adapters. They do not impersonate hosted users. All 29 are
JSON documents, not audio/video; no linked recording/revision establishes a
playback regression caused by these mismatches. Playback and user authorization
remain separate acceptance requirements. The historical accounting identity
uses actual provider metadata, not the stale application manifest claims.

All six surviving historical episodes remain protected. Their missing
workspaces/authority are not repaired or invented. No ordinary edit/save access
is certified for them. The discovered Hammer playback case and disposable
Anvil episode remain the hosted acceptance controls; this candidate performs no
hosted recording, edit, ownership repair or media replacement. Existing
authorized playback must be checked through its actual Tongs/signing path,
not inferred from a service-role download or a different Storage policy.

## Rollout and recovery boundary

Before any release: verify the exact save-concurrency candidate, approve the
empty-B1/real-H predecessor solution without rewriting frozen history, certify
both lineages and the exact combined application candidate, and review exact
migration/registration hashes. Coordinate with the pending Storage lifecycle
and webhook release; do not create a competing Stripe path. Anvil PR #88
remains separately gated.

Before any hosted action: revalidate current main, installed lineage/head,
all 475 provider identities and bodies, actor authority, historical reference
graphs and integrity exceptions. Obtain recovery readiness and exact owner
authorization for a governed migration executor. No hosted executor or token
is supplied by this candidate. Schema installation alone excludes no objects.
Observation and approval are separate hosted writes requiring their own review.

The before/after acceptance plan must cover every preserved object/reference,
normal authorized reads and playback, negative access cases, legitimate saves
and manifest updates, concurrency/retry, new-write enforcement, and unchanged
financial state. Unresolved historical authority remains a hold. No automatic
attribution or quarantining is a fallback.

Retain evidence on failure. Do not delete objects, restore stale bytes over
newer content, reverse frozen migrations, or blindly revoke an exclusion.
Revocation can restore accounting holds and requires a reviewed capacity impact
decision. Any corrective DDL uses a reviewed forward migration.

Historical accounting does not restore Test-mode capacity. The existing Anvil
owner's recognized capacity remains zero until the ordinary approved Test
subscription/service-period path establishes it. The Storage webhook's fenced
refresh and zero-total-period handling still needs its own certification and
release. No Stripe, entitlement or customer balance operation is included.
