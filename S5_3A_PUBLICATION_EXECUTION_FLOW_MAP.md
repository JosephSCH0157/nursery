# S5-3A Current Publication Execution Flow Map

Status: observed repository flow. This is not the proposed implementation.

## Review authority to current adapter result

```text
immutable Quench open authority (manifest M1)
  -> canonical release projection
  -> immutable release decision Dn (when explicitly committed)
  -> simplified in-memory ReleasePacket
       drops manifest hash, Dn, executable destination and capability revision
  + mutable React selectedPlatforms / publishOptions / runMode
  + current resolved-assets/readiness projection
  -> loadPublishBoard useEffect
       fires automatically when dependencies change
  -> static adapter selected by platform string
  -> hard-coded runtime capability + validation
  -> adapter.publish(packet, options, context)
  -> deterministic stub receipt OR explicit live-not-implemented failure
  -> in-memory publishResults
```

There is no external provider publication call in this flow today. Therefore the present flow is a preview/stub board, despite its `publish` method name.

## Destination authority parallel path

```text
user-owned provider connection
  -> server-only credential generation
  -> verified provider account
  -> executable destination D
  -> explicit workspace grant
  -> immutable observed capability Cn
  -> safe workspace destination projection
```

This S5-2 path currently stops before Quench adapter execution. The current publish board chooses `youtube` or `rss`, not executable destination D, and does not consume Cn.

## Decision path

```text
manifest M1 + metadata + candidates + planning destination scope/capability
  -> explicit decision commit operation key
  -> immutable decision D7
  -> decision-mutation receipt
```

That operation key is correctly idempotent for decision persistence, but it does not describe external publication. Current adapter execution does not receive D7.

## Current retry path

```text
ephemeral PlatformReceipt
  + newly built current PublishContext
  -> adapter.retry
  -> options reconstructed from scheduled_for
  -> new stub/live-not-implemented result
```

The retry interface lacks the original packet, manifest, decision, destination, capability, options snapshot, operation ID, and attempt ID. It is re-resolution, not provable replay.

## Edge classification

| Edge | Classification |
| --- | --- |
| Hammer bytes -> manifest snapshot | Authority preserved. |
| Manifest snapshot -> Quench open authority | Authority frozen by S5-1. |
| Manifest/decision -> `ReleasePacket` | Identity degraded. |
| Destination graph -> current publish board | Relationship absent. |
| React platform/options -> adapter invocation | Mutable presentation state treated as invocation input. |
| Capability revision -> adapter | Relationship absent; hard-coded capability used instead. |
| Credential refresh -> provider discovery | Allowed execution infrastructure; no publication exists yet. |
| Adapter call -> external provider | Not implemented / unresolved. |
| Adapter result -> `PlatformReceipt` | Ephemeral evidence only. |
| Receipt -> retry | Identity re-resolved; safe replay unproven. |

## Target boundary exposed by the inventory

```text
reviewed M1 + D7 + exact destination X + reviewed capability C7
  -> reserve immutable publication operation P1
  -> append attempt A1
  -> server executor resolves current credential generation
  -> revalidates X/C7 without replacing them
  -> adapter executes P1/A1
  -> append durable receipt evidence
```

No adapter should receive raw Quench client state or choose an account/channel itself.

