# Tongs V1 Release Handoff Authority Slice

Release baseline: **Forge v1.2.0 Fire Burning** (`forge-v1.2.0`).

Status: Canonical E-5 marching orders

Working name: **No Surprises Handoff**

## Purpose

Implement E-5 as a pure authority layer between Hammer release-prep output and any downstream consumer.

This layer answers one question:

**Is this handoff safe, complete, compatible, and trustworthy enough to move forward, and under what conditions?**

It does not publish.
It does not upload.
It does not mutate Hammer state.
It does not add platform logic.
It does not exist as optional advice that downstream tools are free to ignore.

## Canonical Ownership

This authority belongs on the canonical Tongs-backed handoff seam, because persisted cross-tool release state is a Tongs concern.

Current seam to evolve:

- `apps/hammer/src/lib/hammerReleasePrepPackage.ts` produces Hammer prep truth.
- `apps/nursery/src/lib/tongsReleaseAssembly.ts` assembles cross-tool release state.
- `apps/nursery/src/lib/tongsQuenchReleasePacketStub.ts` projects that state for Quench consumption.

E-5 hardens this seam. It must not create a second competing authority object elsewhere.

## Mission

Freeze contract-relevant metadata, evaluate downstream safety, normalize readiness into canonical authority states, and emit explicit diagnostics so no downstream consumer discovers critical truth that the authority failed to declare.

## Explicit Non-Responsibilities

This slice must not:

- wire Quench routes or publishing flows
- perform platform adapter logic
- export or upload media
- mutate Hammer artifacts or edit source media
- hide unresolved conditions behind UI polish
- fake persistence through local files or `localStorage`

## Core Responsibilities

E-5 owns four things.

### 1. Contract Enforcement Across Seams

- Validate required handoff fields across upstream and downstream boundaries.
- Enforce schema/version compatibility.
- Normalize partial-prep states into one canonical authority verdict.
- Reject missing or contradictory identity and provenance data.

### 2. Operational Guardrails

- Freeze immutable snapshot identity for the evaluated handoff.
- Emit explicit `do_not_publish` policy when release progression is forbidden.
- Preserve provenance so downstream consumers know what source state was evaluated.
- Protect against downstream misuse by making safety decisions first-class contract data.

### 3. Real-World Readiness Evaluation

- Return not just a verdict, but explicit blockers, warnings, and remediations.
- Explain what is wrong, where it lives, and what fixes it.
- Order issues by operational priority so humans and tools can act deterministically.

### 4. Artifact Hardening

- Stamp snapshot creation time.
- Stamp schema version.
- Generate deterministic snapshot identity.
- Generate integrity hash over the frozen authority payload.
- Expose audit-ready provenance hooks.

## Canonical Authority States

The authority verdict vocabulary is:

- `ready`: safe to hand downstream; no known blocking contract issues
- `blocked`: same schema family, but required conditions are missing, stale, or failed and must be remediated first
- `unsafe`: the packet may exist, but safety policy forbids downstream progression even if artifacts are present
- `incompatible`: schema version or consumer compatibility mismatch; consumer must not interpret the packet normally

These states must remain sharp.

`blocked` is operational.
`unsafe` is policy-driven.
`incompatible` is contract-driven.

## Canonical Output Contract

The authority output must be a hardened release handoff object that includes both machine policy and human-readable diagnostics.

Illustrative shape:

```ts
interface ReleaseHandoffAuthority {
  schema_version: number;
  status: "ready" | "blocked" | "unsafe" | "incompatible";
  safe_for_downstream_handoff: boolean;
  allow_preview: boolean;
  do_not_publish: boolean;
  snapshot_id: string;
  snapshot_created_at: string;
  integrity_hash: string;
  provenance: {
    source: "tongs";
    release_prep_schema_version: number | null;
    source_updated_at: string | null;
    workspace_id: string | null;
    workpiece_id: string | null;
    editor_session_id: string | null;
    transcript_source_id: string | null;
    media_id: string | null;
  };
  compatible_consumers: string[];
  blockers: ReleaseAuthorityIssue[];
  warnings: ReleaseAuthorityIssue[];
  remediations: ReleaseAuthorityRemediation[];
}

interface ReleaseAuthorityIssue {
  code: string;
  severity: "critical" | "high" | "medium" | "low";
  priority: number;
  affected_domain: "transcript" | "subtitles" | "visuals" | "audio" | "metadata" | "compatibility" | "policy";
  message: string;
  remediation_code: string | null;
}

interface ReleaseAuthorityRemediation {
  code: string;
  priority: number;
  action: string;
}
```

Required semantics:

- `safe_for_downstream_handoff` is not the same thing as `do_not_publish`.
- A packet may be safe for preview or inspection while still forbidden to publish.
- `compatible_consumers` must be explicit. Compatibility must not be assumed.

## Determinism Rules

The same canonical source state must produce the same:

- authority verdict
- snapshot identity
- integrity hash
- blocker ordering
- remediation ordering

Any change to contract-relevant source state must produce a new snapshot identity and hash.

## Downstream Safety Contract

Downstream consumers may add consumer-specific checks, but they must not discover new critical handoff truth that the authority failed to declare.

Examples:

- A Quench consumer may add destination-specific checks such as public RSS URL availability.
- A Quench consumer must not discover for the first time that the packet lacks canonical identity, carries stale artifacts, violates policy, or is schema-incompatible.

The authority exists so downstream tools receive declared truth, not surprises.

## Implementation Direction

E-5 should extend the current path in this order:

1. Hammer emits release prep truth.
2. Tongs assembles canonical release handoff authority.
3. Quench and any later consumer read the authority output and project consumer-specific views from it.

Practical implication for the current codebase:

- `buildHammerReleasePrepPackageFromSnapshot(...)` remains upstream prep packaging.
- `buildTongsHammerReleaseAssembly(...)` is the correct host seam for the new authority verdict.
- `buildTongsQuenchReleasePacketStub(...)` should become a downstream projection of authority output, not a second source of truth.
- `apps/quench/src/core/readiness.ts` may retain destination checks, but it must not be the first place critical packet integrity is discovered.

## Persistence Rule

This repository's SSOT policy applies in full.

If the authority result remains derived at request time from canonical Hammer and Tongs state, no new persistence surface is required.

If the authority result must persist as its own durable artifact, then this is a real Tongs/Supabase change. It requires:

1. a database migration
2. RLS-aware read/write paths
3. explicit ownership in the canonical data-access layer

UI-only storage, local files, and `localStorage` are not acceptable substitutes.

## Acceptance Bar

E-5 is complete only when all of the following are true:

- No downstream consumer can discover a critical missing condition that the authority did not already declare.
- Partial-prep states fail safely and explain what fixes them.
- Policy prohibitions are explicit through `unsafe` and `do_not_publish`.
- Compatibility mismatches are explicit through `incompatible`.
- The authority output is deterministic for the same canonical source state.
- Snapshot metadata is frozen and audit-ready.
- Implementation respects the Forge SSOT policy and does not invent local persistence.

## Out Of Scope For E-5

The following belong later in the chain of command:

- publish execution
- scheduling orchestration
- upload adapters
- release UI polish
- platform-specific automation
- analytics feedback loops

E-5 is authority, not deployment.
