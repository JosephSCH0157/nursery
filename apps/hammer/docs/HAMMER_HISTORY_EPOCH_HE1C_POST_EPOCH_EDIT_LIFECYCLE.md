# Hammer History Epoch HE-1C Post-Epoch Edit Lifecycle Amendment

## Decision

Post-epoch editing uses **append-only immutable history documents for every durable head**, with `tongs.recording_revisions.history_path` compare-and-swap (CAS) advanced to the selected head. The HE-1A epoch artifact remains the immutable sequence-zero anchor; it is never converted into, or overwritten as, a normal ledger.

This selects alternative 2. It requires a forward database migration/RLS update and a narrow post-epoch head-commit RPC. It also requires a second HE-1B-style Tongs coordinator operation. This record authorizes neither change. HE-1C is documentation only.

The choice resolves the apparent contradiction:

- archive and epoch-anchor paths remain create-only and byte-immutable;
- every later durable ledger state has a new unique path and immutable registry row;
- the active pointer moves, but no history object is overwritten;
- the transition receipt chain, rather than a mutable object, records which head became canonical.

## Audit of the committed system

The currently committed HE-1A/HE-1B contract is sufficient to create and select an empty epoch, but it intentionally does not implement continuation after that selection.

1. HE-1A commits the epoch artifact at `hammer/revisions/{revisionId}/history/epochs/{epochId}.v1.json`, records it in `tongs.hammer_history_epochs`, and points `recording_revisions.history_path` at that exact artifact.
2. HE-1A's immutable triggers prevent updates or deletes of the committed epoch row, transition row, and referenced archive/epoch `workpiece_files` rows.
3. HE-1B reserves the archive and epoch namespaces from generic `commit-file` and generic revision saves.
4. Hammer's current `loadHammerRevisionHistoryDocument()` ignores the supplied `history_path` value and reconstructs `hammer/revisions/{revisionId}/history.v1.json`.
5. Hammer's current `saveHammerRevisionHistoryDocument()` invokes the generic revision `PUT`; Tongs resolves history back to that same fixed legacy path and overwrites it.
6. The in-memory controller mutates one V1 document: an edit appends or coalesces an entry, undo and redo mutate its stacks, and each action schedules a debounced save.

Consequently, with only the committed HE-1A/HE-1B code, an empty epoch may be selected by Tongs but Hammer cannot safely load or durably advance it. A first post-epoch edit must remain disabled until the follow-on head protocol is implemented. Falling back to the fixed legacy path, overwriting the epoch anchor, or treating a failed save as durable is forbidden.

## Alternatives considered

### 1. Immutable epoch manifest plus one mutable active ledger

This would preserve the anchor at its current path and place a mutable ledger at, for example, `hammer/revisions/{revisionId}/history/epochs/{epochId}/active.history.v1.json`. The first edit would CAS the pointer from the anchor to the active ledger; later saves would replace that object's bytes.

The model is simple and resembles current Hammer behavior, but it is rejected. Supabase Storage replacement and PostgreSQL registry mutation cannot be one atomic operation. A timeout can leave old bytes with new metadata or new bytes with old metadata, and safe compensation cannot restore overwritten bytes without treating a prior copy as another canonical version. It also loses durable prior heads and makes auditability depend on mutable state. Adding versioned backups to repair those defects becomes alternative 2 with extra indirection.

### 2. Immutable document for every durable head

Each persisted edit/navigation state is serialized to a new path. A narrow RPC validates the candidate and atomically advances the pointer from the exact expected head to the new head while inserting an append-only receipt. Storage remains staged and non-transactional, but canonical selection is transactional and readback-resolvable. This is selected.

### 3. Database-native append-only commands and a mutable materialized projection

Commands, stack movements, and checkpoints could be immutable database rows, with the active stack/head represented by a transactional projection and Storage used only for snapshots. This can be safe, but it creates a second history engine, changes replay and pruning semantics, and requires translating the existing V1 document/controller into relational events. It is materially larger than required and risks semantic drift between browser replay and database projection. It is not selected for the epoch continuation contract.

## Exact artifact and pointer contract

The immutable predecessor evidence remains:

