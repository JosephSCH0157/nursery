# Hammer history epochs — HE-7A canonical-base mismatch diagnosis

Diagnosis date: 2026-08-20 UTC

Result: **DECISION-COMPLETE — projection-only mismatch caused by an order-sensitive editor-state hash contract**

This investigation was entirely offline. It used the frozen HE-5 proposal/artifacts, HE-6 receipts, HE-7 baseline/post-open captures, and committed source at `06f2f11015156fc8908923824d752cb3a4a4221d`. It did not query production, open Hammer, invoke a writer/RPC, or mutate an artifact, pointer, epoch, head, registry row, or database row.

## Conclusion

Florida's epoch anchor and live reopen describe the same canonical editor state. They differ only in JavaScript object property insertion order inside the visual timeline.

- HE-5 creation hash: `hammer-state:03c2c9fc`
- HE-7 reopen hash: `hammer-state:fbacc72a`
- normalized semantic values: exactly equal
- structural differences: 91 `key_order` differences and zero value, presence, type, array-order, or length differences
- recursively key-sorted canonical SHA-256 for both states: `e86940dc8c87c18188681beebad4b5000fae006b2fdaf5fc3dcd9d6d7129ee81`

The defect is the hash contract itself: `hashEditorState()` hashes raw `JSON.stringify(state)`. Raw JSON serialization preserves insertion order, so two value-equivalent projections can receive different hashes. The persisted content did not semantically diverge.

## Hash path 1 — frozen HE-5 anchor

HE-5's frozen constructor in `D:\nursery\he5-florida-dry-run-20260820\construct-proposal.ts` performed:

1. Parse the seven frozen artifact byte streams.
2. Strictly validate the visual timeline through `validateCanonicalVisualTimelineArtifact()` in `hammerRecordingRevisionPersistence.ts`.
3. Because the artifact is already v2, retain the parsed artifact object's insertion order.
4. Normalize transcript selection with `syncEditableTranscriptSegments()`.
5. Build `HammerEditorStateSerializable` with `toEditorState()` from:
   - all 137 transcript segments;
   - the raw strict v2 timeline;
   - the 30 persisted placements and three existing placement uncertainty decisions;
   - `audio_edit: null` and the default studio rack;
   - the persisted revision-owned editorial-authority graph;
   - persisted output selection;
   - selected segment `turn_137`;
   - playhead `0`;
   - transcript timing hint `null`.
6. Call `hashEditorState()`, which applies FNV-1a to `JSON.stringify(state)`.

The reconstructed state is 168,890 JSON bytes, SHA-256 `ea66d8ef5315e486b8166b01fbbdb969adeb978f97faa6e878da14af12a8175f`, and Hammer hash `hammer-state:03c2c9fc`. It exactly reproduces the epoch's persisted base.

## Hash path 2 — HE-7 live reopen

The live path performed:

1. `buildHydratedSnapshot()` in `HammerWorkspaceEditor.tsx` installed the revision-owned transcript, placements, timeline, audio, session, and editorial authority without changing their persisted values.
2. `loadHammerVisualTimelineStateFromSnapshot()` in `hammerVisualTimelinePersistence.ts` accepted the valid v2 timeline, then passed it through `migratePersistedVisualState()`.
3. `migratePersistedVisualState()` in `hammerVisualMigrations.ts` rebuilt the timeline with `createEmptyVisualTimelineState()` and the semantic-anchor normalizers. Values and array order were preserved, but object keys were emitted in constructor order.
4. `useHammerWorkspaceShellHistoryController()` built the baseline at `hammerWorkspaceShellHistoryController.ts:489` and hashed it at line 505.
5. At line 604, the loaded epoch base `03c2c9fc` differed from the runtime base; line 606 emitted `Epoch anchor canonical base mismatch. History traversal is blocked.`

The reconstructed live state is also 168,890 JSON bytes, SHA-256 `bd022e733a6f9e1192190b144412501d4eea52092c248935bfc27f6c573d76b7`, and Hammer hash `hammer-state:fbacc72a`.

## First divergence and complete field comparison

The first raw JSON divergence is offset 85,515, at `visualTimeline`:

- artifact/anchor key order begins `assets, clips, debug_migration_hash, debug_origin, lanes, revision, selected_clip_id, source_mode, updated_at, version`;
- reopen key order begins `version, revision, updated_at, source_mode, selected_clip_id, assets, lanes, clips, debug_origin, debug_migration_hash`.

The remaining 90 differences are the same phenomenon for 30 clips:

- 30 `semantic_anchor` key-order differences;
- 30 `semantic_anchor.script` key-order differences;
- 30 `semantic_anchor.transcript` key-order differences.

