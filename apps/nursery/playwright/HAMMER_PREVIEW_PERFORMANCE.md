# Hammer Preview performance certification

Development measurements are diagnostic only. Run `pnpm --filter nursery preview-performance:prepare` to create or repair the ignored deterministic fixture, then use `pnpm --filter nursery test:playwright:hammer-preview-performance` for the headed Chrome/Edge matrix.

Formal evidence requires a reviewed, committed candidate and a clean tracked worktree. Set these process-only values:

```text
HAMMER_PERFORMANCE_FORMAL=1
HAMMER_PERFORMANCE_CANDIDATE_SHA=<full HEAD SHA>
VITE_HAMMER_CANDIDATE_SHA=<same full SHA>
HAMMER_PERFORMANCE_POWER_MODE=ac
HAMMER_PERFORMANCE_RUN=1 or 2
```

Place the three internal reference files below the ignored `public/__hammer_performance_internal__/` directory. Create the ignored `playwright/.cache/hammer-preview-performance-internal.v1.json` manifest with an `episodes` array. Each entry must contain `classification: "internal_episode"`, a unique sanitized label, its `/__hammer_performance_internal__/...` public path, SHA-256 content hash, duration, width, height, frame rate, and one unique evidence role: `presenter_edges`, `visual_heavy`, or `transport_recovery`. Never put creator names, episode titles, or internal media into tracked files.

The deterministic 20-minute fixture is the sustained-load authority. Internal media represents the recordings actually available for release review: `visual_heavy` must be at least two minutes, `presenter_edges` at least 20 seconds, and `transport_recovery` at least 15 seconds. These role-specific bounds do not relax compositor, segmentation, queue, stall, flash, seek, or control-response thresholds.

Run the complete matrix with `HAMMER_PERFORMANCE_RUN=1`, repeat it in clean browser processes with run `2`, then run `pnpm --filter nursery verify:hammer-preview-performance-receipts`. The verifier requires every browser, medium, scenario, repetition, and campaign run to exist, pass, match the candidate, and retain a valid canonical fingerprint.

The formal preflight fails for a dirty candidate, build/SHA mismatch, software rendering, missing stable Chrome or Edge, missing FFmpeg, non-AC declaration, missing or hash-invalid fixture media, missing or duplicated internal evidence roles, role-incompatible durations, or malformed authority. Receipts and media remain ignored non-canonical release evidence.
