# H444 acquisition authorization package

**NOT APPROVED — EXECUTION PROHIBITED**

Temporary-principal preparation: the separately gated
[H444 temporary-principal procedure](H444_TEMPORARY_PRINCIPAL.md) adds a v2
approval contract for `forge_h444_acquire_01`. It requires fresh candidate-bound
owner approval, exact role/OID/effective-privilege review and separately approved
provisioning, enrollment and cleanup. Prior observation/authentication approvals
and expired acquisition windows do not authorize it.

This is an unsigned decision document, not an approval, credential, executable
plan or instruction to contact the source. No authorization token or approval
digest has been issued. All unresolved fields below block acquisition.

Preserved proposal commit: e45cb767ab4cd30b6c1acf67e8d1b8a2f6f9cd0e.
Proposal source candidate: 660a8d62732393a5e61e72d1a6fa9658c3c53f81.
References: [certification proposal](STORAGE_H444_447_CERTIFICATION.md),
[evidence discovery](H444_EVIDENCE_DISCOVERY_2026-11-20.md),
[governed operations](../DATABASE_OPERATIONS.md).

This separate draft is not included in the three-document preservation commit.
The existing H444-to-446 contracts, migration hashes, owner stops and consumed
authorizations remain unchanged. This package does not authorize restoration,
cloning, migration 445/446/447 execution, H/B1 certification, financial operations,
Stripe access, historical-object changes, new infrastructure, merge or deployment.

## Data classification and simplified security profile

Documentation amended 2026-11-21 at the owner's request. The owner confirms that
Forge is prelaunch, with no registered customers or customer information, and
describes its data as non-sensitive. This is an **owner-declared classification**,
not a source inspection, empty-table finding or proof that credentials are absent.
Expected evidence is internal prelaunch/test configuration and operational data.

Schema/manifest inspection establishes field types, not current values. Contact
fields, scripts, JSON metadata, SQL definitions and migration statements remain
uninspected. Financial prices, budgets and Stripe object IDs are not inherently
credentials; subscription fencing UUIDs are not OAuth refresh tokens. Acquisition
credentials, encryption keys, Auth secrets and provider credentials remain secret
regardless of customer count or Test mode. Exclude secret values, including
encrypted provider credential payloads, and screen required schema/history/data.
Unexpected personal information, a contradicted classification or required
secret-bearing evidence causes a review hold; never silently redact required bytes.

The proposed profile uses the existing trusted Windows workstation, verified TLS,
read-only source access, an exact reviewed extraction allowlist, encrypted output
and an owner/SYSTEM-only unused destination. Proposed encryption is owner-managed
**AES-256-GCM with Windows DPAPI CurrentUser wrapping**, subject to offline
verification and documented, tested recovery. No separate RSA recipient or
independent key custodian is required by this profile. Independent review of the
evidence and approval of its exact package digest remain mandatory. See the
[confidential-output design](H444_CONFIDENTIAL_OUTPUT_DESIGN.md).

Whole-workstation hardening is not a blanket prerequisite. Instead, before any
acquisition the owner must explicitly record acceptance (or require mitigation)
of paging, hibernation, crash/diagnostic persistence, unverified volume encryption,
same-account/elevated access and incomplete memory erasure. The record must cover
**transient acquisition credentials and encryption keys as well as the payload**;
calling the payload non-sensitive is not acceptance of those secret exposures.
Unknown protection stays unknown. No strict no-plaintext-on-disk claim is made.
If that guarantee is required, the existing workstation is not verified suitable.

Required risk record: named owner/operator and Windows account/host; exact
procedure/allowlist/destination; each accepted risk and scope; required process
controls; recovery/retention arrangements; approval reference and UTC expiry.
**Residual-risk acceptance: NOT RECORDED.** This request authorizes documentation
amendment only. It neither accepts these risks nor issues acquisition permission.

## Exact source and permitted evidence boundary

