# Hammer → Quench Canonical Release Commit Implementation Plan

Release baseline: **Forge v1.2.0 Fire Burning** (`forge-v1.2.0`).

Status: **Slice 0 contract direction approved; database implementation remains unauthorized pending contract-table review**

Working name: **One Release, One Identity**

## 1. Decision Summary

Introduce one canonical, immutable, generation-bound **Hammer Release Commit** as the only authoritative object transferred from Hammer to Quench.

The release commit is certified by Tongs and binds one exact release generation to:

- workspace and workpiece identity
- recording revision and Hammer composition/release basis
- prepared-package fingerprint
- canonical release manifest bytes and hash
- transcript artifact identity and hash
- SRT artifact identity and hash, when present
- VTT artifact identity and hash, when present
- visual-authority artifact identity and hash
- canonical final-audio asset identity and hash
- canonical final-video asset identity and hash, when applicable
- readiness evidence and the contract versions used to evaluate it

Quench must open a specific `release_commit_id`. It must never infer handoff authority from the latest manifest or from mutable workpiece paths.

## 2. Problem Statement

The current boundary has several independently meaningful identities:

```text
prepared package P1
  -> current manifest M?
  -> transcript/captions/visuals at mutable paths
  -> canonical final audio A1
  -> optional canonical final video V1
```

Tongs can freeze exact manifest bytes, and Quench can freeze an immutable review-open receipt, but the manifest does not prove that all companion artifacts belong to the same release generation. This permits generation ambiguity such as `P1 + M2 + captions C3` even when every individual component is otherwise valid.

The missing architectural primitive is one canonical identity that proves exactly which release generation crossed the Hammer → Quench boundary.

## 3. Goals

1. Make one `release_commit_id` the sole canonical handoff identity.
2. Make release certification atomic and database-authoritative.
3. Make every release member immutable or generation-addressed and hash-bound.
4. Allow a structurally valid `needs_review` release to be committed and opened without permitting publication.
5. Ensure Quench opens the exact release commit selected by Hammer or the operator.
6. Preserve refresh, retry, navigation, and multi-device correctness through Supabase.
7. Keep provider execution and Quench publication authority unchanged except where they consume the new release identity.
8. Fail closed on missing, mismatched, stale, or unverifiable release members.

## 4. Non-Goals

This campaign does not:

- implement live YouTube, RSS-host, or other provider side effects
- make Hammer wait for a browser or human to open Quench
- replace Quench release decisions or publication-operation authority
- allow `needs_review` releases to publish
- use `localStorage`, `sessionStorage`, URL parameters, or local files as canonical persistence
- redesign Hammer editing, rendering, or general artifact persistence outside the release boundary
- silently migrate legacy packets into certified release commits

## 5. Canonical Semantics

### 5.1 Separate integrity from readiness

The contract must represent three distinct questions:

| Domain | Question | Canonical result |
| --- | --- | --- |
| Bundle integrity | Is this exact release generation complete, internally coherent, and verifiable? | `certified` or fail closed |
| Editorial readiness | What unresolved release-review posture remains? | `ready`, `needs_review`, `blocked` |
| Publication readiness | May a provider side effect execute? | true only when all publication gates agree |

A `needs_review` release may be integrity-certified and opened in Quench. It must remain publication-blocked.

### 5.2 Canonical lifecycle

```text
editing
  -> preparing_release
  -> release_commit_failed
     or release_commit_certified
  -> opened_in_quench                 (separate durable fact)
  -> release_decision_committed
  -> publication_authority_established
  -> publication_attempt_reserved
  -> publication terminal outcome
```

Hammer succeeds at `release_commit_certified`. It does not wait for `opened_in_quench`.

### 5.3 Terminology

- **Release member:** one exact artifact or canonical asset bound into a release commit.
- **Release commit:** immutable Tongs authority binding all release members and readiness evidence.
- **Release certification:** the atomic server-side operation that verifies members and creates or replays a release commit.
- **Quench open authority:** immutable receipt proving that one user opened one exact release commit for review.

## 6. Proposed Contract

Create the shared contract in `packages/contracts`, with Hammer and Quench consuming the same version.

Illustrative shape:

