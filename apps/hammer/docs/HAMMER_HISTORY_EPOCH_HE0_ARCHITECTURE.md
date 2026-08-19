# Hammer History Epoch HE-0 Architecture and Persistence Contract

## Decision

Hammer must preserve an unrecoverable divergent history ledger as immutable evidence, declare that ledger closed, and begin any future undo/redo history from the current canonical editor state as a new epoch. The predecessor is referenced but is never modified, merged, replayed through, or presented as traversable undo history.

**This requires a DB migration / RLS update.** The current generic artifact writer cannot provide immutable archival, unique epoch paths, atomic pointer compare-and-swap (CAS), idempotency, and an authoritative transition receipt. `tongs.recording_revisions.history_path` remains the active-history pointer, but its contract changes from a conventional fixed mutable document to the selected immutable epoch artifact.

HE-0 is a design record only. It authorizes no migration, application change, storage write, database write, production access, Florida open, or history reconstruction.

## Governing invariants

- Tongs/Supabase is the persisted single source of truth. Browser state, in-memory state, and local files are caches or evidence only.
- Workpiece, canonical recording, and recording revision identities remain the lifecycle authority defined by the Forge lifecycle canon.
- The existing divergent 208,379-byte ledger remains untouched evidence. No checkpoint, editor state, patch, or hash edge may be invented.
- Starting an epoch requires an authenticated user holding the workspace editor role and a deliberate, warned user action. Mount, reload, save, and recovery must never start one.
- Storage operations may stage candidate objects, but only the database transaction may make an epoch canonical.
- Every staged archive and epoch path is unique and write-once. No existing object or registry row may be overwritten.
- Undo and redo operate only inside the active epoch and cannot traverse its predecessor reference.

## Current architecture map

| Boundary | Current behavior | Epoch consequence |
| --- | --- | --- |
| Canonical editor state | `hammerWorkspaceShellHistoryController.ts` constructs the baseline from canonical transcript, timeline, placements, audio, authority, selection, and related state, then derives `hammer-state:*` with `hashEditorState()`. | The freshly reconstructed canonical state, not either divergent ledger, is the new epoch base. Component SHA-256 values must also be pinned independently of the 32-bit editor-state digest. |
| History verification | `verifyHammerHistoryAgainstCanonicalHead()` verifies the declared head, inverse replay to the declared base, and forward replay to the canonical head. A mismatch leaves the newly created baseline controller installed and rejects the persisted ledger. | Existing fail-closed behavior is correct. Divergence becomes an explicit recoverable product state, not permission to alter history automatically. |
| Revision pointer | `tongs.recording_revisions.history_path` is returned in the revision snapshot and determines whether Hammer attempts a revision-history read. | Keep this column as the single active pointer. After migration it may name a unique epoch path rather than the legacy fixed path. |
| Revision-history reader | `hammerRecordingRevisionPersistence.ts` reads the JSON at the actual `history_path`, but `loadHammerRevisionHistoryDocument()` in `hammerHistoryArtifactApi.ts` reconstructs `hammer/revisions/{revisionId}/history.v1.json`. The controller tests only whether the pointer is non-null and then calls that fixed-path reader. | The history API and controller must accept and read the exact server-returned pointer. They must validate that it belongs to the expected revision/epoch namespace and matches the envelope identities. |
| Revision-history writer | `saveHammerRevisionHistoryDocument()` sends a generic revision save. Tongs `resolveRevisionArtifactPath()` forces history to `hammer/revisions/{revisionId}/history.v1.json`. | Normal post-epoch saves cannot continue overwriting a fixed path. They must write the next immutable representation for the active epoch or use a separately designed epoch-ledger persistence rule. HE-1 must choose and test that rule without changing normal legacy histories prematurely. |
| Generic file commit | `commitFileBytes()` uploads the storage object, upserts `tongs.workpiece_files`, rewrites the manifest, and appends an event. Existing-path commits replace bytes. The optional `expected_previous_updated_at` check occurs before these separate effects. | This API is neither write-once nor a transaction spanning Storage and PostgreSQL. It must not serve as the canonical epoch transition boundary. Unique candidate uploads require create-only/conflict semantics and readback verification. |
| Revision save | `saveHammerRecordingRevision()` commits requested artifacts first and then updates `recording_revisions`. Only Composition V2 uses the revision `updated_at` predicate; a plain history save has no revision-row CAS. | Epoch creation needs a dedicated path. It must not call the multi-artifact save and hope its final pointer update succeeds. |
| Registry | `tongs.workpiece_files` is keyed by `(workpiece_id, path)` and carries hash, byte count, storage locator, monotonic revision, and timestamps. Updates mutate the row and advance its token/revision. | The commit RPC must validate exact staged registry rows. Immutability must be enforced for epoch/archive namespaces so later generic commits cannot mutate them. |
| Authorization | Workpiece-file reads are membership scoped; stronger mutations elsewhere use workspace roles and security-definer RPCs. | The epoch commit RPC must execute only for `auth.uid()` holding the workspace `editor` role. Ownership is not a substitute for that role check. Direct epoch/transition table writes must be denied. |
| UI status | History verification failure is currently reported as a status string; the canonical baseline remains inspectable. | Add a typed unrecoverable-divergence state, a single deliberate action, a confirmation summary, and a post-success archived-history notice. |
| Tests and generated types | History API/controller tests, revision persistence types, Tongs endpoint tests, migration tests, and `db.types.ts` assume the current pointer and artifact shapes. | HE-1 must update all affected contracts and prove normal histories remain unchanged. |

