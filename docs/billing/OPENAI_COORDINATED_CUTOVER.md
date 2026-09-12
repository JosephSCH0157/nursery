# Scoped OpenAI production cutover

Baseline: `cdf497001ad0959aa9fec9bccca74467fda01d81`. Authority: approved seven-text/four-transcription halt; no new paid execution, prices, credentials, budgets, or owner-session consumption.

Release follows **AGENTS.md → Production Deployment Policy (Canonical)**: fetch, reconcile, checked Git/PR integration to main, verify the exact published Netlify commit. Never upload production artifacts or switch the site to manual deployment.

## Mode precedence

Environment settings are safety floors, not funding authority. Unknown nonempty modes fail closed. The new private `read_openai_execution_requirement(route, credential_funding)` selects the latest applicable database revision. A Forge-only revision does not replace a prior BYO/all-funding policy. Credential provenance is resolved on the server, never selected by a browser authorization flag.

| Database mode for resolved funding | Environment inactive | shadow | enforce | halt_new |
|---|---|---|---|---|
| inactive | existing legacy transport | coordinated boundary | coordinated boundary | reject new |
| shadow | shadow boundary | shadow boundary | coordinated boundary | reject new |
| enforce | coordinated boundary | coordinated boundary | coordinated boundary | reject new |
| halt_new | reject new | reject new | reject new | reject new |

Text shadow already requires a coordinator. Audio shadow retains its legacy transport until environment enforce; the cutover sets audio enforce. Audio HTTP handlers then resolve the database policy through ordinary funding/coordinator APIs. Explicit inactive text overrides cannot lower environment enforce. Missing aggregate admission is no longer an authorization for Forge direct or supporting costs.

- **Private owner chat:** identity-specific existing owner authority, exact model terms, isolated key, reservations and aggregate admission remain required. Chat revision 10 is not changed. The five policy revisions share environment-wide commitments and one admission lock, not five independent ceilings.
- **BYO:** the eleven Forge halts do not select a different BYO policy. Supported BYO must still supply its exact provider credential and any required bounded authority. There is no configured, approved zero-Forge-support policy newly activated by this release. Unapproved supporting services remain unavailable. No hardcoded-Forge background route gains BYO support.
- **Recovery:** execution-policy changes do not invalidate immutable accepted bindings for captured/attempted operations. Recovery cannot authorize a provider attempt. Settlement/aggregate continuation precedes a separate current-workspace-membership check before content delivery. Original actor identity alone is insufficient after revocation. Ambiguous or incomplete attempts retain obligations; no automatic resubmission.

## Before/after route behavior

All eleven latest Forge revisions were `inactive` at the pre-cutover snapshot. After code publication, append revision 2 `halt_new`, `funding_scope=forge` to exactly these routes, then set the two Production/Functions-only environment floors to `enforce` and publish another Git-backed main commit.

| Route | Actual entry point / provider | After cutover |
|---|---|---|
| hearth.research_synthesis | `/api/hearth/chat`; Chat Completions; resolved Forge/BYO credential | New Forge synthesis unavailable before search/extraction. Captured synthesis may recover without repeating supporting work. |
| visual.unified_plan | Tongs `visual-plan-v2/generate`; Responses | New Forge submission halted; deterministic/manual plan work unchanged. |
| visual.narrative_interpretation | Tongs `image-prompts/interpret`; Responses | New Forge interpretation halted. |
| motion.broll_interpretation | Tongs `broll-v2/prompt-interpret`; Responses | New Forge interpretation halted. |
| hammer.transcript_cleanup | Local middleware `/api/hammer/editorial/transcript-cleanup`; Chat Completions and legacy model fallback | Production path explicitly 503 (formerly SPA fallback); environment-enforced local builds cannot use raw fallback. |
| shorts.discovery | Local middleware `/api/hammer/shorts/discover`; Responses | Production path explicitly 503 (formerly SPA fallback). |
| quench.metadata | Local middleware `/api/quench/metadata/assist`; Chat Completions | Production path explicitly 503 (formerly SPA fallback); manual metadata unchanged. |
| hearth.speech_transcription | `/api/hearth/stt`; audio/transcriptions | No new Forge submission without coordinator; database halt rejects new authority. |
| anvil.realtime_transcription | `/api/anvil/asr/whisper`; OpenAI ASR1 | Same; OpenAI language retry/FFmpeg fallback cannot evade the coordinated branch. Non-OpenAI ASR2 is outside this cutover. |
| hammer.transcript_prep | `/api/hammer/prep/transcript` (local only); Tongs queued runner | Production direct path explicitly 503; database prevents new queued/running transcription work. |
| hammer.transcript_regeneration | Tongs recording revision job → local runner; audio/transcriptions | Database prevents new queued/running work; existing economic evidence remains. |