```ts
type HammerReleaseCommitReadiness = "ready" | "needs_review" | "blocked";

type HammerReleaseMemberKind =
  | "manifest"
  | "transcript"
  | "captions_srt"
  | "captions_vtt"
  | "visual_authority"
  | "final_audio_master"
  | "final_video_master";

interface HammerReleaseMemberAuthority {
  kind: HammerReleaseMemberKind;
  required: boolean;
  authority_type: "workpiece_file" | "canonical_asset";
  authority_id: string;
  revision: number | null;
  content_hash: string;
  byte_length: number | null;
  media_type: string | null;
  generation_path: string | null;
}

interface HammerReleaseCommitAuthorityV1 {
  contract_version: "forge.hammer-release-commit.v1";
  release_commit_id: string;
  release_commit_hash: string;
  workspace_id: string;
  workpiece_id: string;
  recording_revision_id: string;
  composition_revision: number;
  prepared_package_fingerprint: string;
  readiness: {
    editorial_status: HammerReleaseCommitReadiness;
    ready_for_quench_review: boolean;
    ready_for_publication: boolean;
    reason_codes: string[];
    evidence_hash: string;
  };
  members: HammerReleaseMemberAuthority[];
  certified_by: "tongs";
  certified_at: string;
}
```

`prepared_package_fingerprint` is absorbed commit evidence, not the identity of a separate authoritative package member. A full preparation document may be retained only as explicitly non-authoritative supporting evidence bound by hash.

The final contract must define canonical serialization, hash ordering, nullable-member rules, and compatibility behavior. Object insertion order must not affect identity.

## 7. Invariants

The implementation is incomplete unless all invariants hold.

1. A release commit belongs to exactly one workspace and workpiece.
2. Every member belongs to the same workspace/workpiece authority boundary.
3. Every required member is present and hash-verified during certification.
4. A canonical asset member binds both asset ID and content hash.
5. A workpiece-file member binds file ID/path, exact revision, and content hash.
6. Member paths are generation-addressed or content-addressed; fixed mutable release paths are not authoritative members.
7. The prepared package and manifest are members of the same commit.
8. The manifest may describe members, but it is not the authority that certifies them.
9. Repeating the same certification operation with the same fingerprint replays the original commit.
10. Reusing an operation ID with different inputs returns an idempotency conflict.
11. A certified release commit is immutable.
12. New Hammer preparation creates a new release commit; it never mutates an old one.
13. Quench open authority binds an exact release commit ID and hash.
14. Navigation cannot retarget an existing Quench review to a newer release commit.
15. `needs_review` may be certified and opened, but cannot establish publication authority.
16. `blocked` cannot be certified as ready for Quench review unless the contract explicitly defines a diagnostic-only posture; no implicit override exists.
17. URLs and browser storage may recover an ID but cannot create or alter authority.

## 8. Persistence and RLS Design

**This plan requires a DB migration and RLS update.**

### 8.1 Proposed tables

#### `tongs.hammer_release_commits`

Immutable parent authority containing:

- `id`
- `workspace_id`
- `workpiece_id`
- `certification_operation_id`
- `operation_fingerprint`
- `contract_version`
- `release_commit_hash`
- recording/composition identity
- prepared-package fingerprint
- editorial readiness status
- Quench-review and publication flags
- readiness evidence JSON and hash
- actor and timestamp

Required uniqueness:

- unique certification operation ID
- unique release-commit hash within the workpiece
- composite identity suitable for foreign keys from Quench authority

#### `tongs.hammer_release_commit_members`

Immutable child rows containing:

- release commit ID
- stable member kind
- required flag
- authority type
- workpiece-file or canonical-asset identity
- exact revision where applicable
- SHA-256 content hash
- byte length/media type
- generation-addressed path where applicable
- deterministic member ordinal

Required uniqueness:

- one member kind per release commit unless the contract explicitly permits a collection
- exact authority tuple unique within a release commit

#### Quench open-authority evolution

Evolve or replace `quench_open_authority_receipts` so the receipt binds:

- `release_commit_id`
- `release_commit_hash`

Manifest snapshot ID may remain as derived compatibility evidence during migration, but must not be the primary handoff identity.

### 8.2 RLS and grants

- Authenticated viewers may read release commits and members for accessible workspaces.
- Direct inserts, updates, and deletes are revoked from authenticated clients.
- Certification is available only through a security-definer RPC and requires editor role.
- Open authority requires viewer role.
- Tables use immutable update/delete rejection triggers.
- Service-role artifact verification must not allow caller-supplied hashes to bypass canonical readback.
- Workspace/workpiece membership is checked before returning idempotent replay data.

### 8.3 Migration posture

