# S4-2 — Hearth Derivative Writers Completion

Status: implemented within the forward-writer boundary.

## Delivered

- New B-roll and Reference Clip compatibility-plan writes fetch the current Tongs production-script authority and persist its exact workspace, workpiece, approval ID, approval revision, and script hash.
- Saves fail closed when no exact production approval exists. They do not derive a basis from draft text, Ready-list display state, or old package metadata.
- Image Map creator uploads use a client UUID only as request provenance. Tongs generates the canonical asset UUID and rewrites the derivative before canonical persistence/readback.
- Image Map production selection calls the S4-1 resolver and requires a `ready` asset with exact workpiece and kind relationship.
- Manual URL results remain `result_unregistered`; URLs no longer create or select asset candidates.
- Stock discovery no longer selects `candidate_assets[0]` or persists synthetic stock identities as production candidates.
- The legacy generic B-roll/Reference Clip upload bridge can stage bytes but fails closed before attachment because it has no canonical Tongs registration receipt. Existing canonical v2 acquisition/generation paths remain authoritative.
- Approval changes do not rewrite prior bases or asset identity. A later save/regeneration receives a newly fetched basis and creates the next derivative state.
- Historical readers and rows were not rewritten.

## Schema decision

S4-2 did not reveal a missing persistence relationship in S4-1. No migration, columns, RLS changes, or opportunistic schema expansion were added.

## Verification

- `pnpm --filter @nursery/hearth typecheck` — pass.
- `pnpm --filter @forge/tongs build` — pass.
- `node apps/hearth/tests/hearth-s4-2-derivative-writers.test.mjs` — 5/5 pass.
- `node packages/tongs/tests/canonical-asset-authority.test.mjs` — 4/4 pass.
- Image Map workflow tests — 5/5 pass.
- Canonical B-roll v2 integration test — pass.

The stabilization test-boundary typecheck still reports its existing unrelated fixture drift. Some `tsx` test launches also intermittently fail with sandbox `spawn EPERM`; direct JavaScript ratchets and the production TypeScript builds pass.

## Deferred

Hammer identity generation, candidate selection, timeline hydration, placements, Hammer-to-Quench identity, and packaging enforcement remain S4-3 and S4-4 work.