`hammer/revisions/{revisionId}/history/archive/{predecessorSha256}.history.v1.json`

The immutable sequence-zero epoch anchor remains:

`hammer/revisions/{revisionId}/history/epochs/{epochId}.v1.json`

Each later immutable head uses:

`hammer/revisions/{revisionId}/history/epochs/{epochId}/heads/{headId}.history.v1.json`

`headId` is a UUID generated before staging and bound into the operation fingerprint. Paths are never reused. All three namespaces are create-only. An existing candidate may be reused only when its path, type, canonical bytes, SHA-256, byte count, storage locator, registry revision/token, epoch identity, and operation identity agree exactly.

After epoch creation, `recording_revisions.history_path` means **the exact canonical history artifact to load now**:

- before any post-epoch save: the sequence-zero epoch anchor path;
- after the first durable edit: the first immutable head path;
- after every later durable edit, undo, redo, jump, checkpoint, or branch truncation: the most recently committed immutable head path.

It does not mean “the epoch manifest,” “the latest object in a directory,” or a path Hammer may reconstruct. No listing or timestamp ordering may select a head.

## Immutable head envelope

Each head is deterministic canonical JSON with schema `forge.hammer-history-epoch-head`, schema version 1. It contains at minimum:

- workspace, workpiece, canonical recording, recording revision, and epoch IDs;
- `head_id`, positive `sequence`, creation timestamp, and authenticated initiating user;
- `parent.path`, `parent.sha256`, `parent.registry_revision`, and lossless `parent.registry_updated_at`;
- the original epoch-anchor path and SHA-256;
- the canonical base editor-state hash and complete component SHA-256 set copied from the epoch authority;
- the result editor-state hash and exact canonical component identities, hashes, sizes, registry revisions, and timestamp tokens against which this head was produced;
- one complete normalized `HammerHistoryDocumentV1` ledger for this epoch, including entries, head entry ID, undo stack, redo stack, checkpoints, and metadata;
- the unchanged boundary declaration that legacy history is unavailable, unmerged, and non-traversable.

Sequence 1 must name the epoch anchor as its parent. Sequence N must name the exact committed sequence N-1 head. A head cannot cite the predecessor ledger or archive as a traversable parent. The complete ledger representation allows existing deterministic replay and verification to remain the semantic authority; the parent tuple and receipts make durable head selection auditable.

## Durable action trace

Installation of the empty epoch performs no post-epoch head write. The controller starts at the exact epoch base with empty entries, undo, redo, and checkpoints. Its acknowledged parent is the epoch anchor and its acknowledged sequence is zero.

### First edit

1. The controller computes the first forward/inverse patch from the epoch base, creates entry E1, and locally reaches state S1 with `undo=[E1]`, `redo=[]`.
2. Debounce/coalescing may continue locally. Nothing is represented as durable until a head commit succeeds.
3. Tongs verifies the currently acknowledged pointer/token still select the epoch anchor and verifies the exact canonical component state for S1.
4. Tongs deterministically serializes H1 with sequence 1 and parent equal to the anchor, stages it create-only, registers and reads it back, then calls the head RPC.
5. The RPC inserts the immutable head/receipt and CAS-advances `history_path` from the anchor to H1. The acknowledgement installs H1's pointer, hash, registry tuple, sequence, and new revision token as the client's durable basis.

### Second edit

The controller creates E2 from S1, yielding S2 with `undo=[E1,E2]`, `redo=[]`. H2 is a new sequence-2 document whose parent is H1. The RPC must match H1's exact path/hash/registry tuple and the acknowledged revision token before it advances the pointer to H2. H1 remains immutable and readable.

### Undo

Undo applies E2's inverse patch locally, yielding S1 with the same ledger entries but `undo=[E1]`, `redo=[E2]`. Navigation is itself a durable head state. H3 has sequence 3 and parent H2; it is not a mutation of H1 or H2 and does not delete E2. CAS advances the pointer from H2 to H3. Undo at the empty stack is a no-op and creates no candidate or receipt, so it cannot cross the epoch boundary.

### Redo

