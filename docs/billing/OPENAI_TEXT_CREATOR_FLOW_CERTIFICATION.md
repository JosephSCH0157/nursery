# Seven-route authenticated creator-flow certification

Status: passed in the disposable local Supabase project on 2026-09-09. This is Test evidence, not Live activation or authoritative provider-cost evidence.

The browser run used the real creator interfaces, quote dialogs, application endpoints, route adapters, validators, canonical Tongs persistence, settlements, and customer receipts. Only the external OpenAI boundary was simulated. The server process contained no `OPENAI_TEXT_API_KEY` or `OPENAI_API_KEY`, every provider reference was prefixed `sim-browser-`, and the batch contract recorded `real_provider_called=false`.

Batch `43970f92-ea3d-41be-9fa4-3a29a1bb3acb` is closed. Its synthetic $1.00 / 100-credit fixture balance ended at $0.93 / 93 credits after seven one-cent successful settlements. Seven shared validation-failure exercises produced seven released reservations and zero customer charge. Replaying each handled failure did not add an execution or debit.

| Route | Selected Test model | Accepted quote | Operation | Canonical domain result | Settlement |
|---|---|---|---|---|---|
| `hearth.research_synthesis` | `gpt-5.3` | `3c2b6068-f567-4956-b7c0-1ebeac4a078b` | `ceef9bbb-3981-4b6b-92af-4db06d29261c` | `63903c6c-24e4-4908-a99b-7a864f68e42a` persisted | `3832bd58-893f-49c8-a9e2-823d71df59c2` |
| `visual.unified_plan` | `gpt-5-mini` | `bbb5ba83-567a-4aa0-bcad-740fd142a26f` | `forge:unified-visual-plan:44ed5793dd775ca6edbe61f2bcdb16dc13edb60996cbeb7a79ae3ad7e20f0501` | `18906324-594a-42c4-a8b4-5f0a365911e1` verified | `f6e3b548-2048-4d68-b508-6a1c5e924756` |
| `visual.narrative_interpretation` | `gpt-5-mini` | `10ae8b9e-9dc7-4b82-86da-4a78570e58a9` | `forge:image-prompt:interpret:94cfb7c36911a62868f6eef176ae3cde8e9d8bc09f48c239b88f0230c34e7f80` | `2523f9ac-ac01-495e-a987-3947d2187736` committed | `f00c1b65-f5ed-4fe8-a66d-35eaaa0ca1fc` |
| `motion.broll_interpretation` | `gpt-5-mini` | `f9842807-69b7-42be-ab8f-4a0e5ff6e680` | `forge:broll:prompt:94da44b3e48cd18e9f58bcc1b5ae95f1bdc9464eadc1920360c30dbc26eca91f` | `3b3debed-a7c8-41b5-a2d7-35be12450c62` committed | `4ebb71a9-fba4-405b-9bf7-928cd7a5fbb6` |
| `hammer.transcript_cleanup` | `gpt-5.3` | `9f6aba58-87b9-46f6-bcb0-2c6dd636e8fc` | `forge:hammer-transcript-cleanup:c2b446f1007ad182cefdc2e51671e9cda5cf35f2491c668f49c6e3ff2167b0ff` | `7b5a6465-192d-472c-83ac-bcf58bdb94e3` persisted | `594cb5f1-fa20-4e3b-a03b-b55a32441332` |
| `shorts.discovery` | `gpt-5.3` | `4596f897-91c2-468f-977d-7130fa122edf` | `hammer-shorts-discovery:dcfd0b4a-5576-4d82-939a-640b09e211c0` | `cd7bebb8-2f6d-4e2e-ab5a-acc7b5819551` completed | `8d934830-9c0a-4781-b2d2-f63015682f1e` |
| `quench.metadata` | `gpt-5.3` | `9d122547-2356-43fd-b261-b51bd4684471` | `forge:quench-metadata:0cd0458df64bda51185585d143fa0784c9419adc955391cc96e3fc6986c5eb59` | `a3d408cb-ef83-4698-85bb-71e6c58b4706` persisted | `22088f90-fa85-4bd0-b57a-9b85a61a36e6` |

The successful browser observation artifact is `playwright/.cache/openai-seven-browser-observations.json`; the server/database verification artifact is `playwright/.cache/openai-seven-browser-certification-verification.json`. Both are generated evidence and intentionally ignored by Git because they contain disposable local identities. The repeatable source is:

- `apps/nursery/playwright/openai.seven-creator-browser-certification.spec.ts`
- `apps/nursery/scripts/openai-seven-browser-certification-fixture.mts`
- `apps/nursery/scripts/verify-openai-seven-browser-certification.mts`

Shared regression coverage supplies the cross-route edge cases that need not be repeated through every UI: changed request/model rejection, duplicate and concurrent reservation behavior, response-loss recovery, ambiguous submission without resubmission, provider/validation/persistence customer relief, supplier expense preservation, and BYO failure without Forge-key fallback. Model preference remains Supabase-backed and user-scoped. A dismissed browser quote sends no acceptance and therefore cannot reserve or execute.

This certification does not change production rollout. The seven ordinary production routes remain in legacy pass-through mode until exact Live cost coverage, failure-loss limits, model generation compatibility, customer funding, and explicit publication are approved.
