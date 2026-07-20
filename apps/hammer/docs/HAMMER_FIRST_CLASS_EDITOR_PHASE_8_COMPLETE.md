# Hammer First-Class Editor Phase 8 Completion

Phase 8 proves full-program package assembly as canonical Composition V2 state.

The assembled program is:

```text
intro -> edited program -> outro
```

That sequence is validated from the shared render plan, not from release-time side channels.

## Authority impact

Package authority remains inside Composition V2:

- intro clip identity;
- outro clip identity;
- thumbnail asset identity;
- reference asset identities;
- music, graphics, captions, transitions, audio treatment, and multicamera decisions already represented as Composition V2 commands.

`HammerProgramPackageV1` records the package metadata. `proveHammerFullProgramPackageAssemblyV1` validates the compiled program against the acknowledged composition and render plan.

Release prep and Quench handoff may consume the package later, but they do not own package composition truth.

## Permanent regression proof

The Phase 8 foundation gate proves:

- intro, program, and outro are continuous with no boundary gaps;
- music, graphics, captions, final audio treatment, transitions, thumbnail metadata, reference metadata, and multicamera decisions are mounted;
- scrubbing intro, program, and outro time ranges selects the correct package roles;
- mounted preview sees the same caption operation as the compiled plan;
- missing intro assets fail closed;
- missing thumbnail metadata fails closed;
- boundary gaps fail closed;
- reopen requires acknowledged Composition V2 identity;
- repeated Undo restores the raw pre-package composition.

## Preview/render implications

`HammerRenderPlanV1` now carries package reference asset metadata alongside intro, outro, and thumbnail identity.

`HammerProgramPackageAssemblyProofV1` binds package proof to:

- composition ID;
- composition revision;
- composition fingerprint;
- render-plan fingerprint;
- exact intro/program/outro boundaries.

Preview and render remain driven by the same render operations. Package assembly cannot be proven from UI state alone.

## Migration and RLS disposition

No new migration or RLS policy is required for Phase 8.

The package artifact relationships are recorded inside revision-scoped Composition V2, which is already persisted through the Tongs compare-and-swap composition pointer and protected by the existing recording-revision RLS boundary.

A future reusable franchise-level package automation system would require separate Tongs-owned schema and RLS review. That is deferred.

## Explicit deferrals

Deferred refinements:

- reusable franchise-level package automation;
- package template libraries shared across workspaces;
- noncreative destination-specific package variants.

These deferrals do not block the first complete podcast-editing path.
