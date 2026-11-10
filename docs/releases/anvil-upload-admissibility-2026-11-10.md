# Anvil upload admissibility repair — local certification

Scope: client request admission only; no deployment, hosted requests, bucket
configuration, database, financial-authority, segmentation, or larger-object changes.
Base: `26bec417fe60c35406f4475b21b8a678753d6c49`.
Branch: `codex/anvil-upload-admissibility`.

## Behavior

- Raw chunk maximum and default: 3 MiB (3,145,728 bytes).
- Single-request raw threshold: at most 3 MiB. Larger recordings use the existing
  chunk protocol. URL, window, local-storage, and explicit strategy overrides
  cannot increase these limits.
- Every commit-file, begin, chunk, and finalize body is serialized once and its
  complete UTF-8 byte length checked before authorization-header acquisition and
  fetch. The checked string is the string transmitted.
- Inclusive JSON body ceiling: 4,500,000 bytes, leaving 1,500,000 bytes below
  Netlify's documented 6 MB buffered-request limit. A 3 MiB raw chunk encodes to
  4,194,304 base64 bytes, before JSON fields.
- Inclusive recording admission maximum: 524,288,000 bytes (500 MiB), matching
  the existing bucket limit verified during the November 10 measurement.
  Oversized/invalid totals fail before any media read, upload-session creation,
  or chunk write. File-import identity hashing is metadata-only and unchanged.
- Local admission errors use the existing failed status/result path with HTTP-like
  status 413 and distinct codes `recording_request_too_large` and
  `recording_size_unsupported`. Ordinary server errors retain their existing code.
- No changes to canonical identity, authorization headers, backend financial
  admission, canonical revision/hash acknowledgement, retries, finalization,
  cleanup, or idempotency protocol.

## Certification

Passed with Node 20.20.0 / pnpm 10.30.3 and the existing lockfile:

| Check | Result |
| --- | --- |
| `pnpm --filter teleprompter test --runInBand tests/recording` | 14 suites, 106 tests passed |
| `pnpm --filter teleprompter exec tsc -p tsconfig.json --noEmit` | Passed |
| Scoped ESLint on both implementation files and new test file | 0 errors; one existing unused `writeLocalStorage` warning |
| `pnpm --filter teleprompter build` | Passed, including 26 required distribution assets |
| `pnpm --filter @forge/tongs build` | Passed |
| Node tests: `workpiece-commit-api`, `anvil-capture-authority`, `paid-execution-funding-environment-contract`, `inactive-admission-enforcement-migration-contract` | 205 passed |
| `git diff --check` | Passed |

New tests cover exact UTF-8 JSON boundaries for single/chunk payloads, actual
single-request transmission at ceiling -1 / ceiling / ceiling +1, multibyte and
oversized metadata, URL/global/local-storage overrides, raw chunk splitting and
finalization order, and total size at limit -1 / limit / limit +1 with no reads or
requests above the limit. Existing recording tests retain canonical acknowledgement,
retry failure, finalization, and capture-identity coverage. Backend checks are unit
and migration-contract tests, not database-backed execution.

An initial run had three test-harness failures because JSDOM lacked Web Crypto;
the harness now uses Node Web Crypto and the complete recording rerun passed.

Tests use mocks and synthetic buffers; no customer media or hosted requests are used. Object-limit
edge tests use size-bearing file stubs and stop at a mocked admission denial;
these prove early admission, not successful 500 MiB assembly.

## Limits and release boundary

The 500 MiB application ceiling is fixed to the currently verified bucket setting;
it does not discover later administrative changes. Lowering the hosted/global
limit requires coordinating application admission. The backend remains authoritative.
This repair does not establish available memory or execution time for large-file
assembly, increase the object limit, or prove hosted end-to-end recording acceptance.
Existing resumed sessions retain server shape validation: a session created with
an incompatible historical chunk size is not silently rewritten or reidentified.

The branch starts from the existing Hammer candidate. This focused commit does
not authorize release of its inherited work. No merge or deployment is authorized.

References:
- https://docs.netlify.com/build/functions/configuration/
- https://supabase.com/docs/guides/storage/uploads/file-limits