Redo applies E2's forward patch locally, yielding S2 with `undo=[E1,E2]`, `redo=[]`. H4 has sequence 4 and parent H3. CAS advances the pointer from H3 to H4. Redo with an empty redo stack is a no-op and creates no durable head.

### Reopen

Reopen reads the revision and then reads the exact value of `recording_revisions.history_path`:

- if it is the epoch anchor, Hammer validates the anchor identities/hashes and installs the empty controller at the exact base;
- if it is a head path, Hammer validates the immutable head row, registry tuple, downloaded bytes, parent/sequence authority, epoch anchor, identities, component tokens, boundary declaration, and complete ledger, then performs existing inverse/forward history verification before installing it;
- if any predicate fails, Hammer leaves canonical content inspectable but does not install or traverse history.

Reopen never discovers a head by constructing a path, listing Storage, choosing the greatest sequence, or following an uncommitted candidate. Mount and reopen perform zero writes.

## Autosave, coalescing, and concurrent local changes

The in-memory coalescing window may combine rapid mutations into one entry only while that entry is unacknowledged. The immutable persistence boundary seals the serialized ledger, not every keystroke:

- debounce may collapse any number of local mutations into one candidate head and one receipt;
- once a candidate is dispatched, its bytes and operation fingerprint are frozen;
- once acknowledged, entries represented by that head are sealed for persistence purposes; a later mutation, even with the same UI transaction ID, must produce a later head and may not rewrite the acknowledged object;
- if local state changes while a commit is in flight, commits are serialized. The acknowledgement updates only the durable-basis token; a follow-up candidate is built from the newest local document with the acknowledged head as parent;
- an older acknowledgement must never replace newer local state in memory;
- closing, navigating, or reloading with unacknowledged changes may warn or lose only those explicitly unacknowledged changes. It may not pretend they were committed.

This permits indefinite editing: storage grows by immutable committed heads, while the V1 controller's existing maximum undo-depth rule may bound active traversal. Pruning an entry from the active undo stack is recorded only in a later head; it never deletes an earlier head or changes the epoch anchor. Retention/compaction of old committed heads is outside HE-1C and must not be introduced without a separate evidence-retention decision.

## CAS, idempotency, registry, and audit boundary

Tongs stages one head candidate, then a narrow security-definer RPC is the sole canonical head transition boundary. The RPC must:

1. require `auth.uid()` holding the workspace editor role;
2. lock the recording revision and operation identity;
3. return `already_committed` only for the same idempotency key and complete fingerprint;
4. validate the complete workspace/workpiece/recording/revision/epoch identity;
5. validate active revision status, exact expected revision timestamp, expected parent `history_path`, expected parent hash/registry revision/token, and expected sequence;
6. validate that the parent is either the committed epoch anchor for sequence 1 or the immediately preceding committed head;
7. validate the candidate registry path/type/content type/bucket/key/hash/bytes/revision/timestamp and deterministic envelope fields;
8. validate the result state against the exact acknowledged canonical component identity/hash/token set supplied to the operation; a stale or partially saved canonical state is a terminal conflict;
9. insert one immutable head row and one append-only transition receipt;
10. CAS-update `recording_revisions.history_path` from the exact expected parent and return the new pointer/revision token.

Expected CAS losses return typed terminal, non-retryable conflicts. A caller may build a new operation only after rereading canonical state and deliberately reconciling its local edits; it may not retry the stale operation under a new key.

Every committed head has an immutable database row and transition receipt. Direct authenticated insert/update/delete is revoked. Owner/viewer workspace roles may read; only an authenticated editor may execute the commit RPC. Committed head registry rows receive the same update/delete protection as archive and epoch rows. Generic history save and `commit-file` continue to reject all epoch anchor/head namespaces. `workpiece_events` may project a commit after the fact but is not canonical audit authority.

## Ambiguous outcomes and compensation

Every transport error, timeout, malformed success, or lost RPC response is resolved only by a read-only operation-status contract keyed by workspace, workpiece, revision, epoch, and idempotency key. Readback returns:

