# S5-0 Current Quench Authority Flow Map

Status: observed flow, not the target design. No behavior change is authorized.

## Current open and review flow

```text
Hammer prepared package (mutable Tongs workpiece file)
  -- package path + route assertions -->
Quench prepared-release URL
  -- precedence selected: package workspace ?? handoff workspace ?? shell workspace -->
Tongs current release projection request
  -- current file reread + exact bytes snapshotted -->
immutable quench_release_manifest_snapshots row
  -- authority preserved -->
current metadata + thumbnail candidate set + destination scopes/current capabilities
  -- mutable rereads combined into one projection -->
QuenchCanonicalReleaseProjection
  -- explicit decision commit -->
immutable release decision revision + candidate assignments
  -- applicability checks later current state -->
current / requires_review / blocked / superseded
```

The prepared package is verified only at open. The projection's manifest snapshot is exact, but the projection itself is a fresh view of multiple current authorities.

## Current adapter execution flow

```text
QuenchCanonicalReleaseProjection
  -- identity degraded -->
ReleasePacket
  keeps: manifest snapshot ID as release_packet_id, workspace/workpiece, audio media_id
  drops: manifest hash, decision ID/revision, capability ID/revision,
         canonical visual media references, reviewed candidate assignment
        +
mutable React state
  selected platform(s) + current publish options + run mode + resolved asset cache
        +
static runtime adapter registry
  -- platform-string selection; runtime capability reread -->
useEffect publish board
  -- automatic adapter.publish on dependency changes -->
YouTube/RSS adapter
  -- stub/live-not-implemented external execution -->
PlatformReceipt in React state
  drops: exact manifest, release decision, destination capability, operation authority
```

This path does not consume the immutable release decision as publication authority. The user's reviewed candidate/destination intent and the adapter request are parallel systems rather than one chain.

## Hammer media authority through Quench

```text
S4 Hammer package media reference
  canonical asset ID + canonical hash + placement/derivative evidence
  -- current Hammer packet -->
Tongs manifest snapshot stores exact bytes                       [preserved]
  -- legacy Quench typed parser -->
visual placement asset_path only                                [identity dropped]
  -- canonical Quench case builder -->
no visual placements in ReleasePacket                           [identity dropped]
  -- adapter request -->
no canonical visual authority                                   [absent]
```

The raw manifest snapshot can preserve the S4 bytes, but current Quench transformations do not preserve those identities into adapter input.

## Primary recording flow

```text
capture / recording revision / Hammer preparation
  -- Hammer manifest audio -->
audio.media_id + workpiece_path/local_relpath
  -- Quench projection -->
exact manifest snapshot                                         [preserved]
  -- ReleasePacket builder -->
audio_export_id = media_id                                      [partial preservation]
resolved URI = workpiece_path ?? local_relpath ?? synthetic URI [access precedence]
  -- RSS adapter -->
payload summary with episode/media fields                       [lineage degraded]
  -- PlatformReceipt -->
no manifest hash or recording revision                          [identity dropped]
```

No active `latest recording` lookup was found in Quench. A fresh release-projection request can nevertheless adopt the current Hammer manifest rather than retaining a previously reviewed open authority.

## Decision mutation and retry flow

```text
explicit thumbnail choice/experiment draft
  -- fresh projection + UUID operation ID -->
commit_quench_release_decision RPC
  -- row locks + exact evidence + idempotency -->
immutable decision revision + immutable decision-operation receipt
  -- projection refresh -->
current open Quench case may be rebuilt from current manifest/metadata/capabilities
```

```text
adapter PlatformReceipt
  -- retry(receipt, newly built current PublishContext) -->
adapter retry
  -- no original packet/options/frozen operation supplied -->
new effective execution state                                   [re-resolution/unresolved]
```

The first flow is a true durable decision-operation replay. The second cannot prove it is a replay of the same publication.

## Edge classification summary

| Edge | Observed classification |
| --- | --- |
| Hammer manifest file -> Tongs manifest snapshot | authority preserved; exact bytes/hash verified |
| Package/handoff/shell -> projection workspace | precedence selected |
| Projection refresh -> open Quench case | mutable reread |
| Manifest snapshot -> simplified `ReleasePacket` | identity degraded |
| Release decision -> publish adapter | relationship absent |
| Destination scope/capability -> runtime adapter | unverified relationship |
| Platform UI selection -> adapter | mutable state treated as execution authority |
| Adapter publish -> `PlatformReceipt` | publication identity dropped |
| Adapter receipt -> retry | re-resolution; replay semantics unresolved |
