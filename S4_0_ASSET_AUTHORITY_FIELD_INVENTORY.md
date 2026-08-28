# S4-0 Asset Authority Field Inventory

Status: contract-discovery artifact; no schema redesign or field renaming is authorized by this document.

## Inventory rule

An identifier belongs here when it can select, bind, hydrate, place, persist, or package production media. Classification follows observed behavior, not spelling.

| Classification | Meaning |
| --- | --- |
| `canonical` | Durable `tongs.assets.id` identity or a database relationship proven to reference it. |
| `timeline-local` | Hammer editorial, placement, lane, clip, operation, or runtime identity. |
| `derivative` | Identity of a script-derived plan, revision, beat, opportunity, candidate, recipe, or selection. |
| `legacy-derived` | Historical or compatibility identity synthesized from a path, filename, URL, storage key, or another noncanonical value. |
| `unresolved` | Current semantics cannot be proven to be exactly one of the preceding meanings. Ambiguity is preserved. |

## Canonical Tongs asset registry

| Field / surface | Classification | Writer(s) | Reader(s) | Persistence and scope | Path/hash/URL role | Packaging reach | Fallback or risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `tongs.assets.id` | canonical | Tongs asset staging, generation, acquisition and upload RPCs | Tongs APIs, Hearth, Hammer projections | DB; workspace + normally workpiece | Server row also owns `storage_key`, `path`, `content_hash`; these are evidence, not the PK | Indirect through derivative and Hammer surfaces | Canonical root. Initial schema makes `workpiece_id` non-null, so workspace-global reuse is not yet represented by this table. |
| `tongs.assets.workspace_id` | canonical relationship | Same as asset row | RLS and authority RPCs | DB; workspace | None | Must constrain all use | RLS checks workspace access, but not every downstream JSON reference has a relational constraint. |
| `tongs.assets.workpiece_id` | canonical relationship | Same as asset row | Asset verification RPCs | DB; workpiece | None | Must constrain scoped use | Non-null currently means global assets need a different existing authority or a future explicit scope model; null must never mean unknown. |
| `tongs.assets.storage_bucket`, `storage_key` | canonical evidence, not identity | Tongs service after storage write | signed-URL/read APIs, Hearth/Hammer preview | DB; object location | Direct storage locator; unique pair | Currently leaks into Hammer asset objects and packages | Can be used to reconstruct legacy Hammer IDs; must not authorize new production use. |
| `tongs.assets.path` | canonical evidence, not identity | Tongs asset operations | Hearth packages, Hammer hydration/UI | DB; workpiece-relative presentation path | Path | Currently reaches Hammer and Quench visuals | Same conventional path can later describe different content; unsafe as identity. |
| `tongs.assets.content_hash` | canonical evidence, not identity | Tongs service after verified bytes | derivative rows and verification RPCs | DB; content evidence | Hash | Sometimes copied into derivative records | Useful for contradiction detection; cannot replace the canonical ID. |
| `tongs.assets.supersedes_asset_id` | canonical relationship | Asset replacement flows | Tongs/Hearth projections | DB; asset lineage | None | Indirect | `on delete set null`; it expresses lineage, not permission to substitute the successor. |
| `tongs.assets.asset_kind`, `status`, `ready_at`, intrinsic metadata | canonical evidence | Tongs service/RPCs | readiness and derivative verification | DB | None | Readiness decisions | Kind/status checks exist in several domain RPCs but are not exposed as one shared resolver contract. |

## Hearth and Tongs script-derived authorities