| Item | Proposed requirement / current evidence |
| --- | --- |
| Authentic source | Supabase project wtvdjndyxegudufrompx; PostgreSQL database postgres; lineage historical-v1. This identifies the intended source, not verified present access. |
| Required source state | Exactly the approved 444-version prefix, ending 20261111201029. Before any future acquisition, verify the genuine private lineage marker and complete history against the pinned prefix. |
| Last preserved preparation observation | 2026-11-14T00:18:07.000318Z in .git/forge-pr89-h444-446-preparation/source-metadata.json. Its version list matches H444, but it is not a current read or complete snapshot. |
| Current source head, availability and access | NOT VERIFIED. No connection made for this document. If the source has advanced, stop; never roll back, relabel or manufacture H444. A suitable existing historical backup would require its own reviewed provenance/method decision. |
| Proposed acquisition class | Read-only, transaction-consistent logical evidence export to encrypted restricted files. Method selection and exact implementation are UNDECIDED and NOT APPROVED. A physical-backup route requires a separately specified package; restoration or cloning is not an acquisition shortcut. |
| Owner-approved object set | The preserved 475-object inventory, 447,475 bytes. Inventory SHA-256: 7e2813b2774533a5d84330e393923a23e6e17e8efabef2504683d822966e7b07. Byte-receipt SHA-256: 5fdc1e5a24be1530acfc9b9975ba96bbec4370bbe249d43d33ceb512a89ae154. These are integrity references, not authorization for new reads or changes. |

Required authentic data, subject to a reviewed exact extraction allowlist:

- Source schema/catalog and dependencies, roles and membership metadata,
  explicit/default ACLs, ownership, policies/RLS, triggers, functions, views,
  extensions and actual private lineage marker. Include external-effect inventory
  metadata while excluding secret values and executable credentials.
- Complete supabase_migrations.schema_migrations rows for the 444-prefix:
  version, statements, name, created_by, idempotency_key and rollback; preserve
  original values, nulls, types, ordering and independently recomputed digests.
- Actual required financial authority rows and dependencies: the exact pricing,
  rollout, cost-policy and rate-condition selectors in the preserved proposal.
  Include the necessary journal, subscription, receipt, entitlement and authority
  data/fingerprints to establish fidelity and unchanged financial state. Keep
  financial environment Test; do not initialize, refresh or fabricate authority.
- The related workspace, episode, registry, ownership and identity relationships
  necessary to establish original access and provenance, with explicitly approved
  column exclusions. Missing historical relationships remain missing and documented.
- Storage metadata and references for the exact approved original identities,
  including provider versions, byte sizes, eTags, owner fields, user metadata,
  historical identity timestamps and disposition. Reconcile retained body digests
  and original read receipts to the source snapshot; do not infer this binding
  merely because the local files passed a checksum test.

The prior 88-table extraction manifest is an input
to review, not a current approved export scope or proof that every required
dependency is included. Its SHA-256 is
9de7485012819a3b5b6fb5b70deb56229e176bd556200932e9b891bfd65e9614.
The owner must approve a complete table/column/dependency allowlist and exclusions
bound to the chosen procedure before any access. Do not expand scope at runtime.

Correction: that pinned manifest **includes**, rather than excludes,
`auth.users.email`, `auth.users.phone`, `tongs.billing_customers.email` and
`tongs.beta_access_applications.applicant_email_normalized`. No claim is made
about their contents. Any new contact-field exclusion requires a reviewed
projection preserving required identity/dependency evidence; the preserved
manifest itself remains unchanged.

## Consistent snapshot, provenance and deliverables

A logical acquisition must produce the six existing contract artifacts:
schema.sql, data.sql, supabase-migrations-schema.sql,
supabase-migrations-data.sql, role-and-acl-manifest.json and
snapshot-consistency.json. Require exact file membership, nonempty payloads,
byte sizes, SHA-256 hashes, schema/tool versions and restrictive file ownership.

Use one authenticated read-only transaction snapshot for the database export and
the source lineage/history/financial/Storage-metadata observations. If multiple
connections are necessary, the reviewed method must prove they share the same
snapshot. Record source project/database, immutable snapshot or backup identity,
UTC start/completion times, transaction-snapshot mechanism, exact query/exporter
digests, candidate/manifest identity and complete artifact digest set. Secret
screening must preserve approved historical fields or stop for review; silent
redaction that breaks six-column history or financial fidelity is unacceptable.

