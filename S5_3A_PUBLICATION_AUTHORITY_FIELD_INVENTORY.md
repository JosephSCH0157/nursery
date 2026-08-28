# S5-3A Publication Authority Field Inventory

Status: repository discovery only. This artifact changes no schema, contract, adapter, or publication behavior.

## Classification

| Classification | Meaning |
| --- | --- |
| Publication intent | Reviewed choice to publish one release. |
| Publication operation | Durable immutable authority for one publication identity. |
| Publication attempt | One execution try beneath an operation. |
| Publication receipt | Durable evidence of intended authority and observed external outcome. |
| Execution infrastructure | Mutable machinery allowed to execute the same identity. |
| Presentation / preview | Disposable client state with no external-side-effect authority. |
| Unresolved | Semantics cannot be proven from the repository. |

## Current fields and objects

| Field / object | Classification | Owner / persistence | Writers and readers | Observed semantics and risk |
| --- | --- | --- | --- | --- |
| `quench_release_manifest_snapshots.id` | Immutable manifest authority | Tongs DB | Tongs snapshots Hammer bytes; Quench open/decision reads | Exact publish-content snapshot candidate. |
| `manifest_content_hash` | Manifest evidence | Tongs DB | Snapshot/open/decision projections | Exact SHA-256 evidence; current adapter packet and receipt omit it. |
| `quench_open_authority_receipts` | Immutable review-open authority | Tongs DB | `open_quench_authority`; Quench reload | Freezes one manifest for review. It is not publication authority. |
| `quench_release_decision_revisions.id/revision` | Release-decision authority | Tongs DB, immutable | Explicit candidate/experiment commits; review projection | Bound to exact manifest/hash and planning destination capability. No execution destination binding. |
| `decision_content_hash` | Decision evidence | Tongs DB | Decision commit/replay | Useful evidence, but not passed to adapters. |
| `quench_release_operation_receipts.operation_id` | Decision-mutation idempotency only | Tongs DB | `commit_quench_release_decision` | Name is misleading for S5-3: it receipts decision mutation, not provider publication. Must not be promoted. |
| `publishing_executable_destinations.id` | Executable destination authority | Tongs DB | S5-2 provider discovery; workspace listing | Exact channel/feed/page/show. Not consumed by current Quench adapters. |
| `publishing_workspace_destination_grant_revisions` | Delegated workspace-use authority | Tongs DB, immutable revisions | Explicit workspace grant | Required for executability; no current publish invocation consumes it. |
| `publishing_destination_capability_revisions.id/revision/content_hash` | Observed executable-capability authority | Tongs DB, immutable | Provider discovery; destination listing | Exact destination evidence. Distinct from old planning-only `quench_destination_capability_revisions`. |
| `adapter_id/adapter_version` on capability revision | Reviewed execution implementation evidence | Tongs DB | Provider capability writer | Current static adapter registry ignores this binding. |
| `credential_authority_id/current_generation` | Execution infrastructure | Server-only Tongs DB | Provider connector/server executor | May rotate without changing publication identity. Raw credential material is excluded from Quench. |
| `ReleasePacket.release_packet_id` | Compatibility alias | Quench memory | Canonical case builder; adapters | Canonical case uses manifest snapshot ID, but packet omits manifest hash and decision/destination authority. |
| `ReleasePacket` media and metadata | Degraded publication input | Quench memory | Case builder; adapter `validate/publish` | Simplified projection; does not carry the complete reviewed authority chain. |
| `selectedPlatforms[]` | Presentation / unresolved intent | React state | Quench controls and publish effect | Platform strings currently select adapters. They do not identify executable destinations. |
| `publishOptions[platform]` | Mutable draft publication intent | React state | Quench controls and adapters | Mode, schedule, visibility can change and automatically re-invoke `publish`. Not durable or revisioned. |
| `runMode` | Presentation / execution switch | React state | Quench controls and adapters | Chooses stub versus live-not-implemented. Not operation identity. |
| `QUENCH_ADAPTERS` | Runtime implementation registry | Source code | Quench route | Static platform-based selection; no exact capability revision or destination binding. |
| `PlatformCapabilities` | Runtime preview capability | Adapter memory | `getCapabilities`; Quench display | Hard-coded booleans, not durable provider-observed evidence. |
| `PublishContext.request_id` | Presentation/debug token | React memory | `buildPublishContext`; receipts | Constant `quench_console_<mode>`, so it is neither unique nor idempotent. |
| `PublishContext.now_iso` | Attempt timestamp candidate | React memory | Built on each effect run | Legitimate attempt evidence, not authority. |
| `PublishContext.resolved_assets/readiness` | Mutable execution projection | React memory | Asset resolver/readiness; adapters | Recomputed from current case. It cannot retarget a frozen operation later. |
| `PlatformReceipt` | Ephemeral compatibility receipt | React memory | Adapter stub; publish board | Records platform/status/external fields/retry count only. Lacks operation, attempt, manifest, decision, destination, capability, and durable persistence. |
| `PlatformReceipt.external_id/external_url` | Potential external evidence | React memory | Future provider adapter | Currently null in stubs. Meaning and durability are unresolved. |
| `retry(receipt, context)` | Unresolved retry API | Adapter interface | YouTube/RSS stubs | Receives neither original packet nor frozen operation. It reconstructs options from receipt and cannot prove replay. No UI caller was found. |
| Adapter `queued/scheduled/published/failed/stubbed` | UI execution state | React memory | Adapter results | Too coarse for safe external execution; no `outcome_unknown`. |

## Entry-point result

The only current conceptual publication entry point is the `loadPublishBoard` React effect in `apps/nursery/src/routes/Quench.tsx`. It invokes `adapter.publish` automatically when its mutable dependency set changes. There is no durable Publish command, queued/scheduled worker, publication-operation row, publication-attempt row, provider upload call, or durable external receipt.

The YouTube connection vertical performs OAuth, credential refresh, account/channel discovery, grants, and capability observation only. It contains no video upload endpoint and establishes no provider-side publication idempotency guarantee.