- Do not rewrite legacy manifest snapshots as release commits.
- Legacy reviews remain readable under their legacy contract if required.
- New Hammer sends use only release-commit certification after the feature gate is enabled.
- Quench must visibly distinguish legacy manifest authority from certified release-commit authority during rollout.
- No fallback from a missing release commit to "latest manifest" is allowed in the new path.

## 9. Atomic Certification RPC

Add an RPC conceptually named `tongs.certify_hammer_release_commit(...)`.

The RPC or its trusted server coordinator must:

1. Authorize the actor and verify workspace/workpiece agreement.
2. Resolve the exact recording and composition basis.
3. Lock or otherwise establish a consistent read boundary for referenced rows.
4. Read every proposed workpiece-file member from canonical Tongs authority.
5. Verify exact revision, storage object bytes, and SHA-256 hash.
6. Resolve every canonical asset member and verify asset ID/hash/readiness.
7. Verify prepared-package and manifest identity agreement.
8. Verify readiness evidence and contract compatibility.
9. Derive deterministic member ordering and release-commit hash.
10. Insert the parent and all members atomically.
11. Return `certified`, `replayed`, `blocked`, or `idempotency_conflict` with structured diagnostics.

No partial commit may survive a failed transaction.

## 10. Artifact Addressing

Replace authoritative reliance on fixed paths such as:

```text
hammer/release-packet/transcript/transcript.txt
hammer/release-packet/captions/episode.srt
hammer/release-packet/captions/episode.vtt
hammer/release-packet/visuals/placements.json
hammer/release-packet/manifest.v1.json
```

with generation-addressed paths, for example:

```text
hammer/releases/<release-generation-id>/prepared-package.json
hammer/releases/<release-generation-id>/manifest.json
hammer/releases/<release-generation-id>/transcript.txt
hammer/releases/<release-generation-id>/captions.srt
hammer/releases/<release-generation-id>/captions.vtt
hammer/releases/<release-generation-id>/visual-authority.json
```

The final naming scheme must use a server-validated generation identity. Client-generated paths alone do not establish authority.

Legacy convenience aliases may exist only as non-canonical projections after certification. Quench must never use them for authority.

## 11. Work Slices

### Slice 0 — Contract lock and conflict register

Deliverables:

- Shared release-commit contract and canonical hashing rules.
- Field inventory mapping every current Hammer/manifest/Quench identity to its target member.
- Conflict register for legacy manifest snapshots, prepared packages, and fixed artifact paths.
- Explicit readiness truth table.
- Decision on optional SRT/VTT and audio-only versus video releases.
- Acceptance fixtures for `ready`, `needs_review`, and each blocked integrity case.

Exit gate:

- Hammer, Tongs, Quench, and publication consumers agree on one identity and vocabulary.
- No migration or runtime code begins before this gate.

### Slice 1 — Immediate behavioral repair

Deliverables:

- Fix `needs_review -> confirm` so packet validation permits persistence with review evidence.
- Keep Quench ingestion at `needs_review`.
- Keep publication fail-closed.
- Change Hammer success language from `Sent to Quench` to `Release package saved` or, after certification lands, `Ready for Quench`.
- Add focused integration regression coverage.

Exit gate:

```text
needs_review
  -> explicit confirmation
  -> packet/release material persists
  -> Quench observes needs_review
  -> publish guard returns false
```

This slice is intentionally small and must not pretend to solve generation authority.

### Slice 2 — Database authority foundation

Deliverables:

- Migration for release commits, members, immutability triggers, indexes, RLS, grants, and deletion behavior.
- Certification RPC with idempotency and structured failure codes.
- Generated database types.
- SQL tests for authorization, atomicity, replay, conflicts, immutability, and cross-workspace rejection.

Exit gate:

- A complete fixture certifies atomically.
- Any missing or mismatched member leaves no parent or child rows.
- Same operation replays; changed inputs conflict.

### Slice 3 — Hammer generation-addressed production

Deliverables:

- Produce prepared package, manifest, transcript, captions, and visual authority under one generation prefix.
- Carry final audio/video canonical IDs and hashes without copying media authority into mutable JSON.
- Replace the sequential fixed-path handoff save with staging plus certification.
- Surface structured certification failures in Hammer.
- Persist returned release commit ID/hash in canonical Tongs state, not browser state.

Exit gate:

- Hammer reports success only after Tongs returns certified/replayed release authority.
- Refresh and another device can recover the certified release from Supabase.

### Slice 4 — Exact Quench open authority

