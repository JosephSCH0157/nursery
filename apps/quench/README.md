# Quench

Quench is the release-decision and distribution console for Podcaster's Forge.

## Canonical Authority Flow

```text
Hammer -> Tongs -> Quench -> Tongs -> Ledger
```

- Hammer produces finished media and completed candidate assets.
- Tongs verifies and projects canonical release authority.
- Quench validates that authority, records release decisions, and dispatches distribution when a live adapter exists.
- Tongs persists canonical decisions, receipts, schedules, and publish history.
- Ledger consumes verified release and performance evidence.

Quench does not accept operational authority directly from Hammer. A manifest path, prepared-package parameter, or client-side object is a locator only; authenticated workpieces must resolve a canonical release projection through Tongs.

## Product Boundary

Quench is intentionally non-creative. It does not write scripts, edit or render media, mix or master audio, create thumbnails or shorts, or request new variants during release execution.

Quench may select among eligible Tongs-authorized candidates and record provider-neutral experiment intent. Intent does not prove that a destination is rotating candidates; provider acknowledgement is required for execution evidence.

Metadata assistance may return an uncommitted draft. Tongs remains authoritative for committed metadata.

## Capability Status

### Implemented

- Hammer release-packet manifest ingestion and deterministic validation
- Tongs-resolved `forge.quench-release-projection.v2` for authenticated workpieces
- exact Hammer manifest verification and immutable snapshot authority
- separate canonical handoff and publish-readiness evaluation
- fail-closed publish-authority guard
- canonical metadata and thumbnail candidate-set projection
- immutable thumbnail-selection decisions
- provider-neutral thumbnail experiment intent and cancellation
- optimistic concurrency, idempotent replay, and immutable operation receipts for release decisions
- destination capability projection and capability-gated UI
- development fixtures kept separate from authenticated canonical workpieces
- uncommitted metadata-assistance drafts
- three-column release-console UI

### Scaffolded, not live

- YouTube adapter contract, capability reporting, and validation
- Transistor podcast-host contract, capability reporting, and validation
- deterministic stub-mode receipts for development
- publish/retry interfaces and release-readiness contracts
- UI controls for publish modes, scheduling, and destination selection

The Transistor adapter defines the live server-side publishing port; credentials and media streaming remain outside the browser. Stub receipts are not provider receipts and must not be represented as external execution.

### Future

- real server-side platform authentication and connection management
- live YouTube upload, schedule, premiere, retry, and provider receipts
- additional podcast-host adapters after their official publishing APIs are verified
- Rumble adapter
- durable platform publish jobs and background execution
- real platform schedule execution
- provider-side thumbnail experiment execution and acknowledgement
- canonical platform receipts and publish history written through Tongs
- Ledger ingestion of verified downstream outcomes

## Readiness Terminology

Quench uses three different readiness concepts:

- **Ingest readiness:** the packet is readable, structurally valid, and its inspection artifacts can be resolved. This does not authorize publishing.
- **Canonical handoff readiness:** Hammer's exact Tongs-verified manifest snapshot says the completed upstream handoff is ready for Quench. This is upstream evidence, not destination validation.
- **Publish readiness:** the current canonical projection satisfies the selected destination's metadata, asset, capability, accessibility, decision, and schedule requirements. Only this fail-closed verdict can permit adapter execution.

Do not use a generic "ready" label without identifying which layer produced it.

## Package Contents

- `src/core/hammer-release-packet.*` — Hammer packet types and ingest validation
- `src/core/canonical-release-projection.types.ts` — Tongs projection contract
- `src/core/readiness.ts` — publish-readiness evaluation
- `src/core/publish-guard.ts` — fail-closed execution authority
- `src/core/asset-resolver.ts` — asset-source abstraction
- `src/core/quenchMetadataAssist.contract.ts` — uncommitted metadata-assist contract
- `src/adapters/adapter.contract.ts` — shared destination adapter boundary
- `src/adapters/youtube/` — video-platform scaffold
- `src/adapters/transistor/` — V1 podcast-host boundary; the host remains authoritative for RSS and directory distribution
- `tests/` — ingest, readiness, authority, projection, and persistence-contract coverage

The integrated UI lives at `apps/nursery/src/routes/Quench.tsx`. Canonical persistence and projection support live behind Tongs migrations and routes rather than inside this package.

## Canonical Documents

- Product manifest: [`../../docs/QUENCH_MANIFEST.md`](../../docs/QUENCH_MANIFEST.md)
- Technical architecture: [`./QUENCH_TECHNICAL_ARCHITECTURE.md`](./QUENCH_TECHNICAL_ARCHITECTURE.md)
- Boundary contract: [`../hammer/HAMMER_QUENCH_HANDOFF_SPEC.md`](../hammer/HAMMER_QUENCH_HANDOFF_SPEC.md)

## Development

From the repository root:

```text
pnpm --filter @forge/quench typecheck
pnpm --filter @forge/quench test
```

## Non-Negotiable Rules

- Tongs is the canonical persistence authority.
- Quench must not create a second metadata, asset, decision, or receipt authority.
- Canonical projections and persisted decisions must fail closed when authority is stale or unverifiable.
- Fixtures and stub receipts must remain visibly non-production.
- A path or route parameter cannot authorize release.
- Quench must never fake live publishing, scheduling, RSS delivery, or provider experiment execution.
