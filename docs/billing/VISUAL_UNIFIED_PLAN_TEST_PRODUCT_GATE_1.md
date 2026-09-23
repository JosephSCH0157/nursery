# Visual Unified Plan Test Product — Gate 1

Date: 2026-09-23

Branch: `mid_september_smoke`

Baseline: `cc7594b824e2a4c53528d5fa413383d4ab101770`

Route: `visual.unified_plan`

This report certifies the forward-only Test product change. It does not authorize or record a migration deployment, customer quote, quote acceptance, provider request, or gasoline Visual Plan generation. Live customer execution remains inactive.

## 1. Historical 423 authority

The pre-change linked readback showed a historical singleton route policy with a 64,000-input / 16,000-output / one-attempt envelope, result validation and canonical persistence requirements, and no usable normal-customer product authority. The associated historical attempt plans allowed 16,384 output tokens. Its historical cost-policy revisions were:

- revision 1: draft, 341,376-micro direct-provider ceiling, supporting cost unpriced;
- revision 2: draft, `gpt-5-mini`, 48,768-micro direct-provider ceiling, supporting cost unpriced.

The route's old base rollout was inactive and the latest linked rollout authority halted new submissions. The active normal-customer catalog had no compatible `visual.unified_plan` model, there was no normal Test or Live customer scope, and there was no route failure-loss policy/rollout capable of admitting the operation. This is the authority that produced the observed HTTP 423.

For gasoline workpiece `21d16d6a-905b-491e-8761-028789612ae5`, linked readback found no spending quote and no unified Visual Plan operation. The failed admission therefore produced zero accepted quotes, provider attempts, usage evidence, provider captures, canonical results, supplier expense, or customer charge.

## 2. Modern product authority

Migration `20261011530000_visual_unified_plan_test_product.sql` appends, without rewriting historical rows:

- active cost policy revision 3 for `gpt-5.6-luna`;
- a published private four-Credit price;
- active catalog revision 10 with generation-verified Luna compatibility;
- an enforcing next Test route rollout revision;
- a normal-customer Test scope using the existing generic quote, reservation, admission, execution, and settlement path;
- Test failure-loss policy and rollout authority with a hard per-operation ceiling, one-operation aggregate capacity, and concurrency 1;
- structurally parallel Live failure-loss configuration, but no Live customer execution scope;
- generic service-only validation-failure evidence authority for provider contract v4.

The migration deliberately does not modify the historical 64k/16k route or cost-policy records. On linked, the next route rollout revision will supersede the linked-only halt. On a fresh replay, it appends after the historical inactive revision.

## 3. Gasoline request measurement

The read-only certification script reconstructs the request from the current linked approved script; it does not print script content or call a provider.

| Field | Certified value |
|---|---:|
| Workpiece | `21d16d6a-905b-491e-8761-028789612ae5` |
| Approval | `be87d40f-516b-4dcf-bd25-094b922cc682` |
| Approval revision | 1 |
| Script hash | `0d32f3762a1ee766cf43ab52568407123f1ede0d0de1d1a7114819c3cc6dedfe` |
| Generation scope | `full_media_plan` |
| Creator direction | none |
| Source catalog entries | 0 |
| Serialized request bytes | 15,421 |
| Tokenizer | `o200k_base-js-tiktoken-1.0.21` |
| Measured input tokens | 3,534 |
| Protocol overhead | 16 tokens |
| Forge conservative input bound | 15,421 tokens |
| Request SHA-256 | `c7b10f06cc1aca8f1d412b6d4cbf505c3342d7d59b1d6695bc9b6fd535944340` |
| Output contract | `forge.unified-visual-plan-provider.v4` |

The unchanged domain result is the existing unified plan containing Image Plan, B-roll Plan, Reference Clip Plan, and Reference Visual Plan content.

## 4. Model choice

`gpt-5.6-luna` satisfies the existing JSON structured-output contract through the same bounded Responses request. No contract requirement was found that required retaining the older `gpt-5-mini` policy. The provider adapter accepts semantically valid top-level `output_text` serialization while preserving strict downstream schema, generation-scope, source, and coverage validation.

## 5. Bounds

The modern envelope is 32,000 maximum input tokens, 6,144 maximum output tokens, and exactly one provider attempt. Browsing, retrieval, attachments, and tools are all disabled. There is no automatic repair attempt. The input ceiling provides substantial episode-size headroom over the 3,534-token measured gasoline request, while the output ceiling preserves capacity for all four structured plan families.

## 6. Exact economics

The canonical Luna rate revision prices input at 200,000 micros per million tokens and output at 1,200,000 micros per million tokens.