Deliverables:

- Quench route accepts `release_commit_id` only as a routing hint.
- Server reads and verifies the release commit from Tongs.
- Open-authority receipt binds exact release commit ID/hash.
- Quench projection resolves members from the commit, never latest mutable paths.
- Newer release availability is shown without retargeting the current review.
- Explicit operator action creates a new open operation for a newer release.

Exit gate:

- Opening R1 while R2 exists still yields R1.
- Refresh yields the same R1 authority.
- A missing/mismatched R1 member fails closed.
- No new-path code calls "latest manifest" as fallback.

### Slice 5 — Release decisions and publication bridge

Deliverables:

- Bind Quench release decisions to release commit ID/hash.
- Bind publication operations to release commit ID/hash.
- Preserve manifest snapshot fields temporarily only if required for compatibility.
- Reassert that publication requires certified integrity plus editorial `ready` plus existing destination/decision/capability gates.

Exit gate:

- Publication authority cannot be established from legacy path aliases or an unbound manifest.
- Existing operation/attempt idempotency and retry semantics remain intact.

### Slice 6 — Browser, race, refresh, and recovery acceptance

Deliverables:

- Hammer send → Tongs certify → Quench open browser test.
- Two rapid Hammer releases before Quench open.
- New release produced while R1 is open.
- Refresh and multi-tab recovery.
- Prepared package/manifest/artifact cross-generation mismatch attempts.
- Failure injected after every staged artifact write and during certification.
- Concurrent certification replay and conflict tests.
- Legacy/new feature-gate transition tests.

Exit gate:

- No tested route can yield P1/M2/C3 identity mixing.
- No failure produces a partially certified release.
- Browser recovery never manufactures authority.

### Slice 7 — Legacy retirement and canonical documentation

Deliverables:

- Update `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md` or introduce its approved lifecycle successor covering Hammer → Quench.
- Mark manifest-only open authority as legacy.
- Remove new-runtime fallbacks to fixed release paths/latest manifest.
- Add architecture ratchets preventing reintroduction.
- Produce deployment and rollback runbooks.

Exit gate:

- The release commit is the only supported authority for new handoffs.
- Documentation, types, runtime behavior, and database constraints agree.

## 12. Readiness Truth Table

| Integrity | Editorial status | Certify commit | Open in Quench | Establish publication |
| --- | --- | ---: | ---: | ---: |
| invalid | any | no | no | no |
| certified | blocked | policy decision required; default no | diagnostic-only only if explicitly contracted | no |
| certified | needs_review | yes | yes | no |
| certified | ready | yes | yes | yes, subject to all existing Quench gates |

Slice 0 must resolve whether certified+blocked commits are retained as diagnostic receipts or rejected before parent creation. The decision must be explicit; runtime code must not improvise it.

## 13. Failure Codes

The contract should define stable failure families, including:

- `release_identity_mismatch`
- `release_operation_idempotency_conflict`
- `release_contract_incompatible`
- `release_member_missing`
- `release_member_revision_mismatch`
- `release_member_hash_mismatch`
- `release_member_authority_unready`
- `release_recording_revision_mismatch`
- `release_prepared_package_manifest_mismatch`
- `release_readiness_evidence_mismatch`
- `release_commit_not_found`
- `release_commit_hash_mismatch`
- `release_commit_immutable`

Failures must identify the affected member kind without leaking inaccessible cross-workspace data.

## 14. Test Matrix

### Contract tests

- Canonical member ordering and hashing.
- Optional member rules.
- Readiness separation and monotonicity.
- Unknown contract versions fail closed.

### Database tests

- Viewer/editor/outsider/service-role behavior.
- Cross-workspace and cross-workpiece substitution.
- Atomic rollback on every failed member.
- Idempotent replay and changed-input conflict.
- Immutable parent/member/open receipts.
- Workspace/workpiece deletion semantics.

### Hammer tests

- Confirmed `needs_review` persists review evidence.
- No success before certification.
- Generation paths do not collide.
- Canonical audio/video identity is preserved.
- Structured certification errors map to truthful UI states.

### Quench tests

- Exact R1 open with R2 current.
- Refresh retains R1.
- URL ID disagreement with DB authority fails closed.
- Missing or tampered member fails open-authority construction.
- `needs_review` opens but cannot publish.

### End-to-end tests

