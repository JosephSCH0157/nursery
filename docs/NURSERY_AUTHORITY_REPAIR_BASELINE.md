# Nursery Authority Repair Baseline

Baseline commit: `b10464f6294679a64294a94e3a5daefef8162a94`.

| Owner | Reproduction command | Initial observation | Category | Expected behavior |
| --- | --- | --- | --- | --- |
| Root/CI | `pnpm test`; `pnpm types` | Root coverage was partial and relied on optional package participation | Runner defect | Every active package is intentionally represented |
| Runtime | `node --version`; `pnpm --version`; manifest and CI inspection | Runtime declarations were incomplete or selected broad Node 20 ranges | Runner defect | Node `20.20.0` and pnpm `10.30.3` are declared consistently |
| Test runner | `node scripts/verify-test-runner-exit.mjs` | No repository preflight proved uncaught failures return nonzero | Runner defect | Any uncaught failure returns nonzero |
| Contracts | production build and relative-import inspection | Runtime imports reached an unregistered contracts directory | Dependency defect | A registered public contract surface participates in verification |
| Quench | Hammer release-packet ingest tests | Existing repair files were present in the pre-plan working tree | Product defect under existing repair | Preserve the repair unchanged during baseline reconstruction |
| Bar-Stock | source inspection and refresh model | Browser state participated in durable behavior | Product defect / SSOT | Supabase acknowledgement and hydration are canonical |
| Nursery AI | `forge-money-path-matrix.test.mts` | Harness omitted the current policy RPC response shape | Stale fixture | Missing, malformed, or denied policy remains fail-closed |
| Hammer media | transcription normalization tests | Original `video/webm` bytes remained eligible after WAV normalization | Product defect | Forge FFmpeg WAV output is sent upstream |
| Hearth | recording-ready formatter suite | Fixture expected behavior outside the current formatter contract | Stale fixture | Test current behavior without inventing semantics |
| Anvil | `pnpm --dir apps/anvil test` | Multiple ASR/cursor suites failed | Stale fixtures / product defects pending adjudication | Authority behavior passes without weakening runtime rules |
| Browser | existing Playwright commands | Live fixture and authentication prerequisites were unavailable | External dependency / runner defect | Missing prerequisites are explicit blocks, never silent green skips |

## Phase 0 verification commands

- `node --version`
- `pnpm --version`
- manifest and CI runtime declaration inspection
- `node scripts/verify-test-runner-exit.mjs`
- retained Quench focused test command
- `git diff --check`

This report records observations only. It does not authorize or implement Phase 1 or later repairs.
