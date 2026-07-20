# Hammer First-Class Editor Phase 10 Completion

Phase 10 establishes Hammer's performance, assistance, and permanent expansion gate without adding a new creative or persistence authority.

## Canonical authority impact

Performance measurements, bounded caches, and AI assistance are not canonical creative state. The only accepted creative mutation remains:

```text
acknowledged HammerCompositionV2
→ explicit HammerCompositionCommand
→ one canonical history transaction
→ deterministic render plan
```

AI output is proposal-only. A proposal must carry workpiece identity, recording revision, exact composition revision, composition fingerprint, source fingerprints, proposed commands, explanation, and its own fingerprint. Accepting a proposal returns explicit Composition V2 commands; it does not mutate Hammer state by itself. Stale, wrong-identity, wrong-source, or tampered proposals fail closed.

Disposable caches are bounded accelerators keyed by canonical source fingerprint plus generator version. Cache eviction or deletion cannot remove source media, composition state, history, render jobs, or release-packet truth.

## Permanent regression proof

The Phase 10 foundation gate proves:

- long-form startup, first preview frame, seek, edit, undo/redo, save acknowledgement, memory, cache growth, bundle size, and render-plan compilation budgets;
- required optimization boundaries for failed measurements: virtualization, worker boundary, or bounded cache;
- bounded cache eviction and explicit deletion;
- AI proposal acceptance as exactly one canonical history transaction, stale-result rejection, source-fingerprint rejection, no implicit mutation, no refusal-side transaction, and Undo back to the original composition;
- permanent gate reporting with explicit deferrals;
- discovery, strict compilation, coverage, lint, build, bundle, and mounted workflow scripts remain wired.

The architecture ratchet now directly checks the permanent expansion-gate contract, including:

- performance budgets;
- proposal creation and acceptance;
- stale proposal rejection;
- permanent expansion rules;
- no browser-storage acknowledgement in the gate itself.

## Measured Phase 10 baseline

Environment:

```text
OS: win32
Node: v24.14.0
Measured: 2026-07-13T12:28:45.323Z
Fixture: HAMMER_COMPOSITION_FIXTURES.semanticPlan
Mode: local warmed Node/tsx contract measurements; browser paint and network are excluded
```

Measured local contract baselines:

| Operation | Median | p95 | Samples | Limit / regression rule | Gate posture |
| --- | ---: | ---: | ---: | --- | --- |
| startup to reviewable editor fixture | 0.635 ms | 0.910 ms | 50 | ≤ 2,500 ms | hard contract budget |
| first preview frame fixture | 0.185 ms | 0.413 ms | 100 | no semantic regression; plan fingerprint must match | observational local baseline |
| seek operation selection | 0.001 ms | 0.001 ms | 500 | ≤ 150 ms | hard contract budget |
| edit command transaction | 0.231 ms | 0.408 ms | 200 | ≤ 100 ms | hard contract budget |
| undo/redo history traversal | 0.207 ms | 0.310 ms | 200 | no extra history authority; raw-state Undo remains green | observational local baseline |
| save acknowledgement transaction readback | 1.074 ms | 1.203 ms | 100 | ≤ 1,200 ms | hard contract budget |
| render-plan compilation | 0.152 ms | 0.238 ms | 200 | ≤ 250 ms | hard contract budget |
| memory after 500 render-plan compiles | +0.108 MB heap | n/a | 1 | ≤ 768 MB process budget; no unbounded authority cache | hard contract budget plus observational heap delta |
| bounded cache growth | 32 entries / 262,144 declared bytes | n/a | 96 puts | max 32 entries / 1,048,576 bytes | hard bounded-cache contract |

Bundle baseline from the mounted production build:

| Artifact | Bytes | gzip |
| --- | ---: | ---: |
| `hammer-production-gate-entry-DDR7HrmQ.js` | 213,868 | 58,335 |
| `AiControlsPanel-CdH93oTx.js` | 46,477 | 12,504 |
| `hammer-production-gate-entry-BBmSshrF.css` | 87,253 | 14,954 |
| total measured assets | 347,598 | 85,793 |

Enforced bundle limits in `apps/nursery/scripts/verify-hammer-production-build.mjs`:

```text
entry JS ≤ 225,000 bytes
total JS ≤ 275,000 bytes
total gzip JS+CSS ≤ 90,000 bytes
```

Metrics that depend on browser paint, device GPU, storage backend latency, or real network acknowledgement remain observational in this local closeout. They are recorded with the fixture, environment, and regression rule rather than promoted to false deterministic CI guarantees.

No virtualization, worker boundary, or additional cache infrastructure was added because the measured local contract baselines stayed within the Phase 10 budgets.

## Preview/render implications

The full-program fixture remains compiled through `HammerRenderPlanV1`, and preview proof remains bound to the render-plan fingerprint. Phase 10 does not create preview-side or export-side creative authority.

Exact proofs:

- mounted first-class workflow proof: `Phase 8 proves intro-program-outro as one continuous package with all mounted creative elements`;
- full-program preview/render parity: `Phase 10 permanent expansion gate preserves Composition V2, preview/render parity, and full-program proof`;
- proposal acceptance creates exactly one canonical history transaction: `Phase 10 AI assistance remains proposal-only, identity-bound, and stale-result rejected`;
- proposal rejection/refusal creates no transaction: same Phase 10 AI-assistance proof;
- accepted proposal Undo returns through canonical history: same Phase 10 AI-assistance proof;
- cache deletion preserves canonical truth: `Phase 10 bounded caches are disposable accelerators keyed by source fingerprint and generator version`;
- Tongs commit API result: `Tongs composition pointer acknowledgement is compare-and-swap guarded`;
- Quench receiver validation result: `only acknowledged current creative masters produce a validated Quench packet`;
- render job stale/source/duplicate/packet exclusion result: `Phase 9 render jobs handle cancel, retry, resume, source mismatch, duplicate acknowledgement, and packet exclusion`;
- bundle measurement and limit: `pnpm run build:hammer` production verifier, with `entryBytes=213868/225000`, `totalJsBytes=260345/275000`, and `totalGzipBytes=85793/90000`;
- shuffled Hammer result: `pnpm --dir apps/hammer run test:all:shuffled`, seed `260710`, result `121/121`;
- migration/RLS final audit: this record, plus the Composition V2 and Phase 9 preflight tests.

## Migration and RLS disposition

No new migration or RLS policy is required for Phase 10.

Reason:

```text
Performance measurements = runtime diagnostics
AI proposals = stale-rejectable proposed commands
Bounded caches = disposable accelerators
Permanent gate reports = reproducible proof artifacts
```

None of these become canonical persisted user truth. Tongs remains the persistence authority for acknowledged composition, history, render-job, and release-packet records.

Final audit disposition:

```text
Phase 10 schema change: none
Phase 10 RLS change:    none
Unresolved schema gap:  none
Unresolved RLS gap:     none
```

## Explicit deferrals

The following remain optional refinements and must pass the same expansion gate before shipping:

- deep collaboration;
- review portals;
- custom shortcut systems;
- dual-monitor layouts;
- broader motion design.

## Final first-class editor acceptance

Hammer is first-class when a creator can open canonical recorded media, recover or relink it by fingerprint, edit by transcript or timeline, mix dialogue and music, compose multicamera visuals and supporting assets, add captions and branding, continuously play the full packaged program, undo everything to untouched raw state, render revision-bound creative masters, and deliver a receiver-validated packet to Quench from another device without browser state determining truth.

Phase 10 locks the expansion rule that future performance work, AI assistance, and new features may not bypass that contract.
