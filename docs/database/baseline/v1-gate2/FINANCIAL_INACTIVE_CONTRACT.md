# Financially inactive installation contract

## Required empty state

The baseline data phase must create no pricing publication, activation/rollout, operator, owner-test principal, financial-environment revision, model visibility/catalog activation, Stripe identifier, customer product availability, paid scope authorization, credit/deposit/allowance/grant, balance with spendable value, budget, quote, reservation, settlement, supplier obligation, provider attempt, credential, or reconciliation row.

The proposed Quench records are non-financial intent/manual-handoff metadata. They do not grant provider execution.

## Meaning of empty financial state

- **Missing configuration:** no approved policy/catalog/publication/rollout exists. Paid execution must return an unavailable/not-authorized result before provider submission. Missing configuration is never converted to zero price, unlimited credit, a default model, or Live fallback.
- **Authorized zero balance:** a signup-created compatibility/account balance may exist with zero spendable value. Its existence is not a grant, allowance, deposit, or reservation authority.
- **Explicit denial:** an authenticated caller without environment-specific activation, immutable price, funding, accepted quote, reservation, scope authorization, and exposure capacity cannot cross a paid provider boundary.

## Control evidence

The targeted source tests passed 32/32. They prove the checked-in contracts retain:

- authenticated, catalog-bound checkout that cannot grant funds by itself;
- signed webhook accounting before compatibility balance changes;
- pre-Stripe beta availability denial;
- one environment-parameterized Test/Live path with independent activation and risk state;
- reservation-derived financial environment and no Live/Test fallback;
- service-only paid execution context;
- draft/inactive restricted-beta installation and bounded exposure;
- Runway observe-only installation with no funded owner budget;
- required quote, cap, reservation, funding and settlement boundaries;
- exact Forge Credit denomination/pricing assertions without changed constants;
- operator-only, append-only risk decisions and emergency halt.

Command:

`node --test packages/tongs/tests/restricted-beta-financial-policy-migration.test.mjs packages/tongs/tests/paid-execution-funding-environment-contract.test.mjs packages/tongs/tests/openai-failure-loss-environment-isolation.test.mjs packages/tongs/tests/openai-failure-loss-operator-control.test.mjs packages/tongs/tests/runway-paid-execution-boundary-migration.test.mjs packages/tongs/tests/customer-funding-payment-contract.test.mjs packages/tongs/tests/standard-customer-financial-certification-migrations.test.mjs`

These are static source-contract tests, not an empty-baseline behavioral certification. Dynamic proof of every OpenAI/Runway/Stripe denial is blocked until the owner authorizes generation of an executable baseline. It must then run against a disposable zero-record database before Gate 3 can claim behavioral pass.