- Happy-path audio-only release.
- Happy-path video release.
- Partial staging failure.
- Certification race.
- Hammer resend race.
- New package notification without implicit retarget.
- Multi-tab and multi-device recovery.
- Publication operation remains bound to reviewed release commit.

## 15. Observability and Audit

Record structured events for:

- certification requested/certified/replayed/blocked/conflicted
- Quench release commit opened/replayed/conflicted
- newer release detected while an older commit remains open
- publication blocked by integrity or editorial readiness

Logs and telemetry may reference release commit IDs and hashes, but must not become canonical state.

Operational inspection should make it possible to answer:

1. Which release commit did Hammer certify?
2. Which exact members and hashes belong to it?
3. Which release commit did Quench open?
4. Which release decision reviewed it?
5. Which publication operation, attempt, and receipt derived from it?

## 16. Rollout Strategy

1. Land contract and tests behind no runtime behavior.
2. Land migration/RLS/RPC and verify in local/staging Supabase.
3. Dual-produce generation-addressed artifacts while legacy flow remains active, without treating dual output as dual authority.
4. Enable release certification for internal fixtures.
5. Enable Hammer certified-release UI behind a workspace feature gate.
6. Enable Quench exact-release open for certified releases.
7. Bind decisions/publication operations to release commits.
8. Disable new manifest-only handoffs.
9. Retire legacy fallback after audit and rollback window.

Rollback must disable new certification/open routing without deleting immutable release evidence. Never mutate or repurpose an existing release commit.

## 17. Locked Slice 0 Decisions

1. Structurally complete but editorially blocked bundles are persisted as immutable, diagnostic-only certified commits. Remediation always creates a new staging authority and release commit.
2. Caption policy is release-profile-specific. Audio captions are optional. Video SRT is required for publication but not integrity certification; VTT is optional. Every present caption member is generation-bound and hash-verified.
3. The exact output-selected transcript is mandatory for every certified release commit.
4. Tongs derives and evidences an immutable `audio_episode` or `video_episode` profile from canonical production facts. Video commits require canonical final audio and video masters; audio commits forbid a final-video member.
5. Prepared-package authority is absorbed into the release commit. A detailed preparation document may survive only as non-authoritative, hash-bound supporting evidence.
6. Freeze only identities necessary to prove the exported result: recording/adopted-take lineage, composition revision and fingerprint, editorial/output selection authority, render plan/job identity, and canonical final-master identities. Do not duplicate history-head authority unless reproducibility requires it.
7. Legacy manifest snapshots remain read-only audit evidence under explicit legacy APIs. They are never upgraded or used as certified-path fallback.
8. Tongs issues a DB-backed staging UUID with lifecycle `open -> certified | abandoned | expired`. Certification is terminal, and one staging authority can produce at most one release commit.
9. Integrity, identity, required-member, and determinism failures prevent certification. Deterministic quality concerns may permit `needs_review`; publication-only concerns cannot affect integrity certification. No user confirmation may downgrade an integrity failure into `needs_review`.
10. `opened_in_quench` remains immutable audit evidence only for this campaign. Hammer success ends at Tongs-certified `Ready for Quench`.

Machine-testable policy tables for decisions 2 and 9 live in `packages/contracts/hammer/release-commit.contract.ts`. Migration/RLS/RPC work must not begin until those tables and their tests are reviewed and accepted.

## 18. Definition of Done

This campaign is complete only when:

- Hammer receives an immutable release commit ID/hash from Tongs before reporting `Ready for Quench`.
- Every required release member is exact, generation-bound, and hash-verified.
- Certification is atomic and idempotent.
- Supabase is the sole canonical persistence authority.
- Quench opens an exact release commit and never silently selects latest manifest authority.
- Confirmed `needs_review` releases can be certified and reviewed but cannot publish.
- Release decisions and publication operations remain bound to the exact reviewed release.
- Race, refresh, partial-write, replay, RLS, and cross-generation tests pass.
- Legacy manifest-only fallbacks are removed from the new path.
- The canonical lifecycle documentation names and governs the Hammer Release Commit boundary.

## 19. Recommended Execution Order

1. Contract lock and review decisions.
2. Immediate `needs_review` contradiction fix and truthful UI language.
3. Migration, RLS, immutable tables, and certification RPC.
4. Hammer generation-addressed staging and certification integration.
5. Exact Quench release-commit open authority.
6. Release-decision and publication-operation binding.
7. Browser/race/refresh acceptance campaign.
8. Legacy retirement and canonical lifecycle update.
9. Only then resume live provider-side-effect work.
