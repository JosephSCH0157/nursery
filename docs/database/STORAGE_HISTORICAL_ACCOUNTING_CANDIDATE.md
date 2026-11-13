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
`.git/forge-storage-investigation-20261113/accounting-repair`, excluded from
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
- **The concurrent shared-manifest regression fails:** two interleaved file
  saves can both report success while the final manifest drops one reference.
  The accounting exception does not make that existing multi-transaction save
  protocol atomic. The failing test is included in normal Tongs test commands,
  not skipped or marked expected-to-fail. A reviewed serialization/fencing and
  recovery contract is required before claiming concurrent episode saves are
  certified. A process-local mutex is insufficient across servers/tabs.
- **Full B1 bootstrap fails before this migration**, at immutable
  `20261104143249_align_provider_requests_and_luna_financial_authority.sql`:
  `reviewed Luna predecessor policy changed`. No frozen SQL or historical
  evidence is changed to bypass that gate. A synthetic operational predecessor
  is not equivalent to an empty, financially inactive B1 installation.
- Authentic historical financial predecessor certification remains unresolved;
  no complete H-through-445 upgrade or complete B1-through-445 pass is claimed.
  Existing older historical receipts cannot certify this candidate.

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

All six surviving historical episodes remain protected. Their missing
workspaces/authority are not repaired or invented. No ordinary edit/save access
is certified for them. The discovered Hammer playback case and disposable
Anvil episode remain the hosted acceptance controls; this candidate performs no
hosted recording, edit, ownership repair or media replacement. Existing
authorized playback must be checked through its actual Tongs/signing path,
not inferred from a service-role download or a different Storage policy.

## Rollout and recovery boundary

Before any release: resolve the failing save-concurrency gate, approve the
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
