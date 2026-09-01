# Forge v1.2.12 Release Candidate

Certification date: 2026-08-31 (America/New_York)

Release basis:

- Previous release: `v1.2.11` (`c0fbae0c5d2371800375a10d2bf4b8b76f547501`)
- Candidate source basis: `05636ddb474c69119ab9406783c044a868c7e55d`
- Certification repairs are present in the working tree and are not committed or tagged.

## Candidate changes certified

- Preserve canonical asset authority fields through the shared Tongs/Hammer visual-placement contract.
- Keep legacy Hammer media and timeline migration behavior fail-closed under the current canonical authority model.
- Update stale Tongs, Hammer, Hearth, and Anvil fixtures to exercise the current contracts.
- Make Anvil built-in recorder initialization awaitable so deterministic test adapters cannot be overwritten by late optional-adapter registration.
- Regenerate the Nursery-hosted Anvil production bundles.

## Verification summary

- Migration ledger: local and linked production ledgers pair through `20260831090000`; no local-only, remote-only, or duplicate migration was found.
- Docker migration certification: clean install and production-shaped upgrade passed, including loopback isolation, immutable receipts, canonical media verification, idempotency, and cross-workspace RLS denial.
- Fast gate: passed typecheck, lint ratchets, and architecture checks for all active packages.
- Production build: passed, including Hammer and Hearth bundle budgets.
- Tests: Anvil 124 suites / 1,029 tests passed in-band; Hammer 186 registered files passed; Hearth 129 files passed; Nursery 50 files passed; Tongs and the remaining package suites passed.
- Media gate: passed, including OBS-to-Bridge fallback and optional OBS handoff.
- Anvil release gate: lint, typecheck, cycles, build, recording tests, Chromium boundary, migration certification, and strict smoke passed.

## Release decision

**NO-GO** until authenticated browser certification can run.

The browser gate is missing `FORGE_TEST_WORKSPACE_ID`, `FORGE_TEST_WORKPIECE_ID`, and `FORGE_TEST_HAMMER_WORKPIECE_ID`. The Anvil release handoff Playwright check also ran without a user token, received fail-closed Tongs authorization denials, and could not load the expected Hearth workpiece. No production data was mutated to manufacture test fixtures.

After valid test authority IDs and authenticated Playwright state are supplied, rerun:

```text
pnpm gate:browser
pnpm gate:anvil-release
pnpm gate:nursery
```

No release tag, push, deployment, or production migration was performed.
