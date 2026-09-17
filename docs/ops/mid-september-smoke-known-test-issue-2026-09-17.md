# Mid-September Smoke: Known Quench Test-Fixture Issue

Date observed: 2026-09-17

## Scope

An expanded local validation run that included `quench-metadata-preflight.test.mts`
failed with an HTTP 503. The Quench fixture was not part of the Hearth script
generation repair and was left unchanged.

## Evidence

The test process resolved the machine's real Supabase and paid-provider runtime
configuration instead of remaining inside its intended fixture boundary. That caused
the request to enter the paid-funding path, while the fixture only mocks the policy
and OpenAI portions of the route. The resulting 503 is therefore tracked as a
separate non-hermetic test-fixture issue, not as a failure of the Hearth script
generation repair.

## Disposition

- No Quench production code or test fixture was changed in this checkpoint.
- No provider request was authorized because of this test failure.
- The focused Hearth and OpenAI billing suites remain the acceptance evidence for
  the current repair.
- Any Quench fixture isolation repair requires a separately scoped change.
