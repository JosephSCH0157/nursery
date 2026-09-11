# Owner-Funded Hearth Activation

This release activates only the explicitly authorized private owner testing lane for `hearth.chat_completion`. It does not publish customer prices, enable organization funding, or change the global OpenAI/Runway/transcription rollout modes.

## Credential boundary

`OPENAI_HEARTH_OWNER_API_KEY` is a server-only Netlify Production Functions secret. Only the coordinated owner Hearth chat path reads it. Legacy text, research, transcription, job-runner, customer, and browser paths continue to use their existing credential resolution and cannot fall back to this key.

The key must be a restricted OpenAI project key with Models Read and Chat Completions Write. No browser variable or report may contain its value.

## Authorized phases

- Compatibility: five exact models, one call each, concurrency one, one attempt, 512 maximum output/reasoning tokens, 24 hours, and $0.09 aggregate authorization.
- A replacement compatibility run uses a new authorization and new $0.09 execution budget only after the preceding batch is closed. It reuses the existing `$0.24` tail authorization; it cannot create a second storage allocation.
- Creator session: created dormant only after all five compatibility results pass validation and canonical persistence. Its clock starts with the first accepted operation; maximum $10, 20 operations, concurrency two, one attempt, $2 unrecovered failure-loss exposure, 24 hours, and no renewal.
- Aggregate production exposure: $10.84 including the unresolved historical $0.75 Runway opening commitment. The opening commitment is exposure, never spendable funding and never a duplicate supplier expense.
- Storage tail: days 0–30 stay inside each operation's existing support allocation. Post-day-30 storage is a separate 12-month allocation capped at $0.02 per monthly period and $0.24 total for 128 MiB canonical content plus 32 MiB provider/reconciliation evidence. Expiry preserves data and evidence, reports continuing cost, and halts new owner AI admissions until replacement funding exists.

## State and evidence

Usable terminal execution and provider-cost reconciliation are separate. A successful operation can settle with an explicitly estimated supplier expense after response capture, validation, and canonical persistence. Only authoritative provider billing evidence may append an authoritative adjustment. Ambiguous submissions remain nonterminal and halt new owner admission without resubmission.

Rollback is owner-specific `halt_new`. Polling, recovery, persistence, settlement, storage accounting, and reconciliation remain available; unrestricted legacy execution is never restored.
