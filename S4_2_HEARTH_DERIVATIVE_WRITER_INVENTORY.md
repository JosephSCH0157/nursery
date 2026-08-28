# S4-2 — Hearth Derivative Writer Inventory

This inventory is intentionally limited to forward Hearth writers. Hammer readers and packaging are excluded.

| Writer | Derivative | Approval basis | Media authority before S4-2 | S4-2 disposition |
|---|---|---|---|---|
| Unified Visual Plan | Image Map, B-roll, Reference Clip, Reference Visual plan revisions | Exact approval ID/revision/hash read by Tongs | No media at plan creation | Already canonical; retained. |
| Canonical Image Map generation | Image Map candidate | Canonical Image Map approval revision | Tongs creates `tongs.assets` rows | Already canonical; retained. |
| Image Map creator upload | Image Map candidate | Canonical Image Map revision | Client request UUID was promoted into `tongs.assets.id` | Tongs now issues a different server UUID, preserves the client UUID only as request provenance, and returns canonical readback. Selection requires S4-1 `ready` authority. |
| Canonical B-roll v2 acquisition/generation | B-roll candidate revision | Canonical B-roll plan approval | Tongs acquisition/verification RPC creates or validates the asset | Already canonical; retained. |
| Canonical Reference Clip candidate commit | Reference Clip candidate revision | Canonical Reference Clip plan approval | Tongs validates canonical asset/workpiece/kind | Already canonical; retained. |
| Canonical Reference Visual render/acquisition | Reference Visual candidate revision | Reference Visual plan approval tuple | Tongs render/acquisition RPC creates asset and candidate | Already canonical; retained. |
| Thumbnail v3 render/finalize | Thumbnail derivative revisions | Tongs thumbnail recipe/approval lineage | Tongs stages, renders, and returns canonical asset readback | Already canonical; retained. |
| Legacy B-roll episode-package save | B-roll compatibility plan | Previously package/current UI state | Could persist ambiguous asset-shaped strings | Every forward save now fetches and stamps exact production-script basis. |
| Legacy Reference Clip episode-package save | Reference Clip compatibility plan | Previously package/current UI state | Could persist ambiguous asset-shaped strings | Every forward save now fetches and stamps exact production-script basis. |
| Manual result URL bridges | External request/provenance only | Compatibility plan | Client-generated `broll-manual-result:*` / `reference-manual-result:*` became selected asset IDs | No asset candidate or selection is created. State is `result_unregistered`. |
| Stock discovery bridge | External discovery result | Compatibility B-roll plan | First positional result was selected and synthetic IDs entered candidate fields | Results remain request metadata; no candidate is attached and no positional selection occurs. |
| Legacy B-roll/Reference Clip file-upload bridge | Staged external media | Compatibility plan | Client-generated ID was returned as an asset candidate | Staging may complete, but the writer fails closed and attaches nothing unless Tongs issues canonical authority. Canonical v2 acquisition remains the production path. |

## Contract boundary

Identity, purpose, and approval remain separate:

- derivative/beat/opportunity IDs identify visual decisions;
- `CanonicalAssetId` identifies media;
- `ScriptDerivativeBasis` identifies the exact production script that caused the derivative.

URLs, paths, filenames, storage keys, prompt IDs, and local request IDs may be retained as provenance or evidence. They do not establish canonical media identity.