The principal one-history-per-revision assumptions are therefore the fixed path constant/builder in `hammerHistoryArtifactApi.ts`, the controller's boolean use of `recordingRevisionHistoryPath`, Tongs' `resolveRevisionArtifactPath("history")`, the generic revision-save request shape, tests asserting the fixed path, and the mutable `workpiece_files` row at that path. Composition V2 also embeds a separate `HammerCompositionHistoryV2`; it is not the divergent V1 ledger and must not be silently treated as, merged with, or advanced by this capability.

## Epoch envelope

The new artifact is canonical JSON with the following minimum contract. Field names are locked for the first implementation; HE-1 may add fields but may not weaken these meanings.

```json
{
  "schema": "forge.hammer-history-epoch",
  "schema_version": 1,
  "epoch_id": "uuid",
  "workspace_id": "uuid",
  "workpiece_id": "uuid",
  "canonical_recording_id": "uuid",
  "recording_revision_id": "uuid",
  "base": {
    "editor_state_hash": "hammer-state:........",
    "component_sha256": {
      "transcript": "64 lowercase hex",
      "visual_timeline": "64 lowercase hex",
      "visual_placements": "64 lowercase hex",
      "audio": "64 lowercase hex",
      "editorial_authority": "64 lowercase hex"
    }
  },
  "creation": {
    "reason": "legacy_history_unrecoverable",
    "created_at": "RFC 3339 UTC timestamp",
    "initiating_user_id": "uuid"
  },
  "predecessor": {
    "original_path": "relative workpiece path",
    "archive_path": "relative immutable workpiece path",
    "sha256": "64 lowercase hex",
    "bytes": 0,
    "registry_revision": 1,
    "registry_updated_at": "RFC 3339 UTC timestamp"
  },
  "history": {
    "entries": [],
    "undo_stack": [],
    "redo_stack": [],
    "checkpoints": []
  },
  "boundary": {
    "prior_history_status": "unavailable",
    "merged": false,
    "traversable": false,
    "statement": "Prior undo history is unavailable and was not merged into this epoch."
  }
}
```

The component set must cover every independently persisted input used to construct the canonical editor state. If HE-1 discovers an additional canonical component, it must be added before migration approval; omission is a preflight failure. The envelope bytes, their SHA-256, and every component hash must be reconstructed twice independently during the later production dry run.

## Paths and immutability

- Predecessor archive: `hammer/revisions/{revisionId}/history/archive/{predecessorSha256}.history.v1.json`
- New epoch: `hammer/revisions/{revisionId}/history/epochs/{epochId}.v1.json`
- Active pointer after commit: the exact new epoch path above

The archive path is content-addressed so a byte-identical archive request is recognizable without implying that a different predecessor may reuse it. The epoch ID is generated before staging and is bound into the idempotency fingerprint. Both namespaces require create-only registration: absence is required for a new upload; an existing object is acceptable only when its registered identity, SHA-256, size, content type, storage locator, and operation binding exactly match the request. Any mismatch is a conflict. Generic `commit-file` and generic revision-artifact saves must reject these namespaces.