Storage bytes are outside PostgreSQL snapshot atomicity. Prefer reusing the
already-preserved bodies only after exact version/size/hash/metadata reconciliation
to that snapshot. The owner must decide whether acquisition permits any new
version-specific Storage GETs. No such GET is approved here. If current object
versions differ, immutable version reads are unavailable, or concurrent changes
prevent proof, stop. Do not write a fence, modify object metadata, repair ownership,
replace bodies, or silently substitute a current object for an approved original.

Deliver an encrypted restricted artifact bundle, source observation, export and
consistency receipts, exact financial/history/Storage fingerprints, complete
artifact manifest and a sanitized summary. Retain evidence of source read-only
enforcement and any errors. This phase must produce no target observation,
restoration receipt, behavior certificate or H/B1 parity claim.

## Restricted destination and isolation

Destination host, absolute private path, operator identity, encryption key custody
and access-control evidence are **UNDECIDED**. A location under the canonical
repository's access-restricted .git private-evidence area may be reviewed, but no
new destination has been created or approved. Existing .git evidence must never
be overwritten. The final path must be excluded from Git, application serving,
deployment, cloud sync and general backup/export jobs.

Approve an exact unused path/run identity, authenticated output encryption and
verified TLS, owner-only access (and required SYSTEM access on Windows), named
owner key custody, tested recovery and available capacity. Require no deliberate
plaintext artifact/temp files, no credential-bearing arguments or raw payload
logs, and bounded sanitized diagnostics. These process controls must be verified.
Host paging/dump/hibernation and elevated-access risks follow the explicit
acceptance record above; administrative hardening is not automatically required.
Missing mandatory controls or missing risk acceptance stops acquisition.

The acquisition destination stores inert encrypted files only. Do not import or
execute captured SQL, instantiate a database, run triggers/webhooks, start workers
or contact Stripe/providers from captured metadata. Restrict any future network
access to the explicitly approved source endpoint(s) and destination transport;
no unreviewed fallback host or public URL. Pre-import isolation for a later restore
is a separate approval and must not be claimed from acquisition-file isolation.

## Credential handling and confidentiality

Source principal, existing read-only credential availability and necessary grants
are **NOT VERIFIED**. Owner approval must name the credential authority and
approved handling mechanism without putting secrets in this document. Use the
least privilege capable of the reviewed export; verify read-only enforcement.
If access requires role creation, privilege changes, credential enrollment or
rotation, stop and request a separate administrative decision. No source mutation
is implicitly permitted to make acquisition possible.

Do not reuse the revoked Gate 5F token or consumed migration/deployment approvals.
Do not use passwordless linked CLI commands that may create/rotate a temporary
role. Do not expose passwords/tokens in command arguments, files, logs, PR comments
or generated examples; clear process-scoped secrets in the reviewed cleanup path.
Production API credentials, private keys, Vault root keys, refresh tokens and
provider secrets must not enter the logical package. Record role definitions and
ACLs without password verifiers. Any required secret-bearing row whose exclusion
would invalidate fidelity is a scope-review blocker, not permission to export it.

## Infrastructure costs and retention

**No spending commitment, budget or retention deadline is approved.** No new
resource is proposed as an automatic prerequisite. Existing infrastructure may
only be used after its owner confirms suitability; availability is not assumed.

| Cost component | Present estimate / decision needed |
| --- | --- |
| Supabase export/egress | Current price, included allowance and complete export size NOT VERIFIED. A current bounded estimate is required before acquisition. |
| Local compute/storage/encryption | No new infrastructure provisioned. Existing capacity, key custody and any incremental cost need owner confirmation. |
| New project, restore, clone or cloud worker | Excluded from acquisition scope; no authorization or cost commitment. Any proposed necessity requires a new plan. |
| Retention, backup and disposal | Destination-dependent and UNDECIDED; include any charge in the approved ceiling. |

