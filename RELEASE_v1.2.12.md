# Forge v1.2.12 Release Candidate

Certification completed: 2026-09-03 (America/New_York)

Release basis:

- Previous release: `v1.2.11` (`c0fbae0c5d2371800375a10d2bf4b8b76f547501`)
- Certified product basis: `98218c9f` on `Hammer_Smoke3`
- The final candidate is the certification commit containing this record and the three Tongs lint repairs described below.
- Linked Supabase migrations are paired through `20260903150000_tongs_reference_material_rollout_gate.sql`.

## Candidate changes certified

- Preserve canonical asset authority fields through the shared Tongs/Hammer visual-placement contract.
- Keep legacy Hammer media and timeline migration behavior fail-closed under the current canonical authority model.
- Complete the Hearth reference-material workflow and its database-backed rollout gate.
- Exercise authenticated, locally provisioned browser fixtures without mutating production fixture data.
- Make Anvil built-in recorder initialization awaitable so deterministic test adapters cannot be overwritten by late optional-adapter registration.
- Keep Tongs URL recovery, provider error parsing, and PDF stream inspection within the repository's lint and type-safety contracts.

## Verification summary

- Database deployment: the linked push applied `20260903150000_tongs_reference_material_rollout_gate.sql` successfully.
- Migration ledger: local and linked ledgers pair through `20260903150000`; no local-only or remote-only migration was reported.
- Docker migration certification: clean install and production-shaped upgrade passed, including loopback isolation, immutable receipts, canonical media verification, idempotency, and cross-workspace RLS denial.
- Authenticated browser gate: passed all 28 Playwright tests across adaptive style, organization sharing, session switching, Hammer triad lock, Hammer visual authority, Bar-Stock reconciliation, Hearth Phase 4, and Hearth image-map persistence.
- Anvil release gate: passed lint, typecheck, cycle detection, build, recording suites, Chromium recording boundary, migration certification, strict OBS smoke, and the authenticated Hearth-to-Anvil canonical handoff.
- Nursery umbrella gate: passed workspace typecheck/lint/architecture, production builds, all package integration suites, media tests, and the complete browser gate.
- Existing warning budgets remain unchanged: Anvil reports 15 lint warnings and Nursery reports 4 lint warnings, with zero lint errors.

## Release decision

**GO — Forge v1.2.12 release candidate certified.**

The former authenticated-browser blocker is cleared. Local browser fixtures were provisioned against the loopback Supabase project, authenticated state was refreshed, and the canonical database-backed workflows survived reload and cross-tool handoff.

One transient local Supabase Storage 500 was logged during a non-authoritative chat-artifact write in the Anvil handoff run. The gate's canonical script handoff passed, the complete browser gate subsequently passed, and no fallback persistence was introduced.

No release tag, merge to `main`, application deployment, or Git push was performed by this certification step.
