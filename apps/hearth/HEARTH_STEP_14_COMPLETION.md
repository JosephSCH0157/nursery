# Hearth Step 14 Completion Record

Status: complete, 2026-07-12.

## Maintainability boundary

- `HearthStandalone` now lazy-loads `HearthShell` as its own production chunk.
- Browser speech capability and vendor-prefix handling moved out of the shell into `src/lib/browser-speech-contract.ts`.
- Chat and STT orchestration remain behind `useChatWorkspaceRuntime` and `useChatWorkspaceStt`; their operation identity is supplied by `HearthOperationAuthority`.
- Feature expansion must use the existing operation, canonical persistence, and discriminated dependency-result boundaries. The expansion test rejects reintroduction of critical loose typing or loss of the mounted lazy boundary.

## Type-safety ratchet

Critical chat/STT `any` uses were replaced by explicit speech-recognition, upload, transcription, operation, event, and notice contracts. Harmless peripheral debt is not represented as closure of this gate.

## Measured production budget

The Vite manifest is emitted in production. `scripts/verify-hearth-bundle-budget.mjs` walks the Hearth route's static graph and its direct dynamic children.

- measured baseline: 1,525,669 bytes across 8 JavaScript chunks
- measured largest Hearth chunk: 776,904 bytes
- enforced route-graph ceiling: 1,800,000 bytes
- enforced per-chunk ceiling: 900,000 bytes

The checker runs as part of the Nursery production build. It fails if the Hearth route disappears from the manifest or either budget regresses.

## Permanent expansion law

No Hearth feature may invent workpiece identity, treat browser state as canonical acknowledgement, collapse unavailable into empty, bypass concurrency control for shared writes, introduce an undeclared representation authority, or ship without mounted lifecycle proof. The lifecycle constitution and `HEARTH_CANONICAL_AUTHORITY.md` remain higher authority.