The predecessor's original path is never deleted, overwritten, or repointed. If it is mutable, the archive copy supplies the immutable evidence reference; the epoch envelope records both locations. If repository review or preflight proves the original location is already write-once under equivalent enforcement, the archive registration may reference those same bytes, but skipping the content-addressed evidence record requires explicit proof in the later authorization package.

## Exact persistence boundary

PostgreSQL cannot atomically copy or write Supabase Storage object bytes. The operation is therefore a staged protocol whose **sole canonical transition/commit boundary** is one narrow security-definer RPC.

### Phase A: read-only preflight

Tongs reads the revision, canonical recording, active pointer, all canonical component artifacts, and predecessor registry row and bytes. It validates workspace/workpiece/recording/revision relationships, active revision status, canonical hashes, predecessor path/hash/size, registry revision and timestamp, and the revision `updated_at` token. It constructs the epoch bytes deterministically and an operation fingerprint over every expected identity, token, path, hash, size, and the idempotency key. No write occurs.

### Phase B: unreferenced staging

Only after a separate single-use approval, Tongs writes the exact predecessor bytes and epoch bytes to their unique paths with create-only semantics. It registers their `workpiece_files` metadata without changing `recording_revisions.history_path`. Each upload is downloaded again and checked byte-for-byte for SHA-256, size, and content type. At this point the objects are unreferenced candidates, not canonical history.

An apparent timeout or malformed response never causes a blind retry. Tongs reads the deterministic paths and registry rows. An exact match resumes the same operation; absence permits the missing suffix; any mismatch stops closed.

### Phase C: atomic canonical commit

The authenticated client invokes one RPC, provisionally named `tongs.commit_hammer_history_epoch`, through the user's access token. In one PostgreSQL transaction the RPC must:

1. Require `auth.uid()` and verify that user currently holds the workspace `editor` role.
2. Take an operation-scoped advisory lock and lock the target recording revision row.
3. Return `already_committed` only when the stored idempotency key and complete operation fingerprint match an existing committed transition.
4. Revalidate the workspace, workpiece, canonical recording, recording revision, active status, revision `updated_at`, current `history_path`, canonical component identities/hashes/tokens, and predecessor registry path/revision/timestamp/hash/size.
5. Validate both staged `workpiece_files` rows by exact path, immutable-namespace classification, registry revision/timestamp, SHA-256, byte count, content type, bucket/key, and operation binding. The RPC trusts no client assertion that is not represented in canonical rows.
6. Insert the immutable epoch row and append-only transition receipt.
7. CAS-update `recording_revisions.history_path` from the expected predecessor path while also matching the expected revision token. Exactly one row must advance.
8. Return `committed` with the epoch, transition, new pointer, and new revision token.

Any failed predicate rolls back all database changes and leaves the pointer unchanged. The staged objects may remain unreferenced until safe compensation.

### Phase D: readback and compensation

After any success, timeout, disconnect, or ambiguous RPC response, Tongs calls a read-only operation-status endpoint keyed by workspace/workpiece/revision plus idempotency key. It accepts success only when the committed fingerprint, epoch row, transition receipt, active pointer, registry metadata, and downloaded epoch bytes all agree.

Compensation may remove only staged objects and registry rows that are still unreferenced, carry the same operation binding, and retain the exact expected path/hash/size/token. It must use conditional deletion and treat an absent object as already compensated. It must never remove or overwrite the original predecessor, an active epoch, a differently bound object, or any foreign/replacement state. Failure to prove safe deletion leaves an auditable orphan for later cleanup; it does not broaden deletion authority.

## Required migration and authorization contract

HE-1 must provide a migration and regenerated database types containing:

- an append-only `hammer_history_epochs` table keyed by epoch ID and scoped by workspace, workpiece, canonical recording, and recording revision;
- an append-only `hammer_history_epoch_transitions` table containing the idempotency key, complete operation fingerprint, predecessor and epoch registry tuples, expected and committed pointer/revision tokens, actor, reason, outcome, and timestamps;
- uniqueness over the operation identity and over the active epoch artifact path, plus foreign keys enforcing the complete identity chain;
- immutable-row enforcement that rejects update/delete of committed epochs and transitions;
- RLS permitting authenticated workspace members to read records they may inspect, while mutation is denied except through the RPC;
- execute permission only for `authenticated`, with the RPC independently requiring the workspace `editor` role and `auth.uid()` as actor;
- revocation of direct authenticated writes that could mutate protected epoch/archive registry rows or bypass the pointer CAS;
- a read-only operation-status function/endpoint suitable for ambiguity resolution.

