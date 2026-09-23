# Visual Unified Plan Canary Repair

Date: 2026-09-23
Branch: `mid_september_smoke`
Baseline: `67f60cadac390759aa233a0b89246428ce3e0b79`

This branch is a repair-only preparation. It does not authorize a new quote,
quote acceptance, provider request, migration deployment, Live activation, or
production release.

## Incident facts preserved

- quote: `ba854163-3bc1-4376-a784-999ce0a09208`
- reservation: `f1972784-1ec5-4465-a6ab-6807b69f836e`
- provider request: `req_aba0dd1ef7834b65b153c31e28bd4d1f`
- one provider attempt; 3,348 input units and 4,680 output units
- supplier expense: 6,286 micros
- customer charge: 0
- validation failure: `reference_visuals[3]:canonical_source_required`
- no canonical provider result and no unified receipt
- linked operation remains `pending` until the repair migration and explicit
  reconciliation RPC are reviewed and deployed

## Request drift diagnosis

Gate 1 called the viewer-authorized `read_workpiece_sources` RPC with a service
credential that had no user membership identity. The RPC correctly returned
`null`; the script incorrectly converted that unauthorized result into an empty
catalog. Runtime used the authenticated creator path and included four current
Source revisions.

The exact v4 divergence was confined to `input.source_catalog`:

| Measurement | Gate 1 (empty catalog) | Actual accepted request | Delta |
|---|---:|---:|---:|
| Source entries | 0 | 4 | +4 |
| Serialized bytes | 15,421 | 16,541 | +1,120 |
| Measured tokenizer units | 3,534 | 3,847 | +313 |
| SHA-256 | `c7b10f06cc1aca8f1d412b6d4cbf505c3342d7d59b1d6695bc9b6fd535944340` | `c4ecd988a20809081bee6860f583d9a63c96f48a78dd8d63197e57c718902bf7` | changed |

The four omitted entries were the linked gasoline Sources for EIA gasoline
price fluctuations, EIA price factors, USAFacts high gas prices, and UTPB's ten
price factors. No approved-script, creator-direction, generation-scope, model,
output-token, attempt, service-tier, or economic field drifted.

The repair uses one shared canonical source normalizer and one shared bounded
provider-request builder in Gate 1, quote preparation, reservation binding, and
transport. Source entries retain the canonical link-revision creation order. The existing
quote-to-reservation binding rejects any changed byte hash before transport.
The Gate 1 script also fails unless all four current gasoline Sources are read.

## Contract revision

Provider contract v5 narrows only Reference Material structured output:

- `reference_clips[*].source_relationship` is exactly `direct`;
- `reference_visuals[*].source_relationship` is exactly `direct`;
- both families require `source_keys` with `minItems: 1` and `maxItems: 1`;
- Image and B-roll provenance retains the broader v4 relationship/cardinality
  choices;
- the semantic validator remains unchanged and fail-closed.

The corrected read-only gasoline certification for v5 is:

| Field | Value |
|---|---:|
| Source entries | 4 |
| Serialized bytes | 16,503 |
| Measured tokenizer units | 3,841 |
| Protocol overhead | 16 |
| Conservative input bound | 16,503 |
| Maximum output tokens | 6,144 |
| Maximum attempts | 1 |
| SHA-256 | `3a7d49165f2b50a4929f77201378d6bef9b57ab67d0d7857cbb50a1b10d0fde6` |

The v5 schema is slightly smaller than the actual v4 request because it removes
the inapplicable Reference Material relationship alternatives. Economics and
risk limits are unchanged.

## Terminal failure and evidence diagnosis

Two independent defects caused the incomplete failure record:

1. `fail_unified_visual_plan` wrote failure fields but did not set a terminal
   state; the state constraint did not include `failed`.
2. validation evidence was called through the authenticated workspace client,
   while the recorder correctly requires service role. The authorization error
   was swallowed. The generic paid usage evidence and private provider capture
   survived, but the specialized validation-failure row was absent.

The linked evidence table is already forced-RLS, readable only by service role,
and guarded against update/delete. The retained private capture contains the
reservation, provider request ID, usage, and 42,147-byte raw response. The new
service call supplies and verifies route, operation, model, stable error code,
and provider contract revision before inserting the specialized immutable row.

Migration `20261011540000_visual_unified_plan_canary_repair.sql` adds terminal
`failed`, replay/conflict semantics, a private append-only reconciliation event,
v4/v5 validation-evidence compatibility, and the service-only
`reconcile_unified_visual_plan_validation_failure` RPC. That RPC reconstructs
the missing specialized evidence from the retained provider capture, appends
the reconciliation event first, then terminalizes the parent without creating
a canonical result or changing financial records.

After deployment, the reviewed historical reconciliation call is:

```sql
select tongs.reconcile_unified_visual_plan_validation_failure(
  'forge:unified-visual-plan:236341f5a19e2a2f9b7e03c6bd00fa049af4ec54650f0ff213ba6ee0e74164fc',
  '236341f5a19e2a2f9b7e03c6bd00fa049af4ec54650f0ff213ba6ee0e74164fc',
  'f1972784-1ec5-4465-a6ab-6807b69f836e',
  'visual_plan_contract_invalid',
  'Invalid fields: reference_visuals[3]:canonical_source_required',
  'forge.unified-visual-plan-provider.v4',
  6286
);
```

It must be executed with service role only after migration deployment. This
branch does not execute it against linked data.

## Verification boundary

The repair is verified with deterministic provider doubles, Tongs/Hearth/Nursery
typechecks and focused tests, complete guarded local migration replay, database
authority assertions, a linked migration dry-run, and the read-only gasoline
measurement. No OpenAI request or new customer financial action is part of the
repair verification.
