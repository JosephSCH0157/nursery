# Forge v1.2.12 RC Certification Record

Date: 2026-08-31

Timezone: America/New_York

Verdict: **NO-GO — authenticated browser evidence unavailable**

## Frozen basis

| Item | Value |
| --- | --- |
| Previous tag | `v1.2.11` |
| Previous tag commit | `c0fbae0c5d2371800375a10d2bf4b8b76f547501` |
| Candidate source commit | `05636ddb474c69119ab9406783c044a868c7e55d` |
| Commits since previous tag | 183 |
| New migrations since previous tag | 34 |
| Node | 20.20.0 |
| pnpm | 10.30.3 |
| Supabase CLI used for linked audit | 2.84.2 |
| Docker | 29.7.2 |

The certification repairs described below remain uncommitted. The final immutable release commit therefore does not yet exist.

## Database and persistence evidence

- Supabase remains the canonical SSOT; no local storage or file persistence substitute was introduced.
- `supabase migration list --linked` showed paired local and remote migrations through `20260831090000`.
- No migration, RLS, trigger, schema, or production data mutation was required by the repairs.
- Production access during certification was read-only.
- Disposable Docker/Supabase projects certified both a clean migration chain and a production-shaped upgrade.
- Verification covered fixed `search_path`, idempotent operation keys, immutable creation/capture/completion/decision receipts, canonical media verification, cross-workspace RLS, and loopback-only service exposure.
- Disposable certification projects and volumes were cleaned up by the certification runner.

## Repairs made during certification

1. Preserved canonical asset ID, state, workspace, workpiece, and content-hash fields in the shared Tongs visual-placement normalizer. This fixed deterministic Hammer replay and hydration hashes.
2. Updated legacy Hammer fixtures for fail-closed canonical asset defaults, explicit source-media time, current transcript refresh syntax, and non-collapsing unresolved asset identities.
3. Updated Tongs mock query surfaces to match current `.in(...)`, canonical recording, asset-list, and schema behavior.
4. Updated Hearth image-map selection harnessing to validate canonical asset authority before selection.
5. Added the required Anvil capture authority ID to the performance presentation fixture.
6. Replaced Anvil recorder smoke timing with an awaitable one-time built-in adapter initialization contract, eliminating late registration races.
7. Regenerated the Nursery Anvil bundles from the repaired sources.

## Gate evidence

| Gate | Result | Evidence / limitation |
| --- | --- | --- |
| Workspace preflight | PASS | 11 active packages verified |
| Migration ledger audit | PASS | Local/remote paired through `20260831090000` |
| Docker migration chain | PASS | Clean install and production-shaped upgrade |
| `pnpm gate:fast` | PASS | Typecheck, lint ratchets, architecture, no Anvil cycles |
| `pnpm build` | PASS | Production bundles and bundle budgets passed |
| Anvil Jest | PASS | 124 suites, 1,029 tests; run in-band because Windows worker IPC produced `write UNKNOWN` |
| Hammer | PASS | 186/186 registered test files |
| Hearth | PASS | 129/129 test files |
| Nursery | PASS | 50/50 test files |
| Bellows | PASS | Engine and runtime suites |
| Quench | PASS | 13 typed authority/readiness tests plus ratchet |
| Tongs / shared packages | PASS | Full package suites |
| `pnpm gate:media` | PASS | Audio backend, FFmpeg plan, recorder fallback/handoff smoke |
| Anvil recording boundary | PASS | Chromium workpiece boundary verification |
| Anvil strict smoke | PASS | Headless teleprompter smoke report `ok: true` |
| `pnpm gate:browser` | BLOCKED | Required test workspace/workpiece IDs absent |
| Anvil Hearth handoff Playwright | FAIL-CLOSED | Missing user token caused Tongs authorization denials; expected workpiece did not hydrate |
| `pnpm gate:nursery` | NOT RUN TO COMPLETION | It necessarily includes the blocked browser gate |

Existing warning budgets remain unchanged: Anvil reports 15 lint warnings and Nursery reports 4 lint warnings, with zero lint errors.

## Required release follow-up

1. Supply authorized, non-production-destructive browser fixtures through `FORGE_TEST_WORKSPACE_ID`, `FORGE_TEST_WORKPIECE_ID`, and `FORGE_TEST_HAMMER_WORKPIECE_ID`.
2. Provide the authenticated Playwright storage state/user token expected by the Tongs routes.
3. Rerun `pnpm gate:browser`, `pnpm gate:anvil-release`, and the final `pnpm gate:nursery` umbrella gate.
4. Review and commit the certification repairs and generated bundles.
5. Only after all mandatory evidence is green, create the release tag and perform any authorized push/deployment.

No tag, commit, push, deployment, production migration, or production data write was performed during this certification.
