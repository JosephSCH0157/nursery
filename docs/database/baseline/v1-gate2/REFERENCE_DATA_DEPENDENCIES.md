# Reference-data dependency verification

## Final classification

`data-bearing-table-classification.csv` contains all 509 production tables and links every table to the structural fingerprint and its migration data references.

| Class | Tables | Baseline rule |
|---|---:|---|
| Deterministic application reference data | 2 | Seven exact Quench records are proposed; not approved or executable. |
| Immutable economic contract data | 21 | Excluded. Historical source remains audit evidence; rows require separate financial approval. |
| Environment-specific activation or operator configuration | 43 | Excluded. Must be established by approved operator procedures after installation. |
| Customer, financial transaction, or operational data | 443 | Excluded. Never copied into a baseline. |
| Unknown | 0 | All 19 Gate 1 unknowns were resolved conservatively. |

The default remains exclusion. `proposed-reference-data.allowlist.json` is a proposal, not authorization.

## Resolution of the 19 Gate 1 unknowns

| Final class | Tables | Reason |
|---|---|---|
| Immutable economic contract | `ai_image_output_token_schedules`, `openai_text_failure_loss_policy_revisions`, `openai_text_supporting_cost_inventory`, `openai_transcription_supporting_cost_inventory`, `restricted_beta_allocation_policy_revisions`, `restricted_beta_policy_capabilities`, `restricted_beta_tail_policy_revisions` | Pricing/risk/cost ceilings or evidence definitions; absence denies paid execution and does not block signup/storage. |
| Environment/operator configuration | `ai_model_identity_revisions`, `openai_text_model_catalog_entries`, `openai_text_model_catalog_revisions`, `openai_text_test_certification_terms`, `owner_hearth_model_terms`, `owner_hearth_research_model_terms`, `paid_capability_inventory_revisions`, `restricted_beta_policy_revisions` | Provider/model observations, certification/owner terms, inventories, or active/draft policy selection depend on an environment or accountable actor. |
| Customer/operational | `member_ai_policy`, `organization_ai_policy`, `publishing_destination_capability_revisions` | Organization/member choices or observed capabilities of an executable destination. |
| Deterministic application reference | `quench_destination_capability_revisions` | Four source-controlled immutable system capability revisions are proposed together with their three parent system scopes. |

## The 18 original economic candidates

`ai_pricing_policy_sequences` is reclassified as environment/operator selection. `paid_media_pricing_overages` and `pricing_discrepancies` are transaction/operational evidence. `private_pricing_publications` is environment-specific activation. The remaining original economic tables stay immutable-economic and excluded: `ai_pricing_policies`, `ai_pricing_policy_revisions`, `ai_pricing_rate_components`, `customer_subscription_allowance_terms`, `forge_credit_contract_revisions`, `forge_credit_pack_terms`, `openai_text_cost_policy_revisions`, `openai_text_provider_rate_revisions`, `openai_text_rate_condition_revisions`, `private_markup_rule_revisions`, `private_pricing_cost_components`, `private_pricing_policies`, `private_pricing_revision_markup_sources`, and `private_pricing_revisions`.

No current economic row is required for authentication, profile creation, personal-organization creation, workspace creation, membership creation, Anvil profile persistence, or non-paid content storage. Missing economic/configuration rows intentionally prevent paid execution. Model catalogs and subscription/entitlement terms must be installed only by later approved, environment-aware activation procedures.

## Proposed seven-record allowlist

Three global Quench system scopes and four immutable capability revisions have deterministic migration origins. They carry no customer, operator, credential, Stripe, or financial data. They enable release intent/manual handoff but do not perform provider API execution or spending. Their exact keys, fields, JSON contracts, dependencies, security implications, and source lines are recorded in `proposed-reference-data.allowlist.json`.

Owner approval is still required. If rejected, the baseline can remain zero-record but Quench system destinations will be unavailable until a separately approved deterministic initializer installs them. No other row is proposed.

## First-action dependency findings

- Auth/profile/workspace bootstrap is recordless: `handle_new_user()` and `tongs.create_workspace_admin()` derive the actor from the new auth user and create the personal organization, workspace, owner membership, profile, and zero-valued compatibility balance as needed.
- Empty plan, catalog, subscription, and entitlement tables mean “not subscribed/not activated”; they do not authorize a plan.
- Empty model/pricing/rollout/authorization tables mean configuration is missing and provider submission must be denied; they are not interpreted as a free or zero-price product.
- User and organization AI policies are created by legitimate user/admin actions and are customer data, not reference data.
- Provider destination observations are operational; only the seven source-controlled system intent/manual-handoff records are proposed.