Tongs planning providers historically used the image-key configuration for text Responses. Its absence is not a financial guard. Environment enforcement remains required even if credentials are later configured. The separate owner key is not injected into these paths. Coordinated Hearth/JSON Forge requests pin `org-M9AuhWvVFuGxXTGTsv33dc7X` / `proj_ZuYi36uhWk4Xu8zEYs0PmI2H`; BYO requests do not inherit those headers. Credential presence is not proof of account ownership or generation compatibility.

## Migration and release order

1. Test `20261009120000_tongs_openai_coordinated_cutover.sql` in a disposable database. It adds funding-scoped policy lookup, a service-only recovery resolver, current-access delivery checks and a queued-job guard. It creates no rollout revision or monetary entitlement.
2. Snapshot production settings, owner authority/events, deployment and job state. Apply only that forward migration using the linked project's normal migration workflow.
3. Integrate and publish the compatible code from main; verify ready/published commit.
4. Append exactly eleven Forge-only halts, preserving the prior cost-policy reference and all chat/Runway settings. Replays must reuse existing matching halts.
5. Set only `FORGE_OPENAI_TEXT_EXECUTION_MODE=enforce` and `FORGE_OPENAI_TRANSCRIPTION_EXECUTION_MODE=enforce`, Production context, Functions scope. Preserve all other env entries and site configuration.
6. Git-backed redeploy; check primary and `/.netlify/functions/...` URLs without paid work. Compare owner/session and unrelated configuration to snapshot.

## In-flight work and rollback

At the snapshot there were no queued/running `workpiece_jobs`. The trigger blocks insertion/transition into new execution, but allows completion and bookkeeping for already attempted jobs. It does not rewrite financial history, clear leases, release obligations, or delete results. The local runner is not started by the production Tongs function. Captured results can use service reconciliation even when customer access has been revoked; delivery cannot.

No automatic retry/restart of historical jobs is authorized. An attempted job lacking retained usable result/evidence remains unresolved for operator reconciliation, not regenerated. Existing local processes retain their loaded code/environment until separately restarted; this release does not terminate them. Waiting for Netlify's normal invocation duration is not an observable proof of all local or historical-deploy invocations draining. Record that limitation if platform telemetry cannot establish it.

Rollback retains the two environment enforcement floors and eleven Forge halts. Fix forward or halt new owner execution with its separate owner control if necessary; preserve recovery, storage and reconciliation. Never restore raw legacy transport as rollback.

## Focused evidence

- `test:openai-cutover-handlers`: actual Tongs alternative HTTP auth rejection, explicit unavailable functions, Anvil no-authority rejection, existing fake Hearth owner execution, duplicate and failure regressions.
- Tongs billing tests: seven route validators/domain continuations, missing admission, Test/BYO isolation, replay, ambiguous submission, and current delivery access after settlement.
- `test:db:hearth-access-funding`: disposable database migration, actor/payer isolation, eleven funding-scoped modes, denied queued jobs with allowed completion bookkeeping, revoked delivery, expiry/obligations, and two concurrent exact-model policy revisions against one environment capacity (one admitted, one denied).
- Prior seven-route domain/browser certification is carried forward; this release does not claim another production customer certification or authoritative cost reconciliation.

## Explicit residual scope

This is **not full OpenAI spending containment**. Old localhost processes, separate worktrees with old environment values, historical deployment URLs/invocations not revoked by this release, OpenAI image generation/edits and any standalone scripts outside these eleven routes remain separate exposures. HF/ASR2, Fly, Runway's existing enforcement, search and other provider families are not activated or redesigned here. New customer/organization execution, rates and support-cost approval remain separate decisions; no price publication is needed merely to reject new unfunded submissions.
