# Owner-Funded Hearth Activation

This release activates only the explicitly authorized private owner testing lane for `hearth.chat_completion`. It does not publish customer prices, enable organization funding, or change the global OpenAI/Runway/transcription rollout modes.

## Credential boundary

`OPENAI_HEARTH_OWNER_API_KEY` and `OPENAI_HEARTH_OWNER_IMAGE_API_KEY` are
server-only Netlify Production Functions secrets. Only their respective
coordinated owner Hearth text and image paths may read them. Legacy text,
research, transcription, job-runner, customer, and browser paths continue to
use their existing credential resolution and cannot fall back to either key.

Every Forge OpenAI credential must be created only after verifying this
authority chain, in order:

1. account: `support@podcastersforge.com`
2. organization: `org-M9AuhWvVFuGxXTGTsv33dc7X`
3. exact lane project
4. credential purpose
5. key creation
6. secret-manager installation

The owner-text service-account key belongs to project `Podcaster's Forge`
(`proj_ZuYi36uhWk4Xu8zEYs0PmI2H`). The owner-image service-account key belongs
to project `Podcasters Forge Images` (`proj_JSh3dPfs9QVm5eDMFNSQCmnu`). A key
created from a personal account, another organization, or the wrong project is
invalid for Forge even when it can call the intended model. Never create the
key first and inspect its authority afterward, and never reuse a key across
these two lanes for convenience.

No browser variable, source file, log, lifecycle report, or operator report may
contain a raw secret value. Only non-secret provider identity, suffix, and hash
evidence may be retained. After rotating either secret, publish a fresh
Git-backed `main` deployment before compatibility checks so the executing
Production Function is provably built after the secret revision.

## Authorized phases

- Compatibility: five exact models, one call each, concurrency one, one attempt, 512 maximum output/reasoning tokens, 24 hours, and $0.09 aggregate authorization.
- A replacement compatibility run uses a new authorization and new $0.09 execution budget only after the preceding batch is closed. It reuses the existing `$0.24` tail authorization; it cannot create a second storage allocation.
- Creator session: created dormant only after all five compatibility results pass validation and canonical persistence. Its clock starts with the first accepted operation; maximum $10, 20 operations, concurrency two, one attempt, $2 unrecovered failure-loss exposure, 24 hours, and no renewal.
- Aggregate production exposure: $10.84 including the unresolved historical $0.75 Runway opening commitment. The opening commitment is exposure, never spendable funding and never a duplicate supplier expense.
- Storage tail: days 0–30 stay inside each operation's existing support allocation. Post-day-30 storage is a separate 12-month allocation capped at $0.02 per monthly period and $0.24 total for 128 MiB canonical content plus 32 MiB provider/reconciliation evidence. Expiry preserves data and evidence, reports continuing cost, and halts new owner AI admissions until replacement funding exists.

## State and evidence

Usable terminal execution and provider-cost reconciliation are separate. A successful operation can settle with an explicitly estimated supplier expense after response capture, validation, and canonical persistence. Only authoritative provider billing evidence may append an authoritative adjustment. Ambiguous submissions remain nonterminal and halt new owner admission without resubmission.

Rollback is owner-specific `halt_new`. Polling, recovery, persistence, settlement, storage accounting, and reconciliation remain available; unrestricted legacy execution is never restored.
