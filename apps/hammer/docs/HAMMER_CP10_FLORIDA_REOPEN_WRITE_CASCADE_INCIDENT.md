# Hammer CP-10 Florida reopen write-cascade incident

## Scope and conclusion

This is a read-only diagnosis based on the committed CP-8, CP-9, and CP-10 records; the ACL-restricted CP-8/CP-10 evidence packages; the pre/post CP-10 production dumps; the already-downloaded artifact bytes; and an isolated in-memory replay through the production reader. No Hammer route, session-open endpoint, writer, recovery action, RPC, or production mutation was invoked during this diagnosis.

The incident was caused by mount/hydration state being projected through the same unconditional snapshot-emission and whole-revision autosave path used for user edits. Four mount-only snapshot emissions occurred at 09:02:08.055, 09:02:08.280, 09:02:08.450, and 09:02:10.263 UTC. Debouncing collapsed the first three, but the fourth arrived after the first save had begun. Because the save lane has no single-flight/coalescing guard, two saves ran concurrently and their five revision-artifact writes interleaved. A release projection also regenerated the authority graph's `updated_at`, so one authority write and pointer CAS followed. This was not a user edit.

Revision 2 is editorially equivalent to revision 1. The authority graph's only changed field is non-editorial timestamp metadata. The timeline's only changes are diagnostic provenance and UI selection state. Transcript, audio, placements, history, recording authority, approvals, clip/asset/lane content, and all canonical identities remained unchanged.

## Authority revision 1 versus 2

Both canonical authority files are exactly 751 bytes and have the same JSON field order and schema. A recursive field comparison finds exactly one changed leaf:

| JSON path | Revision 1 | Revision 2 |
| --- | --- | --- |
| `/authority/updated_at` | `2026-08-15T23:04:36.397Z` | `2026-08-19T09:02:08.374Z` |

At the byte level, offsets `[371,385)` are the only changed bytes (zero-based, end-exclusive); 371 prefix bytes and 366 suffix bytes are identical. The replacement is `5T23:04:36.397` → `9T09:02:08.374`. That single timestamp replacement changes SHA-256 from `6d6c4a4d3ca2ae9a792326d6d3bc011076d07aefc31f03e78bff4c0cbc025d35` to `4a233d406b37abab0d9fb7ae708464aacc03cba6a188af96211669b6bde2a7bc`.

All authority identity and semantic fields are identical: envelope schema, workspace, workpiece, recording revision, graph ID/version, session ID, source transcript ID, created time, empty operation order, and empty operations. Revision 2 therefore represents equivalent editorial authority with unstable projection metadata, not a semantic authority change.

The unstable value is created by `buildHammerWorkspaceShellReleaseBasis()`: when an authority graph already exists it supplies `now()` as `canonicalGraphUpdatedAt`, and `buildHammerWorkspaceShellReleasePackage()` overwrites the cloned graph's `updated_at` with it. The release projection is then passed as `exportCanonicalGraph` to the autosave snapshot emitter rather than preserving the hydrated graph unchanged ([hammerWorkspaceShellReleasePackage.ts](../src/editor/hammerWorkspaceShellReleasePackage.ts), lines 137-167 and 254-258; [HammerWorkspaceShell.tsx](../src/editor/HammerWorkspaceShell.tsx), lines 2916-2954 and 3850-3860).

## Timeline byte comparison

| Property | Before | After |
| --- | --- | --- |
| Bytes | 81,774 | 81,728 |
| SHA-256 | `36779b5c15475679354050e8a2aaf0f1cea89b3ea2159c2b60c9c5c65b212a1a` | `b25949c9346245e0f44cc7db2021db0f366edf284cf2b7869a2a4382dab460e3` |
| `/debug_origin` | `legacy_migration` | `canonical_load` |
| `/selected_clip_id` | `placement:bd3c4759-ebaf-4994-8462-f3956361b275` | `null` |

Those are the only two changed timeline leaves. Version 2, revision 3, `updated_at`, 30 assets, 30 clips, one lane, all lane ordering, clip ordering, timing, geometry, opacity, z-order, packaging identity, approval/ingest state, uncertainty data, semantic anchors, and asset references are byte-for-byte/field-for-field unchanged.

This was not v1→v2 migration, structural normalization, ordering drift, or placement loss. It was two mount transformations:

1. `loadHammerVisualTimelineStateFromSnapshot()` forces an already-valid canonical timeline's diagnostic `debug_origin` to `canonical_load`; `buildHammerVisualTimelineSaveRequest()` persists that runtime diagnostic value ([hammerVisualTimelinePersistence.ts](../src/visuals/persistence/hammerVisualTimelinePersistence.ts), lines 207-251).
2. The persisted selected clip is the system-managed Packaging Intro. `compositionVisualTimeline` filters intro/outro packaging clips, derives `selectedClipId = null`, and the visual-selection effect installs that null selection into the editable timeline ([HammerWorkspaceShell.tsx](../src/editor/HammerWorkspaceShell.tsx), lines 621-657 and 1305-1327).