- `committed` with the exact receipt and active pointer when the fingerprint and all authority agree;
- `already_committed` for an independent replay of that same operation;
- `absent` when no receipt exists;
- a typed fail-closed conflict for mismatched identity/fingerprint or inconsistent committed state.

The coordinator never blindly repeats the RPC after ambiguity. If readback proves commitment, it acknowledges that head. If readback proves absence, compensation may remove only the registry row and object demonstrably created by that operation, still unreferenced by the revision, epoch/head tables, or receipts, and unchanged in path/hash/size/revision/timestamp/storage identity. Reused candidates, parent objects, committed heads, replacement bytes, foreign registry rows, the legacy ledger, archive, and epoch anchor are never compensation targets. Inability to prove safe deletion leaves an auditable orphan and returns a conflict.

## Required follow-on contracts

### HE-1A forward migration/RPC extension

Yes. The existing migration knows only epoch creation. A later forward migration must add immutable `hammer_history_epoch_heads` and append-only `hammer_history_epoch_head_transitions` authority (or equivalently named tables), uniqueness for epoch sequence/head path/operation identity, complete parent and identity foreign keys, immutable registry protection for committed heads, viewer read RLS, denial of direct authenticated mutation, editor-only RPC execution, and a read-only operation-status RPC. It must extend pointer validation to accept either the sequence-zero anchor or a committed head. The already-committed `20260819130000` migration must not be edited.

The head RPC is separate from `commit_hammer_history_epoch`: epoch creation is an explicit one-time boundary with predecessor archival, while head advancement is repeatable normal editing with a committed parent. Combining them would broaden the epoch-creation RPC and weaken its one-time audit meaning.

### HE-1B second coordinator operation

Yes. Tongs needs a separate `commitHammerHistoryEpochHead`-style operation and authenticated HTTP transport. It reads the actual pointer and canonical component authority, validates and stages exactly one immutable head, invokes only the head RPC, resolves ambiguity only through head-operation readback, and applies the conservative compensation rules above. The epoch-creation coordinator remains unchanged and is never reused as though a normal head were another epoch.

Hammer integration must route only epoch-backed histories to this operation. Valid legacy histories retain their current behavior until a separately approved migration strategy exists; no automatic conversion is implied.

## Immutability proof and acceptance matrix

Let L be the original legacy ledger, A its content-addressed archive copy, E the epoch anchor, and H1…Hn committed post-epoch heads.

- HE-1A/HE-1B create L→A and E without overwriting L. The epoch transition records the exact hashes and byte counts of L/A/E.
- Database triggers and generic-path rejection prevent update/delete of A and E after commitment.
- The head protocol only permits new paths under `.../{epochId}/heads/{headId}.history.v1.json`; neither its staging API nor RPC accepts L, A, E, or an existing H path as a write target.
- Advancing from Hn to Hn+1 changes only append-only authority rows and the revision pointer. Hn's bytes and registry row remain unchanged.
- Undo and redo create later documents with different stack selections; they never reverse, edit, or delete prior storage objects.
- Reopen reads one exact committed pointer and performs no writes.
- Compensation excludes every referenced or mismatched object and cannot name L, A, E, a parent, or any committed H.

Therefore, by induction, after any finite number n of edits/navigation saves, L, A, E, and H1…Hn are byte-identical to their creation readbacks. The next action can add Hn+1 and CAS-select it without modifying any predecessor. Since no algorithmic step requires reusing a path, the same invariant holds for arbitrarily many later heads, subject only to separately governed storage capacity and retention policy.

Future implementation gates must prove: first edit, second edit, undo, redo, zero-write reopen, rapid coalescing, mutation during in-flight commit, idempotent replay, stale parent/revision/component/registry rejection, ambiguous response readback, archive-only and head-only partial recovery, replacement-safe compensation, microsecond-token preservation, cross-workspace and viewer denial, unchanged normal legacy history behavior, and byte-for-byte preservation of L, A, E, and all prior heads.

## HE-1C boundary

HE-1C commits this decision record only. It performs no implementation, migration, generated-type change, application or UI change, database or Storage write, production contact, Florida or Anvil access, or history reconstruction. The existing `apps/nursery/public/forge-nav.json` modification remains untouched and excluded.
