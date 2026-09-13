# Owner-funded Hearth research implementation

Status: implemented and locally testable; intentionally not activated.

This slice connects Hearth’s existing `hearth.research_synthesis` action to the established quote, owner-budget, aggregate-exposure, failure-relief, reconciliation, and immutable-result controls. It does not change the eleven-route rollout, authorize research for any owner, install credentials, create a budget, run a paid canary, or change the dormant owner chat session.

## Exact proposed authority

The sole proposal row is `owner-hearth-research-v1` and remains `proposed`. The additional owner authorization requiring separate approval is **$21.526788**:

| Component | Limit |
| --- | ---: |
| One Astra canary (`$0.130000` OpenAI + `$0.005000` search + `$0.001456` platform) | $0.136456 |
| Ten creator-session actions, conservatively bounded at Astra (`10 × $2.130656`) | $21.306560 |
| Eleven retained packages plus bounded recovery/readback | $0.083772 |
| Total owner authorization | **$21.526788** |

Aggregate admission adds three micros of risk exposure per action, or 33 micros across all eleven actions. The proposed shared ceiling is exactly `32366821` micros: the existing `10840000` micros plus the proposed owner authorization `21526788` and 33 micros of aggregate risk. It is one shared exposure control, not a duplicate budget expense. Research, owner chat, and existing paid obligations all continue to use `restricted_beta_exposure_holds`; the research path does not create a separate aggregate balance.

Each accepted action quote also includes its retained-package allocation: `7616` micros for packages one through ten and `7612` micros for package eleven. The Astra canary is package one and is capped at `144072` owner micros (`144075` aggregate admission). Nine maximum-Astra session quotes are capped at `2138272` micros each, and the final session quote at `2138268`. The package allocation is recorded only if canonical persistence succeeds; unused storage exposure is released at settlement.

The immutable canary profile is Astra-only and limited to one Brave search, two retained sources, 24 total HTTP attempts, 8,000 bounded input tokens, and 1,000 output tokens. The immutable creator-session profile permits six searches, six sources, 24 HTTP attempts, 128,000 bounded input tokens, and 16,384 output tokens. Both profiles allow one provider attempt, one concurrent action, 60 seconds, 256 KiB per response capture, 1 MiB of captures in aggregate, a 768 KiB research package, and 20 recovery reads. Re-entering an authorized stage without a saved response converts it to `submission_unknown`, records the maximum supplier estimate, and prohibits another submission.

The canary failure-loss limit is `144072` micros. The creator session may retain at most two maximum-Astra action commitments, `4276544` micros, as unreconciled failure exposure. These limits are owner expense exposure only; every customer failure charge remains zero.

## Two immutable request bindings

The accepted quote fingerprints the creator-authored plan and fixed execution bounds before any search, retrieval, extraction, or synthesis. It deliberately contains no future source content.

After extraction, the server serializes the exact Chat Completions body, computes its SHA-256 digest and conservative token bound, verifies the accepted model/instruction/output ceilings, and stores the body in `owner_hearth_research_frozen_requests`. The provider executor must bind to that stored body. A changed source, prompt, model, token bound, body byte, or digest is rejected before OpenAI submission.

## Cost and recovery behavior

`owner_hearth_research_component_expenses` records search, retrieval, synthesis, platform execution, database write/delivery allocation, recovery reads, and continuing storage. Brave ambiguity retains the full per-request estimate. Successful or failed retrieval retains the recorded amount (zero until an authoritative non-Brave rate exists). The `$0.001456` platform amount is recorded when supporting work starts and is retained on a pre-synthesis failure. Final settlement adds search/retrieval records to the OpenAI/platform amount and always records zero customer charge and zero customer revenue.

Canonical results, the complete research runtime package, up to six source records, source fingerprints, review state, and recovery reads are append-only. The existing `hearth_research_synthesis_results` record is also written for compatibility. Recovery reads use the saved package and never repeat search, extraction, or OpenAI.

“Reconciled canary” means verified terminal settlement with conservative supplier exposure retained. Authoritative provider billing is accepted when available, but is not required and introduces no waiting period. The accepted quote, reservation, shared aggregate hold, supplier-stage records, frozen payload, provider-attempt capture, settlement, canonical package, sources, review state, and recovery readback must match. Customer charge and revenue must both be zero; unused exposure is released only when demonstrably unused. A canary with `submission_unknown`, an active lease, an unpersisted result, or any resubmittable paid stage is not reconciled. Later authoritative cost evidence adjusts the retained estimate append-only; an overrun forces `halt_new` rather than rewriting history.

The storage allowance is still a proposal. Activation must remain unavailable until authoritative evidence proves that `$0.083772` covers the stated eleven-package byte limits, database writes, delivery, and 20 reads per package. The migration’s activation handoff therefore fails closed even if called.

## Separately approvable activation changes

Activation requires all of the following in a later, separately reviewed transaction:

1. Record an `approved` event for proposal `91000000-0000-4000-8000-000000000001` with the owner approver and evidence.
2. Verify and bind all five exact OpenAI rate/cost-policy, private-pricing, model-catalog, and shared aggregate-policy revisions. The five direct ceilings are `$2.099200`, `$0.839680`, `$0.452608`, `$0.169728`, and `$0.045261`.
3. Verify the Brave `$0.005000` request rate, the canary’s one-request `$0.005000` ceiling, and the session’s six-request `$0.030000` ceiling.
4. Supply authoritative platform/storage evidence proving `$0.001456` per execution and `$0.083772` for eleven retained packages and bounded recovery.
5. Create one owner budget capped at exactly `21526788` micros, a one-operation Astra canary authority with the canary profile, a ten-operation dormant creator-session authority with the session profile, and a storage allowance for eleven packages. Raise the existing shared ceiling to exactly `32366821` micros. Both execution authorities have concurrency one, attempts one, and no renewal.
6. Bind dedicated server-only credentials `OPENAI_HEARTH_RESEARCH_OWNER_API_KEY` and `HEARTH_OWNER_RESEARCH_BRAVE_API_KEY`; neither may fall back to chat or generic credentials.
7. Run the unpaid isolated suite, then separately approve and run the one paid Astra canary. Only a reconciled canary as defined above may open the dormant creator session.

No step above is performed by this implementation slice.