| Field / surface | Classification | Writer(s) | Reader(s) | Persistence and scope | Path/hash/URL role | Packaging reach | Fallback or risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `script_approval_revisions.id` + `approval_revision` + `script_content_hash` | derivative basis authority | Tongs approval RPC | Image Map, B-roll, Reference Clip/Visual, Hammer | DB; workspace/workpiece | Hash proves exact script text | Yes, via visual package and Hammer evidence | Already relationally strong and should become the shared `ScriptDerivativeBasis`. |
| `image_map_revisions.id` / entry `id` / beat IDs | derivative | Tongs image-map commit/repair | Hearth, Hammer hydration | DB revision + JSON document; workpiece | Entry JSON may carry paths | Yes | Entry identity is not media identity. |
| Image Map `candidate_assets[].asset_id` | canonical when produced by current Tongs candidate RPC; unresolved in legacy package JSON | Tongs candidate-generation/upload operations; older package writers | Hearth candidate UI, Hammer visual hydration | DB-backed immutable revision document and compatibility package JSON | Adjacent `path`, `storage_key`, variant metadata | Yes | Type is plain string. Legacy documents do not themselves prove the FK or relationship. |
| Image Map `selected_asset_id` | canonical reference when current Tongs selection RPC validates membership | Tongs `select_image_map_candidate` | Hearth, Hammer | DB image-map revision JSON; workpiece | Neighboring path can influence hydration | Yes | Hammer currently falls back to `candidate_assets[0]` when selection is absent, manufacturing production choice. |
| `broll_plan_revisions.id`, `broll_beat_revisions.beat_id/id`, prompt IDs | derivative | Tongs B-roll plan/prompt RPCs | Hearth and unified plan | DB; workspace/workpiece | Hashes establish immutable derivative revisions | Yes | Not assets. Plain UUID/string types can be confused with asset IDs in clients. |
| `broll_candidate_revisions.id` / `candidate_id` | derivative | Tongs verified candidate commit | Hearth selection and Hammer plan reads | DB; workspace/workpiece/beat | Copies asset evidence | Yes | Candidate identity explains a choice/revision; it is not the media object. |
| `broll_candidate_revisions.asset_id`, `poster_asset_id` | canonical | Tongs verification RPC after exact workspace/workpiece/kind/readiness checks | Hearth, unified plan, Hammer | DB FK to `tongs.assets`; workpiece | Copies content hash, path, bucket/key | Yes | Direct FK exists, but same-workspace/workpiece is enforced procedurally rather than by a composite FK on the candidate row. |
| `broll_selections.candidate_revision_id` | derivative selection | Tongs selection RPC | Hearth/unified visual plan | DB; workpiece/beat | None | Indirect | Selection must resolve candidate then asset; it is not itself an asset reference. |
| `reference_clip_*` plan/opportunity/candidate/selection IDs | derivative | Tongs Reference Clip RPCs | Hearth, unified plan, Hammer | DB; workspace/workpiece | Candidate rows carry canonical media evidence | Yes | Candidate and asset IDs coexist under generic string client types. |
| Reference Clip candidate `asset_id`, `poster_asset_id` | canonical when current DB row/RPC verifies it | Tongs acquisition/candidate commit | Hearth/Hammer | DB FK; workpiece | Evidence includes storage/hash/media metadata | Yes | Compatibility projections must not degrade this to URL/path identity. |
| `reference_visual_*` plan/opportunity/recipe/evidence/candidate/selection/sequence IDs | derivative | Tongs Reference Visual RPCs | Hearth and unified plan | DB; workspace/workpiece | Candidate projection creates signed `imageUrl` for display | Yes | `imageUrl` is ephemeral and must never become identity. |
| Reference Visual candidate `asset_id` and sequence membership `asset_id` | canonical | Tongs render/acquisition/sequence RPCs | Hearth/Hammer | DB FK; workpiece | Asset storage key is used only to create a display URL in the current Hearth reader | Yes | Current server checks workspace/workpiece/readiness in key write RPCs. Public client type is still `string | null`. |
| Unified visual-plan revision/member/opportunity IDs | derivative | Tongs unified visual plan RPC | Hearth/Hammer projection | DB; workspace/workpiece, based on exact approval | None directly | Yes | These express purpose and grouping, not media identity. |
| Thumbnail v2/v3 `base_version.id`, `candidate_revision_id`, `candidate_set_id`, recipe/title/concept/binding IDs | derivative | Hearth package mutation + Tongs thumbnail RPCs | Hearth and Quench thumbnail decisions | DB/package projections; workpiece | Hashes establish immutable recipes/revisions | Yes | Many UUID-shaped concepts coexist with assets under plain strings. |
| Thumbnail `base_artwork_asset_id`, `composite_asset_id`, launch snapshot `asset_id` | canonical when returned/read back from Tongs lifecycle endpoints | Tongs stage/render/finalize flows, then Hearth package commit | Hearth and Quench | DB asset + package pointer; workpiece | Package also repeats path/hash/storage evidence | Yes | Strong readback exists in v3, but public package fields are unbranded strings and older v2 fields need classification per row. |
| `EpisodeMediaMapSource.asset_id`, B-roll `selected_asset_id`, `attached_asset_id`, visual actionability `asset_id` | unresolved | Hearth package builders and client actionability helpers | Hearth and Hammer compatibility readers | Persisted episode package or client state; workpiece | Some helpers create client IDs and attach URLs/paths | Can enter visual plan projections | Semantics vary by writer. `hearth-visual-actionability.ts` creates client IDs such as `broll-manual-result-*`; those cannot be presumed canonical. |

## Hammer persisted and runtime authority