The editor-session artifact also changed only mount/session UI state: `last_opened_at` `2026-08-15T23:03:21.346Z` → `2026-08-19T09:02:07.600Z`, selected segment `turn_017` → `turn_137`, and selected overlay `placement_21655327-dc99-4322-bbdc-f45f0acf31d6` → `null`. The selected-segment change was emitted during system hydration/playhead-linked selection; there is no corresponding transcript edit or history entry.

## Timestamped write sequence

The immutable `workpiece_events` rows prove two overlapping five-artifact saves. Grouping each sequential server request produces:

| Save A event | UTC | Save B event | UTC |
| --- | --- | --- | --- |
| editor session `78682` | 09:02:12.782176 | editor session `78683` | 09:02:14.009397 |
| transcript `78684` | 09:02:14.093866 | transcript `78686` | 09:02:15.126870 |
| audio `78685` | 09:02:15.104421 | audio `78688` | 09:02:16.155945 |
| timeline `78687` | 09:02:16.126048 | timeline `78690` | 09:02:17.188740 |
| placements `78689` | 09:02:17.166086 | placements `78691` | 09:02:18.141698 |

The workpiece-state acknowledgement completed at 09:02:18.777065. The authority artifact commit event `78692` completed at 09:02:22.085879; its registry row was updated at 09:02:21.504185. The revision authority CAS completed at 09:02:23.264940, changing revision 1 → 2. A normal presence heartbeat then changed the presence session/last-seen value at 09:02:38.971.

Final source registry revisions confirm two writes apiece: editor session 149→151, transcript 148→150, audio 210→212, timeline 148→150, and placements 190→192. Authority advanced only 1→2 because both saves carried the same release-projected authority bytes; the adapter's committed-byte preflight made the duplicate authority attempt a no-op after the first commit.

## Code-level causal chain

1. Canonical revision hydration correctly read and installed the revision-owned authority. The absence of transitional/missing-authority UI confirms this reader path succeeded.
2. Hydration and system selection effects changed runtime-only fields: timeline diagnostic origin, packaging selection, transcript selection, and open timestamp.
3. `useHammerWorkspaceShellReleaseBasis()` regenerated authority `updated_at` with wall-clock time even though no authority operation changed.
4. `useHammerWorkspaceShellSnapshotEmitter()` runs in a layout effect and emits whenever its broad hydration-derived key changes; it does not distinguish hydration/system effects from user mutations ([hammerWorkspaceShellSnapshotEmitter.ts](../src/editor/hammerWorkspaceShellSnapshotEmitter.ts), lines 321-486).
5. `handleWorkspaceSnapshotChange()` treats every accepted emission as a canonical working edit and immediately calls `queueRevisionAutosave()` ([HammerWorkspaceEditor.tsx](../src/editor/HammerWorkspaceEditor.tsx), lines 3757-3801).
6. The hydration no-op comparison strips open timestamps and some timeline metadata, but does not suppress changed selected IDs or regenerated authority timestamps. Its special normalization bypass applies only when runtime `debug_origin === legacy_migration`; hydration already changed that value to `canonical_load` ([HammerWorkspaceEditor.tsx](../src/editor/HammerWorkspaceEditor.tsx), lines 339-386 and 3630-3649).
7. A later system emission queued a second timer while Save A was running. `pendingSaveRef` and per-lane response tokens protect installation of stale responses, but they do not prevent the stale request's server writes. Thus Save A and Save B both mutated storage.
8. Each `persistHammerCanonicalSave()` unconditionally performs revision-artifact save, workpiece-state reconciliation, then authority persistence ([hammerVisualAuthority.ts](../src/persistence/hammerVisualAuthority.ts), lines 141-207).
9. `saveHammerRecordingRevision()` sends all five populated artifacts. The server commits editor, transcript, audio, timeline, and placements serially without content-hash equality suppression ([workpiece-commit-api.ts](../../../packages/tongs/src/workpiece-commit-api.ts), lines 8435-8479).
10. `commitFileBytes()` always uploads, upserts the registry row, rewrites the manifest, and appends an event, even when bytes/hash are unchanged ([workpiece-commit-api.ts](../../../packages/tongs/src/workpiece-commit-api.ts), lines 9438-9555). This is why unchanged transcript, audio, and placement payloads still advanced twice.

## Persisted impact

The full pre/post production dumps were compared for every `tongs` row containing Florida's workpiece identity. Only five tables changed: `hammer_workpiece_presence`, `hammer_workpiece_state`, `recording_revisions`, `workpiece_events`, and `workpiece_files`. All other Florida-associated rows—including approval/decision tables—were identical.

Preserved exactly:

- episode, sealed recording, media path/hash/identity, active revision identity and every artifact path;
- 137 transcript segments and the complete transcript bytes/hash;
- audio-polish bytes/hash;
- all 30 placement rows, statuses, uncertainty flags, approvals/ingest decisions, and placement bytes/hash;
- timeline assets, clips, lanes, timing, geometry, ordering, packaging clip, and semantic anchors;
- history artifact bytes/hash, three entries, base `hammer-state:beaa7731`, and head `entry:4bb8bdbc-1412-413d-ab90-d777b45d5ea9`;
- authority graph identities and all editorial operations (still empty).

Altered/lost state is limited to UI/diagnostic metadata: prior editor selection, selected packaging clip, timeline debug origin, open/presence timestamps, registry revisions/timestamps, authority fingerprint/revision, and appended save events/manifest metadata. No editorial content, approval decision, placement decision, or history semantic was altered or lost.

`history_current_head_mismatch` remained the same deferred issue: its artifact, head, entries, bytes, hash, registry revision, and timestamp did not change. It is not diagnosed further here.

## Revision-2 validation

An isolated test loaded the seven post-open artifacts through `loadHammerRecordingRevisionArtifacts()` using a local fetch stub that rejected session-open and acknowledgement routes, then passed the resulting snapshot through `hydrateHammerOpenLaunchContext()`. Results:

- revision-2 fingerprint and registry hashes validated;
- authority schema and all workspace/workpiece/recording/revision identities validated;
- persistence source was `persistence`, with canonical basis true;
- 137 transcript segments, timeline v2/revision 3/30 assets/30 clips/one lane, and 30 placements installed;
- no network mutation was issued.

The current revision-2 authority therefore validates against current persisted state and can reopen canonically in an isolated projection.

## Smallest safe repair boundary

Keep canonical hydration, authority validation, history, and all editor mutation commands unchanged. Repair only the mount-to-autosave boundary:

1. Preserve the hydrated authority graph verbatim in ordinary editor snapshots. Release/package projection may use an ephemeral render timestamp, but must not feed a regenerated graph back into persistence.
2. Add an explicit hydration/quiescence barrier or mutation provenance token so snapshot emissions caused solely by initial hydration, linked selection, preview setup, canonical-load diagnostics, or presence cannot dirty autosave state.
3. Compare canonical semantic save payloads to the hydrated baseline while excluding UI-only/open/diagnostic fields. Legacy normalization remains an in-memory projection until a real user mutation occurs.
4. Serialize/coalesce revision saves so a new snapshot arriving during an in-flight save either replaces the unsent plan or runs only after readback; stale response protection alone is insufficient because it does not stop server-side writes.
5. At the revision artifact boundary, skip upload/registry/manifest/event work when canonical bytes and registered SHA-256 already match. Preserve CAS/conflict checks for genuinely changed bytes.
6. Persist authority only when canonical authority bytes change semantically; an `updated_at` refresh alone must not produce a new fingerprint or pointer revision.

Legitimate post-edit autosave remains enabled because the gate should be based on explicit user mutation provenance plus semantic payload change, not on disabling the emitter or autosave generally.

## Required regression coverage

- A canonical mount with revision-owned authority completes hydration and, after all system effects settle, performs zero revision writes, workpiece-state writes, authority writes/CAS calls, manifest rewrites, or save events.
- Hydration/system mutations (selected transcript segment, linked selection, packaging-filtered selection, visual-preview hydration, `last_opened_at`, diagnostic origin) cannot set pending-save state.
- Two hydration emissions during an in-flight/no-op comparison cannot produce overlapping saves.
- Equal canonical bytes for editor session, transcript, audio, timeline, and placements do not upload or increment registry revisions/timestamps.
- A valid v1 timeline normalized to v2 remains in memory on mount and is not persisted until a real user edit; malformed/unsupported artifacts still fail closed.
- Existing v2 `debug_origin` and UI selection differences are classified as non-editorial mount state.
- Authority graph projection preserves hydrated `created_at`/`updated_at` on mount; release-only timestamps cannot enter persistence.
- Authority persistence remains `already_committed` for semantically identical authority and does not increment the pointer.
- A real transcript/timeline/placement/audio/authority edit still schedules one autosave, writes only semantically changed artifacts, advances authority only when authority semantics changed, and preserves current CAS/compensation behavior.

## Evidence

- CP-8 package: `D:\nursery\cp8-florida-dry-run-20260819-0530`
- CP-10 package: `D:\nursery\cp10-florida-acceptance-20260819`
- Repository receipts: CP-8, CP-9, and CP-10 Hammer editorial-authority documents.
- Diagnostic helper scripts and isolated replay live only in the ACL-restricted CP-10 evidence directory.

No repair, rollback, restoration of CP-9 bytes, history work, database mutation, or additional checkpoint was performed.
