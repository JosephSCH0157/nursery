# S5-0 Quench Authority Field Inventory

Status: discovery artifact. It records observed semantics and authorizes no schema, contract, precedence, or behavior change.

## Classification vocabulary

| Classification | Meaning |
| --- | --- |
| `canonical authority` | Durable identity owned by Tongs or another explicit authority. |
| `snapshot identity` | Immutable/versioned identity of exact state. |
| `decision identity` | Durable explicit release/editorial choice. |
| `destination authority` | Publication target plus reviewed capability/configuration revision. |
| `operation identity` | One deliberate mutation or publication attempt. |
| `receipt identity` | Evidence of an operation and its external result. |
| `navigation context` | Routing/bootstrap information that must not retarget publication. |
| `compatibility state` | Historical or transitional representation. |
| `presentation/cache` | Disposable UI or access state. |
| `unresolved` | Semantics or authoritative owner cannot be proven. |

## Ingress and open identity

| Field / source | Classification | Owner / writer | Reader | Persistence | Current authority behavior |
| --- | --- | --- | --- | --- | --- |
| Route `workspace_id` aliases | navigation context | Hammer navigation, Nursery router | `parseForgeRouteContext`, AppShell, Quench | URL | UUID-normalized. AppShell initializes its workspace from route, otherwise browser cache. Prepared handoff disagreement with package is only a warning. |
| Route `workpiece_id` aliases | navigation context | Hammer/Nursery navigation | Quench, workspace bootstrap | URL | Direct open requires it. Prepared-package workpiece disagreement blocks. |
| AppShell `workspaceId` | navigation/cache context | route or active-workspace localStorage | Quench requests and metadata assist | React state plus browser cache | Used as authoritative request context on direct open; route/package/shell agreement is not represented as one open authority. |
| Episode workspace context | presentation/cache | `useWorkspaceBootstrap` from route/payload | continuity UI | sessionStorage-backed UI context | Explicitly described as noncanonical, but can retain navigation continuity. It is not publication authority. |
| `quench_open=prepared_release` | navigation context | Hammer handoff URL | Quench | URL | Selects prepared-handoff hydration mode. |
| `prepared_package_path` | compatibility/navigation locator | Hammer | Quench Tongs file read | URL points to persisted Tongs file | Locates mutable prepared-package state; not an immutable manifest identity. |
| `prepared_package_version` | compatibility assertion | Hammer | Quench | URL | Mismatch blocks. |
| `prepared_package_fingerprint` | compatibility assertion | Hammer local hash helper | Quench | URL | Mismatch warns and permits latest package. It is not the Tongs manifest SHA-256. |
| `prepared_package_prepared_at`, `prepared_package_state` | presentation/assertion | Hammer | Quench UI | URL | Not used to freeze publication identity. |
| `HammerPreparedReleasePackage.workspaceId/workpieceId` | canonical relationship assertion on mutable package | Hammer persisted artifact | Quench | Tongs workpiece file | Workpiece must agree with route. Workspace wins over handoff and shell through null-coalescing precedence. |

Evidence: `apps/hammer/src/editor/HammerWorkspaceShell.tsx:3685`, `apps/nursery/src/routes/Quench.tsx:139`, `apps/nursery/src/routes/Quench.tsx:337`, `apps/nursery/src/routes/AppShell.tsx:56`, `apps/nursery/src/hooks/useWorkspaceBootstrap.ts:37`.

## Package and manifest authority

| Field / object | Classification | Owner | Persistence / immutability | Consumers | Current risk |
| --- | --- | --- | --- | --- | --- |
| Hammer prepared release package | compatibility state / unresolved package semantics | Hammer | Versioned Tongs file, but Quench rereads the current file at open | Handoff verifier | Acts as an opening handshake; it is not retained as the exact object later sent to adapters. |
| `hammer/release-packet/manifest.v1.json` workpiece file | canonical current-file authority | Hammer via Tongs | Mutable versioned workpiece-file pointer | Tongs projection | Current file can advance after an earlier Quench review. |
| `quench_release_manifest_snapshots.id` | snapshot identity | Tongs `snapshot_quench_release_manifest` | Immutable DB row containing exact manifest bytes | canonical projection and release decisions | This is the strongest existing candidate for release-manifest authority. Adapter publication does not consume it as a frozen authority. |
| `manifest_content_hash` | snapshot evidence | Tongs | Immutable SHA-256 on snapshot | decisions/applicability/projection | Preserved in projection and decision, then omitted from `ReleasePacket` and adapter receipt. |
| `QuenchCanonicalReleaseProjection` | current authority projection, not itself immutable | Tongs service | Ephemeral response built by rereading current manifest, metadata, candidate set, scopes, decisions | Quench route | A refresh can project a newer manifest and replace the open case. |
| `ReleasePacket.release_packet_id` | snapshot alias in canonical case; compatibility elsewhere | Quench case builder / fixtures | React state | adapters | Canonical builder places manifest snapshot ID here, but the type does not require manifest hash or distinguish package from manifest. |
| `HammerReleasePacketManifest` parser contract | compatibility state | Quench ingest parser | code contract | legacy ingest/tests | Stale relative to S4-4: visual `media_reference` and packaging media readiness are not represented. |

Evidence: `supabase/migrations/20260718160000_tongs_quench_release_decisions.sql:9`, `packages/tongs/src/workpiece-commit-api.ts:12248`, `apps/nursery/src/routes/Quench.tsx:166`, `apps/quench/src/core/hammer-release-packet.types.ts`, `apps/quench/src/core/hammer-release-packet.ingest.ts`.

