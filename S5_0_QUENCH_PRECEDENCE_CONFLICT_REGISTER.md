# S5-0 Quench Precedence and Conflict Register

Status: discovery artifact. Severity describes risk and is not permission to repair it in S5-0.

## Current precedence map

| Concern | Current sources | Current winner | Conflict behavior |
| --- | --- | --- | --- |
| Shell workspace | URL workspace / active-workspace localStorage | URL, otherwise localStorage | Shell state initializes silently. |
| Direct Quench workspace | shell workspace / route workpiece | shell workspace sent with route workpiece | Tongs membership assertion rejects disagreement. |
| Prepared handoff workspace | prepared package / handoff route / shell | `package ?? handoff ?? shell` | package-vs-route mismatch warns; continuation allowed. |
| Prepared handoff workpiece | package / handoff route | must agree | mismatch blocks. |
| Prepared package version | package / route assertion | exact agreement | mismatch blocks. |
| Prepared package fingerprint | current package / route assertion | current package | mismatch warns and adopts latest. |
| Open manifest | prepared package / current Hammer manifest file | current Hammer manifest snapshotted by projection | prepared package does not freeze adapter input. |
| Open release case | selected case ID / available cases | selected ID, otherwise `releaseCases[0]` | positional fallback. |
| Canonical thumbnail destination | active YouTube scope / first active scope | YouTube, otherwise first active | destination intent can be selected by availability/order. |
| Candidate choice | immutable Tongs decision / local draft | Tongs only after explicit commit | no canonical first-candidate fallback found. |
| Publish destination | reviewed Tongs scope / selected platform UI | selected platform UI | no agreement check. |
| Publish capability | reviewed capability revision / runtime adapter capabilities | runtime adapter | no identity/revision binding. |
| Adapter payload | manifest snapshot / current projection / simplified packet / UI options | simplified packet plus current UI state | reviewed composite authority is not frozen. |
| Metadata assist identity | shell workspace / packet workspace and route workpiece / packet workpiece | shell then packet; route then packet | can differ from selected canonical case identity. |
| Audio locator | workpiece path / local relative path / synthesized URI | first non-null | access fallback; media ID remains separate but receipt lineage is lost. |
| Retry | prior receipt / current publish context | current context | original packet/decision/capability cannot be proven. |

## Numbered conflicts

### S5-C01 — No publication-operation authority

- Severity: **Critical**
- Locations: `apps/nursery/src/routes/Quench.tsx` publish-board effect; `apps/quench/src/adapters/adapter.contract.ts`
- Competing sources: current projection, simplified packet, platform selection, options, resolved-asset cache, runtime capability.
- Current behavior: adapter publication is invoked automatically from mutable state without a frozen operation ID or composite authority.
- Failure: a dependency change can create a different effective publication after review or trigger another call.
- Classification: unresolved publication operation.
- Likely future slice: S5-3.
- Durable corruption: live publishing is not implemented, so current external risk is latent; enabling it would make the risk critical.

### S5-C02 — Package/handoff/shell workspace precedence

- Severity: **Critical**
- Location: `apps/nursery/src/routes/Quench.tsx` prepared handoff loader.
- Current behavior: `pkg.workspaceId ?? handoff.workspaceId ?? shell.workspaceId`; package/handoff disagreement warns rather than requiring agreement.
- Failure: navigation context can disagree while Quench continues under a selected winner.
- Classification: navigation context competing with canonical relationship.
- Likely future slice: S5-2.
- Durable corruption: decision writes are server-validated, but the open context can be misleading or retargeted before the server rejects/accepts a later action.

### S5-C03 — Prepared package is not the retained publication object

- Severity: **High**
- Locations: Quench handoff loader and `getQuenchCanonicalReleaseProjection`.
- Current behavior: Quench verifies a prepared file, then asks Tongs for the current Hammer manifest; later decision refreshes rebuild the case from current state.
- Failure: an already-open release can adopt a newer Hammer package/manifest after refresh rather than requiring review/rebase.
- Classification: mutable reread.
- Likely future slice: S5-1/S5-2.

### S5-C04 — Manifest authority is degraded into `ReleasePacket`

- Severity: **Critical**
- Location: `buildCanonicalReleaseCase`.
- Current behavior: preserves snapshot ID as `release_packet_id` but drops hash, decision, capability, canonical visuals, and source lineage.
- Failure: adapter cannot prove which exact reviewed manifest it received.
- Classification: identity degradation.
- Likely future slice: S5-1/S5-3.

### S5-C05 — Reviewed destination and executing adapter are unrelated authorities

- Severity: **Critical**
- Locations: Tongs destination tables; `QUENCH_ADAPTERS`; `PlatformCapabilities`.
- Current behavior: decisions bind an immutable intent-only capability revision, while publishing selects a runtime adapter by platform string and current boolean capabilities.
- Failure: account/channel/config/capability can change or be different from what was reviewed.
- Classification: unverified destination relationship.
- Likely future slice: S5-3.