The transition row is the audit authority. A generic `workpiece_events` entry may be emitted as a projection after commit, but it is not the transaction receipt and cannot make an epoch canonical.

## Hammer product behavior

When deterministic verification classifies a ledger as unrecoverably divergent, Hammer keeps canonical content available for safe inspection, does not install the ledger, disables history traversal, and explains that current content is intact while old undo/redo cannot be reconstructed.

The only offered mutation is **Start new history from current state**. Its confirmation screen must state the exact revision and canonical base being used, identify the predecessor that will be preserved, state that prior undo/redo remains unavailable and cannot be crossed, and warn that the action creates a permanent epoch boundary. Cancellation performs no writes.

Successful readback installs an empty controller whose base exactly equals the current canonical state, clears the blocking error, and shows an informational archived-history notice. Installation itself emits no save. The first later user edit creates exactly one entry in the new epoch. Reopen loads the exact `history_path`, validates envelope identities and base hashes, and performs zero mount-time writes.

Normal valid V1 histories and Composition V2 histories remain on their existing behavior until deliberately migrated. Detection of a normal history must not expose the epoch action or change its save path.

## Verification and authorization gates

### Synthetic and isolated-stack proof

- Replay the complete migration chain on an isolated stack and regenerate checked-in DB types.
- Exercise owner, editor, viewer, anonymous, and cross-workspace cases. The decisive mutation grant is the authenticated workspace editor role, not ownership alone.
- Prove a valid divergent ledger is copied byte-for-byte, the original remains unchanged and retrievable, the epoch base exactly matches canonical state, and the pointer advances once.
- Reopen without writes, make one synthetic edit, undo and redo it, and prove traversal cannot cross the epoch base.
- Repeat an identical operation and receive `already_committed`; reuse its idempotency key with a different fingerprint and fail closed.
- Independently stale each canonical component token/hash, revision token, active pointer, predecessor registry revision/timestamp/hash/size, and staged-object tuple; every case must leave the pointer unchanged.
- Inject ambiguous responses before and after RPC commit and prove readback produces one final disposition without a blind write retry.
- Race replacement/foreign state against compensation and prove nothing foreign, active, or mismatched is deleted.
- Mount valid legacy history, valid epoch history, and divergent history; all mounts perform zero writes and normal history behavior is unaffected.
- Run full Hammer/Tongs tests, migration verification, type checks, release gates, and production budgets.

### Production gates after HE-1

Authenticated read-only production access must reconstruct the proposed bytes twice independently and pin exact identities, paths, hashes, sizes, content types, registry revisions/timestamps, canonical component tokens, revision token, idempotency key, operation fingerprint, and intended pointer transition. It must prove isolated reopen installs the new empty controller at the exact canonical base. The result is a single-use authorization package, not write authority.

Only a separate approval may authorize exactly one archive/epoch staging and pointer-CAS transaction. Readback must verify it, and execution stops without opening Hammer. A further separate approval may open Florida once to confirm canonical authority, the new epoch, zero mount-time writes, the archived-history notice, and unchanged transcript, timeline, placements, audio, and authority. That acceptance performs no edit.

## HE-0 boundary and follow-on sequence

- **HE-0 (this record):** architecture and persistence-contract audit only.
- **HE-1:** migration, RLS, Tongs protocol, Hammer contracts/UI, and synthetic tests only.
- **HE-2:** isolated-stack authorization and end-to-end proof.
- **HE-3:** authenticated read-only production reconstruction and single-use authorization package; no Florida write or Hammer open.
- **HE-4:** separately approved one-time canonical transition; stop without opening Hammer.
- **HE-5:** separately approved read-only Florida reopen acceptance; no initial edit.

This design deliberately does not repair or continue the legacy ledger. It preserves the divergence permanently, closes it truthfully, and permits a future history to begin only from canonical state through an explicit, CAS-protected, idempotent, auditable transition.