| Top-level field | Anchor SHA-256 | Reopen SHA-256 | Result |
| --- | --- | --- | --- |
| transcript segments | `3fd7ebeb10ebe9776c3f39e115b31770a5ae299dd927fae891d5401b8176dda7` | same | equal |
| visual placements | `ec26a26fbc0be12e90581dad49b8d225c6d5e223cfa81a3da9a8375aac4eb4e6` | same | equal |
| visual timeline | `b25949c9346245e0f44cc7db2021db0f366edf284cf2b7869a2a4382dab460e3` | `51796ecc189c9fe88462d7b2d30dca6e25fad2973154c5540f9aa5dba653718a` | insertion order only |
| audio edit | `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b` | same | equal (`null`) |
| studio rack | `7c662167536c979b234b5466c57e481185589e7dda879ca2d557638865601f1b` | same | equal |
| editorial authority | `1bf3d6c63d08540a72cd8465b92491bce96774c357ec67667301abfcf4d7834d` | same | equal |
| output selection | `803551cdb62c3fa789fa4bfce39f3ce326a50cd5ca4188c26628ac70faa977c1` | same | equal |
| selected segment | `1d8bd8f86d4208dfdd6726b789e0a3be107b028bf311063967bddce21054c8d3` | same | equal (`turn_137`) |
| playhead | `5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9` | same | equal (`0`) |
| timing hint | `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b` | same | equal (`null`) |

Editorial-authority creation/update timestamps, timeline and nested asset/clip timestamps, selected clip, playhead, debug origin/migration hash, session selection, output selection, and every absent/default value were identical in this incident. Packaging UI state is reset after baseline creation and is not part of `HammerEditorStateSerializable`; persisted packaging clips/assets remain represented in the timeline. No diagnostic banner state is part of the state object, although the timeline's `debug_origin` and `debug_migration_hash` are currently hashed.

## Classification

- Epoch creation did not serialize incorrect semantic authority.
- Reopen did not construct incorrect semantic authority.
- Hydration did not add or lose canonical content.
- The mismatch is projection-only: an equivalent timeline was reconstructed with different property insertion order.
- The causal defect is that `hashEditorState()` treats raw representation order—and also nonsemantic timestamp, diagnostic, selection, and playhead fields—as canonical identity.

Changing only creation to use reopen's constructor order would prevent this exact new-anchor case but would leave the contract vulnerable to any equivalent reconstruction, timestamp refresh, or diagnostic projection. Changing only reopen to preserve raw artifact order would make Florida's current anchor pass but would retain the same systemic instability. The repair boundary therefore belongs at a single shared, explicitly versioned canonical editor-state hash projection used by creation, anchor/head validation, history entries, and reopen.

## Persisted HE-6 validity

Offline byte and row verification confirms:

- the revision pointer selects the authorized epoch artifact;
- epoch bytes are exactly 1,672 bytes with SHA-256 `9a67e89a5ebdc18af6aeb96dbf99701c7c3554e4cf2ece8a35cb88b771e3e5d0`;
- archive bytes exactly equal the immutable 208,379-byte predecessor with SHA-256 `5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb`;
- the epoch row agrees with its artifact, base, identities, and registry tuple;
- the one transition agrees with operation fingerprint `fb62f3e71e6dd4762fcb7196366cea0466790a2ce9bb7f110fd0efeb37f6dcd7` and idempotency key `hammer-epoch:9ce5376d-a1f3-4aa9-8972-c37a36bbd248`;
- exactly one epoch and one transition exist, with zero heads and zero head transitions;
- HE-7 baseline and post-open snapshots remain byte-identical at SHA-256 `ac36847bcb2a70a17398ca0476a1f0399b4af7df7f7bbb9caae29d89c639c2fe`.

No rollback, pointer change, artifact regeneration, or epoch replacement is indicated by this diagnosis.

## Required regression boundary for the separate repair

The next change must be covered before another Florida reopen:

1. An exact Florida-shaped fixture must compute the same canonical base through epoch creation and full reopen hydration.
2. Recursively reordered object keys must not change canonical identity.
3. Timeline, asset, clip, authority, and registry timestamps must not cause false divergence when semantic content is unchanged.
4. Timeline diagnostic origin/migration metadata must not cause false divergence.
5. Selection restoration, selected clip, playhead, timing hints, and other session/view state must be explicitly classified and excluded if nonsemantic.
6. Meaningful transcript, timeline, placement, audio/studio-rack, and editorial-authority changes must each change canonical identity.
7. Legacy history, epoch-anchor, and epoch-head hydration must retain strict schema, identity, component-authority, registry, and pointer validation.
8. Existing anchors require an explicit compatibility rule; the repair must not silently accept an arbitrary mismatched hash.
9. Mount/reopen must remain zero-write, with no head, epoch, registry, session, or pointer mutation.
10. The complete isolated archive → anchor → edit → head → reopen → undo → redo lifecycle must pass before another production reopen authorization.

## Evidence

External evidence: `D:\nursery\he7a-canonical-base-diagnosis-20260820`

| File | SHA-256 |
| --- | --- |
| `reconstruction.json` | `3b6d770d5c169230ac7a60592b5873058b4e94edf2eba5a23cb5ded34652c409` |
| `anchor-state.json` | `904308f9ce8e453cc3159fe6cbbb2408cd34f7aac41af2f47ff13ccbe0a429a5` |
| `reopen-state.json` | `9df5313e3d13197e7062b308bb2a8662485d323a50c4d7b005699574bd22f86f` |
| `analysis.json` | `3995962cf2fa1857348344455f0f89b6947d115b00a477e05153949100894d54` |

HE-8 remains blocked. This record authorizes no repair or further Florida access.
