# Forge v1.2.12 RC Certification Record

Opened: 2026-08-31

Completed: 2026-09-03

Timezone: America/New_York

Verdict: **GO — mandatory release evidence is green**

## Frozen basis

| Item | Value |
| --- | --- |
| Previous tag | `v1.2.11` |
| Previous tag commit | `c0fbae0c5d2371800375a10d2bf4b8b76f547501` |
| Certified product basis | `98218c9f` on `Hammer_Smoke3` |
| Product commits from previous tag through basis | 201 |
| New migration files from previous tag through basis | 51 |
| Latest paired migration | `20260903150000_tongs_reference_material_rollout_gate.sql` |
| Node | 20.20.0 |
| pnpm | 10.30.3 |
| Supabase CLI | 2.84.2 |
| Docker | 29.7.2 |

The final release candidate is the certification commit containing this record and the lint-only repairs required by the final umbrella gate.

## Database and persistence evidence

- Supabase remains the canonical SSOT; no local storage or file persistence substitute was introduced.
- The user-authorized linked database push applied `20260903150000_tongs_reference_material_rollout_gate.sql` successfully.
- `supabase migration list --linked` showed paired local and remote migrations through `20260903150000`.
- Disposable Docker/Supabase projects certified both a clean migration chain and a production-shaped upgrade.
- Verification covered fixed `search_path`, idempotent operation keys, immutable creation/capture/completion/decision receipts, canonical media verification, cross-workspace RLS, and loopback-only service exposure.
- Disposable certification projects and volumes were cleaned up by the certification runner.
- Browser fixtures were provisioned only against the loopback Supabase project. No production fixture data was manufactured.

## Certification repairs

1. Preserved canonical asset ID, state, workspace, workpiece, and content-hash fields in the shared Tongs visual-placement normalizer.
2. Updated legacy Hammer fixtures for fail-closed canonical asset defaults, explicit source-media time, current transcript refresh syntax, and non-collapsing unresolved asset identities.
3. Updated Tongs mock query surfaces to match current canonical recording, asset-list, and schema behavior.
4. Updated Hearth image-map selection harnessing to validate canonical asset authority before selection.
5. Added the required Anvil capture authority ID to the performance presentation fixture.
6. Replaced Anvil recorder smoke timing with an awaitable one-time built-in adapter initialization contract.
7. Completed the Hearth reference-material workflow and deployed its rollout-gate migration.
8. Repaired three final Tongs lint/type-safety findings without changing runtime behavior: URL character-class spelling, explicit malformed-provider-response handling, and typed PDF Buffer slicing.

## Gate evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Linked database push | PASS | Latest migration applied successfully |
| Migration ledger audit | PASS | Local/linked paired through `20260903150000` |
| Docker migration chain | PASS | Clean install and production-shaped upgrade |
| `pnpm gate:browser` | PASS | 28 authenticated Playwright tests across 8 invocations |
| `pnpm gate:anvil-release` | PASS | Full Anvil automation plus authenticated canonical handoff |
| Workspace fast gate | PASS | 11 packages; typecheck, lint ratchets, architecture, no Anvil cycles |
| Production build | PASS | All active packages and bundle budgets |
| Anvil Jest | PASS | 124 suites, 1,029 tests |
| Hammer | PASS | Full registered test-file sweep |
| Hearth | PASS | Full registered test-file sweep |
| Nursery | PASS | 55 registered test files |
| Bellows | PASS | Engine and runtime suites |
| Quench | PASS | Authority/readiness suites and ratchet |
| Tongs / shared packages | PASS | Full package suites |
| `pnpm gate:media` | PASS | Audio backend, FFmpeg plan, recorder fallback/handoff smoke |
| `pnpm gate:nursery` | PASS | Fast, build, integration, media, and authenticated browser stages |

Existing warning budgets remain unchanged: Anvil reports 15 lint warnings and Nursery reports 4 lint warnings, with zero lint errors.

## Observations

- The first standalone Anvil rerun inherited incompatible authentication configuration and correctly failed closed on an ES256 token. Refreshing the local fixture and running under one consistent local Supabase environment cleared the issue.
- A later Anvil run logged one transient local Supabase Storage 500 while attempting a non-authoritative chat-artifact write. The canonical Hearth-to-Anvil script handoff passed, and the subsequent complete browser gate passed. This did not create or authorize fallback persistence.
- Supabase CLI 2.84.2 reported that 2.116.0 is available. This is a maintenance notice, not a release blocker.

## Release disposition

The authenticated browser boundary that held the candidate at NO-GO is now certified. Forge v1.2.12 is approved to proceed to the controlled release operations: review the certification diff, commit the candidate, merge to `main`, create the `v1.2.12` tag, push the approved refs, and deploy through the normal release path.

No tag, merge to `main`, application deployment, or Git push was performed by this certification step.