Historical sizing reference only: the preserved 2026-11-14 RESOURCE_ESTIMATE.json
described an 88-table projection with 12,276 rows, 12,915,451 payload bytes,
2,915,048 function-definition bytes, a 32 MiB transfer allowance and a 128 MiB
payload limit. Its then-assumed egress price was USD0.09/GB, yielding about
USD0.00302 for 32 MiB or USD0.01208 for 128 MiB before uncounted traffic/overhead.
Its proposed USD0.02 ceiling and 24-hour window were historical proposals, not
approval for this task. These figures are neither a current quote nor an estimate
for the complete six-artifact export. No pricing lookup was performed.

Before approval, supply the chosen method's measured or justified size estimate,
current rate/allowance evidence, overhead/tax treatment, stop-before-exceeding byte
and spend ceilings, and a named payer. If those are unavailable, acquisition stays
blocked. Do not claim zero cost because credentials or infrastructure already exist.

Owner must set a UTC approval expiry, acquisition time window, maximum payload,
retention deadline, designated custodian, review date and exact disposal/renewal
procedure. Expiry stops acquisition and does not authorize deletion of preserved
evidence. Preserve failures under the approved restricted handling policy; any
deletion must follow an explicit exact-artifact authorization. Prior evidence
and all 475 original bodies remain protected.

## Independent approval and owner decisions

| Required decision | Current state |
| --- | --- |
| Source access and read-only principal; current H444 eligibility | UNDECIDED / NOT VERIFIED |
| Logical versus separately specified physical evidence method | UNDECIDED |
| Exact exporter/query package and reviewed table/column/dependency scope | UNDECIDED |
| Reuse-only Storage bodies versus any new version-specific reads | UNDECIDED; no new reads authorized |
| Destination host/path, encryption and process controls, owner key custody and tested recovery | UNDECIDED; AES-256-GCM + DPAPI CurrentUser proposed |
| Explicit workstation residual-risk acceptance, including transient credentials/keys | NOT RECORDED; documentation amendment is not acceptance |
| Cost estimate, payer, hard byte/spend ceilings | UNDECIDED; no approved amount |
| Named operator, start window, expiry, retention and disposal owner | UNDECIDED |
| New authorization addressing prior stop and consumed permissions | NOT ISSUED |
| Independent review and digest approval of acquired artifacts | NOT POSSIBLE until an authentic package exists |

Use two distinct approval events. First, the owner independently approves the
exact acquisition procedure/package hash, source, destination, scope, safeguards,
budget and window. This must be a new bounded authorization expressly addressing
the prior stopped work; this draft does not cancel that stop. An agent must not
generate an owner signature, token or approval reference.

Second, after an authorized acquisition, an independent reviewer verifies the
artifact bytes, provenance, consistency and original state, and the owner supplies
approval of the exact complete package digest through the approved channel.
Self-computed hashes or successful offline parsing are not independent approval.
Neither event authorizes restoration/certification: those require a separate
exact-candidate, 447-capable procedure/adapter and reviewed execution approval.

## Mandatory stop conditions

Stop before acquisition if any decision/approval above is missing, expired or
inconsistent, or the old owner stop has not been expressly addressed by a new
authorization. Stop during a separately authorized attempt on:

- Wrong project, ambiguous lineage, non-H444 head, incomplete history, changed
  manifest, missing required financial authority or unexpected financial mode.
- Snapshot disagreement, incomplete artifacts, unknown scope/dependency,
  unverified provenance, failed secret screen or changed original Storage identity.
- Inadequate read-only privilege, required source writes, credential-role side
  effects, unknown endpoint, isolation/confidentiality failure or secret exposure.
- Missing budget/retention controls, exceeded limits, unavailable encrypted
  capacity, expired approval, interruption or unexpected result.
- Any request to repair historical relationships, fabricate financial rows,
  reopen a consumed approval, restore/clone, run certification or deploy.

Retain bounded sanitized failure evidence and stop. Do not retry automatically,
broaden extraction, switch credentials/methods/destinations or acquire replacement
state without new review. No acquisition commands are included in this document.

**NOT APPROVED — EXECUTION PROHIBITED. Stop at document preparation.**