## Release candidate and decision identity

| Field / object | Classification | Owner | Persistence | Current behavior |
| --- | --- | --- | --- | --- |
| thumbnail candidate/set/revision/hash | snapshot/derivative identity | Tongs thumbnail authorities | Durable versioned rows | Exact set membership and evidence are validated before decision commit. |
| `quench_release_decision_revisions.id/revision` | decision identity | Tongs | Immutable DB revisions | Binds exact manifest snapshot/hash, metadata, candidate set, brand binding, capability revision, and assignments. |
| `quench_release_decision_sequences.current_*` | mutable current pointer | Tongs | DB | Selects current decision per workspace/workpiece/destination. A changed input yields `requires_review`/`blocked`. |
| candidate assignments | decision evidence | Tongs | Immutable DB rows | Explicit selected/control/variant roles. No canonical first-candidate selection was found. |
| local `selectedCaseId` and `releaseCases[0]` | presentation selection with positional fallback | Quench | React state | Missing case ID falls back to first case. Production normally has one case, but position is still allowed to choose it. |
| local experiment control/variant IDs | draft decision input | Quench | React state | Becomes durable only after Tongs commit. |
| local selected platforms/options | unresolved release decision | Quench | React state only | Not bound to the durable release decision or a manifest revision; directly controls adapter execution. |

## Destination capability

| Field / object | Classification | Owner | Persistence | Current behavior |
| --- | --- | --- | --- | --- |
| destination scope ID | destination-intent authority | Tongs | DB | Names platform and adapter, currently seeded as system `intent_only` scopes. |
| destination capability revision ID/revision/hash | destination review authority | Tongs | Immutable DB revision plus mutable current pointer | Release decisions freeze it; applicability reports `capability_advanced`. |
| `connection_ref` | unresolved execution relationship | Tongs scope | Nullable DB field | Seeded scopes do not prove a provider account/channel connection. |
| `PlatformCapabilities` | runtime adapter capability/cache | adapter implementation | React state after mount | Boolean feature flags only; no scope ID, revision, hash, account/channel, config, or adapter version. |
| adapter `platform` / static `QUENCH_ADAPTERS` | runtime implementation selection | Quench code | code/runtime | Selected by mutable platform string, not the reviewed destination scope/capability revision. |

## Publication operations, retries, and receipts

| Field / object | Classification | Owner | Persistence | Current behavior |
| --- | --- | --- | --- | --- |
| decision mutation `operation_id` | operation identity for decision commit only | Quench caller + Tongs RPC | Immutable `quench_release_operation_receipts` | Idempotent replay/conflict semantics are implemented for release-decision mutation. |
| `quench_release_operation_receipts` | decision-mutation receipt identity | Tongs | Immutable DB | Despite its name, it records `commit_release_decision`, not external publication. |
| adapter publish invocation | unresolved publication operation | Quench effect | none | No frozen operation object/ID. It automatically reruns when mutable dependencies change. |
| `PublishContext.request_id` | presentation/debug token | Quench | ephemeral | Constant `quench_console_<mode>`; not unique per publication. |
| `PublishContext.now_iso` | presentation/execution timestamp | Quench | ephemeral | Recreated for each effect invocation/retry. |
| `PlatformReceipt` | compatibility/ephemeral execution result | adapter | React state only | Lacks workspace, workpiece, manifest hash, decision revision, capability revision, operation ID, adapter version, and retry ancestry. |
| adapter `external_id/external_url` | external receipt evidence when present | platform adapter | ephemeral today | Stub/live-not-implemented paths normally provide none. |
| `retry(receipt, currentContext)` | unresolved retry semantics | adapter | none | Does not receive the original packet/options/operation authority; therefore cannot prove replay of the same publication identity. |

Evidence: `apps/quench/src/adapters/adapter.contract.ts:38`, `apps/quench/src/adapters/youtube/youtube.adapter.ts:147`, `apps/quench/src/adapters/rss/rss.adapter.ts:128`, `apps/nursery/src/routes/Quench.tsx:620`, `supabase/migrations/20260718160000_tongs_quench_release_decisions.sql:92`.

## Media and recording identity

| Field / transformation | Classification | Current behavior |
| --- | --- | --- |
| S4 package visual `media_reference.canonicalAssetId/hash` | canonical asset authority/evidence | Present in current Hammer contract, but the Quench legacy manifest parser drops it and retains `asset_path`; canonical route case does not carry visuals to adapters. |
| visual `asset_path` | presentation/access evidence | Retained by legacy ingest even when canonical media identity is dropped. It must not select media. |
| manifest audio `media_id` | canonical recording/media reference in Hammer packet | Copied into `ReleasePacket.audio_export_id`. Recording revision/hash lineage is not carried into adapter receipts. |
| audio `workpiece_path/local_relpath` | access evidence | URI precedence is `workpiece_path ?? local_relpath ?? workpiece-media://...`; adapters consume resolved access state. |
| `video_export_id` | unresolved for canonical case | Set to null by `buildCanonicalReleaseCase`; no canonical master video publication identity was found in the live adapter path. |
| `thumbnail_asset_id` | unresolved adapter input | Set to null by canonical case even when a durable thumbnail decision exists. |
| rendered output identity | unresolved | No durable source-to-rendered-artifact publication binding was found in Quench execution. |

## Inventory conclusion

The repository already has strong immutable manifest, decision, and reviewed-capability authorities. The live publication seam bypasses their composite identity. The most important unresolved identity is therefore not a missing field name; it is the absent persisted publication-operation authority binding those existing objects to one adapter execution and receipt.
