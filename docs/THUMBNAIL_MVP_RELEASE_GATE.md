# Thumbnail MVP release gate

Run the complete authenticated thumbnail release gate from the repository root:

```text
pnpm gate:thumbnail-mvp
```

The command fails when linked Supabase credentials, authenticated browser prerequisites, or remote migration parity are unavailable. It verifies workspace and tool contracts, local type safety, Hearth thumbnail contracts, Tongs persistence and compositor authority, Quench release-decision contracts, Brand Library authority, and the authenticated Hearth → Tongs → Hammer → Quench golden path.

Each run creates a unique user, organization, workspace, workpiece, assets, operation identities, manifest snapshot, and Quench decision sequence. The aggregate is deleted after the run. Negative authority cases remain in isolated contract and service tests; the golden-path workpiece is not corrupted to prove them.

Helpers may provision identities and deterministic source material, but canonical results must pass through the production authority being proved. Candidate-set commitment, asset lifecycle transitions, Hammer manifest snapshotting, candidate eligibility, selection, experiment planning, and cancellation all use Tongs-controlled operations.

The production candidate-distinction rule remains `forge.thumbnail-candidate-distinction.v1`: every required pair must differ through at least one qualifying canonical identity. The golden path exercises multiple predicate branches for coverage; it does not change the production predicate.

Evidence is written to ignored local artifacts:

```text
test-results/slice7-thumbnail-golden-path.json
test-results/slice7-thumbnail-mvp-gate.json
```

The final report records the Git commit, local and remote migration heads, contract versions, run identities, candidate-set identity and hashes, immutable decision hashes, stage durations, and the failing stage when the gate does not pass.

The gate proves provider-neutral publication decisions only. It does not perform live uploads, provider thumbnail rotation, provider acknowledgement, Ledger evaluation, or automatic winner promotion.
