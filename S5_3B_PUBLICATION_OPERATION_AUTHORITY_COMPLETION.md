# S5-3B — Publication Operation Persistence & Receipt Authority

Status: implementation and static/focused verification complete. Remote transactional migration proof remains pending.

## Result

Quench publication is no longer authorized by mutable presentation effects. The implemented authority chain is:

```text
immutable manifest snapshot
  -> exact release decision revision
  -> exact granted executable destination
  -> exact provider-observed capability revision
  -> immutable publication operation P1
  -> sequential attempt A1/A2...
  -> immutable terminal receipt
```

No provider upload or RSS mutation was added.

## Persistence

Migration: `supabase/migrations/20260828120000_tongs_publication_operation_authority_s5_3b.sql`

It adds:

- immutable `publication_operations` with a complete authority and publication-intent fingerprint;
- sequential `publication_attempts` with one-active-attempt enforcement and guarded state transitions;
- immutable `publication_receipts` copying the complete intended tuple plus observed execution evidence;
- immutable `publication_reconciliation_events` for preserving later knowledge without rewriting receipts;
- RLS/read policies and RPC-only establishment, claim, transition, and read seams.

Operation establishment validates the exact episode, manifest/hash, package readiness, decision revision/manifest binding, exact granted destination, current reviewed capability, provider/planning destination agreement, and the initial YouTube upload capability. A same-key replay compares the requested tuple to the already persisted P1 before mutable current-state validation, so a lost response cannot become P2 or silently adopt C8.

Attempt claiming revalidates destination, grant, connection/credential executability, and the frozen capability head without changing P1. Credential generations remain attempt evidence and may differ across safe retries.

## Side-effect safety

Durable states distinguish preparation, submission, confirmed/recoverable failure, blocking, success, and `outcome_unknown`. Side-effect evidence is monotonic. Once provider request/session or credential evidence is recorded on an attempt it cannot be replaced.

`outcome_unknown` creates a reconciliation-required event and cannot be retried through the generic claim authority. Only confirmed or proven pre-side-effect recoverable failure permits another attempt beneath P1.

## Application boundary

The old `loadPublishBoard` effect-driven call was removed. Changing platform options, readiness, assets, run mode, or selection now performs validation/presentation work only.

The explicit Quench command now:

1. selects one exact workspace-granted executable destination;
2. establishes P1 through Tongs;
3. reserves A1 through Tongs;
4. supplies P1/A1 context to the existing stub adapter;
5. asks the server authority to persist an honest blocked receipt stating that provider execution is not implemented.

The stub cannot create identity. Adapter `publish` and `retry` signatures now require operation, attempt, manifest, decision, destination, and capability identities.

Quench reload queries operations by the exact open manifest snapshot and projects the existing operation instead of rebuilding it from current UI state.

## Public contracts

`packages/tongs/src/publication-operation-authority.ts` formalizes operation, attempt, receipt, state, outcome, retry, evidence, and error contracts. Secret credential material is absent. Checked-in DB types include all new tables and RPCs pending regeneration from the deployed schema.

## Verification

- `pnpm --filter @forge/tongs test:publication-operation-authority`
- `pnpm --filter @forge/quench test`
- `pnpm --filter nursery typecheck`
- migration delimiter/relationship ratchets
- effect-driven adapter invocation ratchet
- adapter operation-context ratchet
- `git diff --check`

## Deployment and acceptance gates

1. Apply the S5-3B migration and regenerate Supabase types from the deployed schema.
2. Transactionally prove operation replay/conflict, one-active-attempt enforcement, immutable receipts, capability advancement blocking, and `outcome_unknown` retry denial.
3. Authenticated UI smoke: change options without execution; explicitly establish P1/A1; refresh and recover P1; verify the durable blocked stub receipt.

## Explicitly deferred

- YouTube upload/resumable sessions;
- provider-specific reconciliation/idempotency;
- RSS publication;
- scheduling execution;
- real retry execution;
- multi-destination orchestration.

## Invariant

A publication attempt may change execution state, credential generation, transport evidence, and retry number. It can never change the manifest, release decision revision, executable destination, or reviewed capability authority of its publication operation.