| Field / surface | Classification | Writer(s) | Reader(s) | Persistence and scope | Path/hash/URL role | Packaging reach | Fallback or risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `HammerVisualAsset.asset_id` | unresolved | Canonical package hydration, manual/seeded asset creation, legacy migration | Timeline reducer, persistence, placement and UI | Persisted Hammer timeline JSON; workpiece | May be canonical ID or path-derived synthetic ID | Yes | One field currently carries canonical and legacy-derived meanings. Highest-risk conflict. |
| `HammerVisualAsset.asset_ref` | unresolved | Hydration/migration | Placement contracts and preview resolution | Persisted; workpiece | Can equal asset ID, path or storage key | Yes | Required even when `asset_id` is nullable; no single semantics. |
| `HammerVisualAsset.path`, `storage_key` | evidence/locator, not identity | Hydration/migration | Preview and packaging | Persisted | Direct locator | Yes | Legacy migration uses either to synthesize `asset_id`. |
| `HammerVisualClip.clip_id` | timeline-local | Hammer placement/reducer/migration | Lanes, selection, history, composition commands | Persisted; timeline | None | Placement ID may reach artifacts | Legacy default can be `clip_${asset_id}`, coupling placement identity to ambiguous media identity. |
| `HammerVisualClip.asset_id` | unresolved reference | Hydration, placement commands, legacy migration | Reducer, persistence, packaging | Persisted; timeline/workpiece | Resolves through local `assets[]` map | Yes | Only proves membership in Hammer's local asset array, not `tongs.assets`. |
| `HammerVisualClip.system_asset_id` | unresolved | Intro/outro synchronization | UI and persistence | Persisted; workpiece | Candidate list may derive it from path | Yes | Can contain canonical ID or path-derived Hammer ID. |
| `HammerVisualLane.lane_id`, `clip_ids[]`, `selected_clip_id` | timeline-local | Hammer reducer | Timeline UI/persistence | Persisted; timeline | None | No media authority by itself | Correctly editorial, but plain strings allow accidental interchange. |
| `HammerVisualPlacementRecord.placement_id` | timeline-local | Hammer placement generator | Persistence, package building, history | Persisted; workpiece | Legacy asset migration can fall back to `placement_id` as an identity seed | Yes | A placement ID must never create media identity. |
| Placement `asset_id` / `asset_ref` | unresolved | Automatic/manual placement and legacy normalization | Timeline migration/hydration/packages | Persisted | Adjacent `asset_path`, `storage_key` | Yes | Current normalizer accepts nullable `asset_id` but requires generic `asset_ref`; canonical relationship is not validated. |
| Placement `asset_path`, `storage_key` | evidence/locator, not identity | Visual package placement | Preview/package readers | Persisted | Direct locator | Yes | Currently enough to create a stable Hammer asset ID during migration. |
| `HammerPackagingIntentV1.intro_asset_id`, `outro_asset_id` | unresolved | UI selection/profile/default sync | Timeline persistence and packaging sync | Persisted; workpiece | Candidate `assetId` can be derived from path | Yes | Missing selection stays visibly unresolved, which is good; candidate construction still permits path-derived identity. |
| `HammerStoredMediaFile.assetId` / storage-tree `asset_id` | unresolved by row | Tongs storage-tree projection and Source Desk upload/read | Source Desk, intro/outro and manual placement | Runtime projection; workpiece | File path, hash and MIME sit beside optional ID | Yes | A missing ID remains possible; downstream code sometimes hashes the path instead of requiring canonical registration. |
| Source Desk preview identity key | timeline-local cache key | Hammer `buildHammerAssetIdentityKey` | Preview cache/telemetry | Ephemeral; workpiece | Combines workpiece, generic asset ID and variant | No direct authority | Safe only as a cache key; it does not validate the embedded asset ID. |
| `HammerProgramPackageV1.thumbnail_asset_id`, `reference_asset_ids`, intro/outro clip IDs | unresolved mixed package fields | Hammer program assembly | Render/package surfaces | Persisted/derived package | Not enough relationship evidence | Yes | Names distinguish clip vs asset, but asset fields are plain strings without canonical validation envelope. |
| Composition `composition_id`, operation/instruction IDs, graph IDs | timeline-local/editorial | Hammer editing commands | History/render assembly | Persisted Hammer revision/history | None | Yes | Not media identities, though B-roll instructions carry `asset_ref`. |
| Editorial `insert_broll.asset_ref` and `asset_binding_state` | unresolved | Hammer operations | Render and Quench packet summary | Persisted editorial graph | Generic ref may be any string | Yes | `resolved` means locally bound, not necessarily canonical Tongs authority. |
| Manual image/B-roll/reference placement `assetPath` -> `asset_id` | legacy-derived | `useHammerWorkspaceShellVisualEditing` | Timeline reducer/persistence/package | Persisted; workpiece | Sets `asset_ref`, `asset_path`, and `storage_key` to the path, then hashes it | Yes | This is an active writer, not merely a historical reader. It must be retired for new production writes. |
| Packaging logo/background replacement path-derived IDs | legacy-derived | Hammer shell/visual editing | Timeline and effect/packaging state | Persisted/editorial | Selected file path is hashed or first library path is chosen | Can affect production output | Effects remain outside Slice 4 behavior scope, but their media identity writers are inside the inventory and cannot claim canonical status. |