| Component | Calculation | Micros |
|---|---:|---:|
| Maximum input supplier exposure | `ceil(32,000 × 200,000 / 1,000,000)` | 6,400 |
| Maximum output supplier exposure | `ceil(6,144 × 1,200,000 / 1,000,000)` | 7,373 |
| Direct supplier ceiling | input + output | 13,773 |
| Supporting variable cost | certified attributable cost | 0 |
| Full cost ceiling | direct + supporting | 13,773 |
| 33% cost-plus target | `ceil(13,773 × 133 / 100)` | 18,319 |
| Customer price | canonical whole-Credit rounding | 4 Credits / 20,000 micros |
| Whole-Credit rounding adjustment | price − target | 1,681 |

The Test per-operation failure-loss ceiling is 13,773 micros. Initial Test aggregate capacity is 13,773 micros with concurrency 1. Aggregate exposure remains an operator/platform risk control; it is not a customer entitlement or rolling lock.

## 7. Persistence and replay architecture

The `/visual-plan-v2/generate` entrypoint and unified operation identity remain intact. The immutable request binding includes user, workspace, workpiece, approval ID/revision/hash, generation scope, optional creator direction, source catalog, model configuration, domain contract, and provider contract.

After one authorized provider attempt, the coordinator captures provider usage and expense before Forge validation. A valid response is normalized and validated, then the existing unified operation commits all four canonical child revisions and generic paid-result linkage before settlement. Settlement occurs exactly once. A persistence failure is not exposed as partial customer success.

A validation failure settles zero customer Credits, releases the reservation, retains immutable private raw provider evidence plus validation contract/error and actual supplier usage/cost, creates no customer-usable plan, and performs no second request. Settled replay reads the canonical persisted authority without another provider call, charge, or supplier expense. Changed approval or request fingerprint cannot reuse an accepted quote.

## 8. Migration details

Only the new forward migration `20261011530000_visual_unified_plan_test_product.sql` changes database authority. Historical migrations were not edited; `git diff --name-status -- supabase/migrations` reports only this added file. The guarded replay manifest was extended so this migration participates in the established historical-fixture replay rather than altering recovered history.

The migration also supersedes the generic validation-failure recorder narrowly enough to recognize the existing Framing Pack contract and Visual Plan provider contract v4. Its execution remains service-role-only, and the evidence table remains private and immutable.

## 9. Test evidence

Passing verification:

- `pnpm --filter @forge/tongs test:openai-billing`: 140/140, including all coordinated text routes, quote/acceptance boundaries, success, validation failure, persistence failure, risk admission, settlement, and replay;
- unified Visual Plan authority/provider tests: 20/20, including four-child commit, one request, harmless Responses serialization, malformed-output retention, scope enforcement, and canonical recovery behavior;
- focused Nursery Titles, Tags, Framing Pack, and paid ordinary-Hearth regressions: 25/25;
- Visual Plan lazy-load, revision-0 initial state, canonical-state, containment, and operation UI regressions: 16/16;
- `@forge/tongs`, `@nursery/hearth`, and `nursery` typechecks passed;
- the exact gasoline measurement script passed without provider execution.

The paid-route tests use deterministic provider doubles. They prove quote preparation precedes execution, no provider callback occurs without exact acceptance, stale authorization fails before transport, success settles once, failed output records supplier expense and charges zero, and replay makes no additional provider call.

## 10. Disposable database certification

Docker availability was checked without starting or reconfiguring Docker Desktop. The complete guarded, fixture-assisted migration replay through HEAD passed on disposable local Supabase. It applied the recovered historical sequence unchanged, injected only the documented historical precondition fixture, applied all forward migrations including `20261011530000`, and passed:

- the mid-September integrity assertions;
- prior Framing authority assertions;
- `visual_unified_plan_test_product.sql` authority/economics/permission assertions;
- local-versus-linked schema fingerprints.

This proves blank-environment reproducibility without inventing a deployable bootstrap migration.

## 11. Linked dry-run

`supabase db push --include-all --dry-run` completed successfully and proposed exactly one migration:

```text
20261011530000_visual_unified_plan_test_product.sql
```

No migration was deployed. `supabase migration list --linked` shows local and linked aligned through `20261011520000`, with only `20261011530000` local-only.

## 12. Exact Gate 2 steps

Gate 2 requires a new explicit user authorization. After that authorization only:

1. deploy only `20261011530000_visual_unified_plan_test_product.sql` through the normal Supabase migration path;
2. read back the active Test cost, catalog, price, route rollout, normal-customer scope, risk limits, permissions, and zero Live customer scope;
3. read Test realized/committed exposure immediately before quoting;
4. prepare exactly one fresh gasoline `visual.unified_plan` quote bound to the certified approval and frozen request;
5. stop at the customer confirmation boundary and report the quote, four-Credit charge, balance, request identity, and proof of zero provider calls before acceptance;
6. accept only after a subsequent user-authored instruction explicitly authorizes that paid execution;
7. allow exactly one Luna provider attempt, then verify four canonical child plans, one settlement, captured supplier usage/cost, reload/recovery, and zero-call/zero-charge replay.

At this Gate 1 stop, no deployment, real quote, acceptance, OpenAI request, or gasoline Visual Plan generation has occurred.