### S5-C06 — Release decision does not drive adapter publication

- Severity: **Critical**
- Locations: canonical thumbnail UI versus publish-board case builder.
- Current behavior: durable candidate decisions are displayed and persisted, but canonical `ReleasePacket.thumbnail_asset_id` remains null; selected platforms/options are local state.
- Failure: external payload can differ from reviewed release choice.
- Classification: parallel decision authorities.
- Likely future slice: S5-3/S5-4.

### S5-C07 — S4 canonical visual identity is dropped by Quench

- Severity: **Critical**
- Locations: `hammer-release-packet.types.ts`, `hammer-release-packet.ingest.ts`, `buildCanonicalReleaseCase`.
- Current behavior: legacy parser retains `asset_path` and omits S4 `media_reference`; adapter packet carries no visual placements.
- Failure: Quench cannot prove exact visual assets and can regress to path-shaped evidence.
- Classification: identity dropped / contract drift.
- Likely future slice: S5-1/S5-4.

### S5-C08 — Two incompatible “operation receipt” concepts

- Severity: **High**
- Locations: `quench_release_operation_receipts` and `PlatformReceipt`.
- Current behavior: the DB receipt proves decision mutation; the UI receipt describes an ephemeral adapter result. Neither is a publication-operation receipt with full lineage.
- Failure: code/review can mistake decision idempotency for publication idempotency.
- Classification: semantic name collision.
- Likely future slice: S5-3/S5-4.

### S5-C09 — Retry is not provably replay

- Severity: **High**
- Locations: adapter `retry` contract and YouTube/RSS implementations.
- Current behavior: retry receives only a prior receipt plus newly built current context; original packet/options/authority are absent.
- Failure: retry can change effective publication identity and has weak ancestry (`external_id` may be null).
- Classification: re-resolution / unresolved retry semantics.
- Likely future slice: S5-5.

### S5-C10 — Adapter receipts do not prove intent or execution lineage

- Severity: **High**
- Location: `PlatformReceipt`.
- Current behavior: ephemeral result contains platform/external fields, summary, request ID, and count only.
- Failure: cannot prove exact workspace, workpiece, manifest hash, decision, capability, operation, adapter revision, or retry ancestry.
- Classification: insufficient receipt authority.
- Likely future slice: S5-4.

### S5-C11 — Publish is effect-driven instead of explicit-operation-driven

- Severity: **Critical**
- Location: Quench publish-board `useEffect`.
- Current behavior: selection/options/readiness/resolved-assets/run-mode changes can invoke `adapter.publish` without a distinct Publish authorization event.
- Failure: duplicate or unintended external calls once live adapters exist.
- Classification: mutable UI state treated as operation authority.
- Likely future slice: S5-3.

### S5-C12 — Release case fallback chooses by position

- Severity: **Medium**
- Location: Quench selected-case effects.
- Current behavior: missing selected ID becomes `releaseCases[0]`.
- Failure: absence of an explicit selection can become a case choice; current production list normally contains one canonical case.
- Classification: presentation fallback with future authority risk.
- Likely future slice: S5-2.

### S5-C13 — Destination scope fallback chooses “first active”

- Severity: **High**
- Location: thumbnail destination-scope selection in Quench.
- Current behavior: prefer YouTube, else first active scope.
- Failure: release decision can be targeted to a destination chosen by availability/order, not explicit intent.
- Classification: destination precedence.
- Likely future slice: S5-2/S5-3.

### S5-C14 — Metadata assist uses a different identity precedence

- Severity: **Medium**
- Location: Quench metadata-assist request.
- Current behavior: shell workspace precedes packet workspace; route workpiece precedes packet workpiece.
- Failure: assisted metadata can be requested for context different from the selected release case.
- Classification: competing navigation/presentation authority.
- Likely future slice: S5-2.

### S5-C15 — Canonical master recording lineage becomes partial

- Severity: **High**
- Locations: canonical case builder and RSS adapter summary.
- Current behavior: audio media ID survives, but recording revision, package hash, and exact source evidence do not survive into receipt; canonical video ID is null.
- Failure: receipt cannot prove the exact released master.
- Classification: lineage degradation / video unresolved.
- Likely future slice: S5-1/S5-4.

### S5-C16 — Runtime destination account/channel authority is absent

- Severity: **Critical**
- Locations: destination schema and adapter contract.
- Current behavior: system scopes are `intent_only`; `connection_ref` is null; runtime adapters expose no account/channel/config revision.
- Failure: an eventual live publication destination cannot be proven from reviewed authority.
- Classification: unresolved destination execution authority.
- Likely future slice: S5-3. This is a stop-rule finding; do not invent an account registry during S5-0.