## Packaging and package projections

| Field / surface | Classification | Writer(s) | Reader(s) | Persistence and scope | Path/hash/URL role | Packaging reach | Fallback or risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `HammerQuenchReleasePacketVisualPlacement.placement_id` | timeline-local | Hammer packet builder | Quench | Artifact JSON; workpiece | None | Final handoff | Appropriate placement identity. |
| Release visual `asset_path` | evidence/locator, not identity | Hammer packet builder | Quench | Artifact JSON | Path is the only emitted media reference in current visual rows | Final handoff | Packaging currently loses canonical asset identity entirely. |
| Release audio `media_id`, `local_relpath`, `workpiece_path` | unresolved for Slice 4 visual scope | Hammer recording/media prep | Quench | Artifact JSON | Multiple locators plus recording media ID | Final handoff | Recording authority is governed by earlier slices; do not conflate it with `tongs.assets.id`. |
| Quench asset resolver path/source fields | unresolved compatibility | Quench ingest/adapters | Publisher adapters | Runtime/release projection | Path/URL centric | Publication | Full Quench authority is Slice 5, but Slice 4 must ensure Hammer does not label path-only visuals canonical. |
| Episode/package projection `selected_asset` object | unresolved envelope | Tongs/Hammer compatibility adapters | Hammer | API/package JSON | Repeats ID, path, storage key and metadata | Yes | Some adapters fabricate empty bucket/key and promote first candidate. Projection presence does not prove canonical validation. |

## Explicitly ephemeral and non-authoritative values

Signed image URLs, browser object URLs, preview `src`, cached image objects, selected-card UI state, filenames, display labels, prompt IDs, provider request IDs, operation IDs, content hashes, storage keys, and file paths may support display, retry, evidence, or idempotency. None independently establishes canonical production-media identity.

## Unresolved stop-rule findings

The following must remain `unresolved` until row-level or writer-specific evidence is gathered during migration design:

- Existing `HammerVisualAsset.asset_id`, placement `asset_id`, `asset_ref`, and packaging intro/outro IDs.
- Legacy episode-package media-map and visual-actionability asset strings.
- Older thumbnail v2 package asset strings that were not produced through the current Tongs lifecycle/readback seam.
- Any persisted visual reference for which only a path, URL, storage key, filename, local ID, or local asset-array membership survives.

S4-0 does not infer canonical identity for any of them.

## Audit coverage and evidence index

The inventory searched executable TypeScript/TSX, public contracts, Tongs API dispatch, current Supabase migrations, Hammer persistence/composition/package builders, Hearth package schemas and visual authorities, and Quench ingest/resolution surfaces. It intentionally excluded build output, source maps, archived copies, fixtures as authority, and temporary extracted editor files.

Primary evidence surfaces:

- `supabase/migrations/20260228170000_tongs_assets_table.sql`
- `supabase/migrations/20260721120000_tongs_script_approval_image_map_revision_authority.sql`
- `supabase/migrations/20260803153000_tongs_image_map_candidate_selection_authority.sql`
- `supabase/migrations/20260803170000_tongs_broll_v2_authority.sql`
- `supabase/migrations/20260804170000_tongs_reference_clip_authority.sql`
- `supabase/migrations/20260805120000_tongs_reference_visual_authority.sql`
- `apps/hearth/src/lib/episode-package-v2.ts`
- `apps/hearth/src/lib/episode-package-v3.ts`
- `apps/hearth/src/lib/hearth-thumbnail-v3-api.ts`
- `apps/hearth/src/lib/hearth-visual-actionability.ts`
- `apps/hammer/src/visuals/model/hammerVisualTypes.ts`
- `apps/hammer/src/visuals/model/hammerVisualMigrations.ts`
- `apps/hammer/src/lib/hammerAssetIdentity.ts`
- `apps/hammer/src/lib/hammerVisualPlacements.ts`
- `apps/hammer/src/lib/hammerSourceDeskMediaApi.ts`
- `apps/hammer/src/editor/useHammerWorkspaceShellVisualEditing.ts`
- `apps/hammer/src/lib/hammerQuenchReleasePacket.ts`
- `packages/tongs/src/hammer-visual-placements-contract.ts`
- `packages/tongs/src/workpiece-commit-api.ts`
- `apps/quench/src/core/hammer-release-packet.ingest.ts`
- `apps/quench/src/core/asset-resolver.ts`
