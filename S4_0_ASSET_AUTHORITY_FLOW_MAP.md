# S4-0 Asset Authority Flow Map

Status: observed authority map. Arrows describe current flows; warning labels identify reconstruction, substitution, degradation, or unproven identity.

## Intended three-axis chain

```text
PURPOSE
Script approval
  -> derivative revision / beat / opportunity / candidate selection

IDENTITY
Tongs assets.id
  -> validated workspace/workpiece/kind/hash/readiness evidence

PLACEMENT
Hammer placement_id / clip_id
  -> timing, lane, geometry, history

JOIN
derivative basis + canonical asset ID
  -> Hammer placement ID
  -> package intent retaining canonical asset ID
```

Identity answers which media object this is. Purpose answers why it belongs in production. Placement answers where the editor put it. No one identifier may answer all three.

## Current Image Map flow

```text
script_approval_revisions
  --preserved composite approval relationship-->
image_map_revisions + entry id
  --candidate RPC writes tongs.assets row-->
candidate_assets[].asset_id
  --selection RPC validates current membership-->
selected_asset_id
  --Hammer visual-package read-->
selected_asset object
  --DANGER: if absent, candidate_assets[0] is promoted-->
Hammer placement asset_id + asset_path + storage_key
  --DANGER: persisted local asset membership, not Tongs resolution-->
Hammer visual timeline
  --DEGRADED: Quench visual packet emits asset_path only-->
packaging intent
```

Identity is preserved through canonical selection, then can be substituted during Hammer hydration and is degraded at packaging.

## Current B-roll flow

```text
script approval
  --preserved FK basis-->
broll plan revision -> beat revision -> prompt revision
  --Tongs verifies tongs.assets.id, workspace, workpiece, kind, readiness-->
broll candidate revision (candidate id + canonical asset id + copied evidence)
  --selection refers to candidate revision-->
unified visual plan / Hearth projection
  --plain string projection-->
Hammer asset_ref / asset_id
  --local binding state-->
Hammer placement / editorial operation
  --generic asset_ref summary-->
release packet
```

The database portion largely preserves identity. The client/public-contract and packaging boundaries do not prove that the same ID remains canonical.

## Current Reference Clip and Reference Visual flow

```text
script approval
  -> plan/opportunity revision
  -> evidence/rights/recipe derivative authority
  -> Tongs render/acquisition creates tongs.assets row
  -> candidate revision points to assets.id
  -> selection points to candidate revision
  -> unified visual plan
  -> Hammer hydration and placement
  -> package
```

For Reference Visual display, Tongs storage evidence is converted to a signed `imageUrl`. That URL is presentation only. Current Hearth code retains `assetId`, but the public type is an unbranded string and downstream Hammer contracts still permit generic/path-derived identities.

## Thumbnail flow

```text
script/editorial thumbnail basis
  -> base/recipe/title/concept/binding derivative revisions
  -> Tongs stages/renders tongs.assets row
  -> Hearth verifies asset id + hash + canonical pointer readback
  -> candidate revision / candidate set
  -> Quench decision authority
```

The v3 path has strong canonical readback. Older package fields remain ambiguous until provenance proves they used this path.

## Hammer legacy and reload flow

```text
legacy placement record
  -> choose identity source in order:
       asset_path
       storage_key
       asset_id
       asset_ref
       "placement:<placement_id>"
  -> normalize path-like string
  -> hash it
  -> create `asset_<hash>`
  -> store as HammerVisualAsset.asset_id
  -> attach clip.asset_id
  -> persist as canonical-looking timeline JSON
```

This is explicitly `legacy-derived`. The generated value must never be promoted to `CanonicalAssetId` without an exact Tongs resolution record.

## Intro/outro flow

```text
stored media file
  -> candidate.assetId
  --DANGER: fallback deriveStableHammerAssetIdFromPath(file.path)-->
packaging intro_asset_id / outro_asset_id
  -> lookup in current candidate map
  -> unresolved if missing
  -> apply placement using asset ID + path if found
```

The unresolved-intent behavior is correct. The candidate identity fallback remains legacy-derived and must be classified rather than treated as canonical.

## Substitution and degradation points

| Boundary | Current behavior | Classification |
| --- | --- | --- |
| Image Map to Hammer | Missing selected asset may become first candidate | substitution |
| Legacy placement to timeline asset | Path/storage/ref/placement can generate `asset_id` | reconstruction |
| Stored media to intro/outro intent | Path can generate candidate asset ID | reconstruction |
| Manual Hammer visual placement | Path is copied into all reference fields and hashed into `asset_id` | active legacy writer |
| Packaging logo/background selection | Existing/first path can be selected and hashed | substitution/reconstruction |
| Hammer local asset map | Membership is treated as enough to bind a clip | unverified relationship |
| Hammer to Quench visuals | Canonical-looking asset data becomes path-only placement data | degradation |
| Signed URL previews | URL is available beside plain-string asset ID | future substitution risk |
| Newer/superseding assets | `supersedes_asset_id` exists but downstream contracts do not explicitly prohibit substitution | latent substitution risk |

## Required Slice 4 ratchet

```text
canonical asset unresolved
  -> retain intended CanonicalAssetId or classified legacy reference
  -> readiness = unresolved / mismatch / invalid
  -> block production readiness where required
  -> never select another object
```

The architecture invariant is:

> A production visual is always the exact canonical Tongs asset named by its authority chain, independent of paths, filenames, cached URLs, browser state, later assets, and timeline placement identity.
