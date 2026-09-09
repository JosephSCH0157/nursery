import { useCallback, useEffect, useMemo, useState } from "react";
import { tongsSupabase } from "../lib/supabase";
import { formatCurrencyMicros } from "../lib/owner-purchase-activity";

type JsonRecord = Record<string, unknown>;
type MarkupOverride = { scope_kind: "provider" | "sku"; provider: string; sku?: string; markup_basis_points: number };
type MarkupRule = { id: string; revision: number; default_markup_basis_points: number; overrides_json: MarkupOverride[]; change_reason: string; created_at: string };
type PricingRevision = {
  policy_id: string; policy_code: string; scope_kind: string; provider: string | null; sku: string | null;
  pricing_revision_id: string; revision: number; lifecycle_state: string; currency: string;
  markup_basis_points: number | null; full_cost_ceiling_micros: number; failure_cost_ceiling_micros: number;
  customer_price_ceiling_micros: number | null; billable_failure_ceiling_micros: number | null;
  customer_credit_units: number | null; publication_state: string; cost_components: JsonRecord[];
  expected_contribution_profit_micros: number | null; expected_contribution_margin_percentage: number | null; created_at: string;
};
type FinancialOperation = {
  reservation_id: string; operation_id: string; user_id: string; funding_source_type: string; currency: string;
  reserved_customer_charge_micros: number; reserved_wholesale_spend_micros: number; reservation_state: string;
  recognized_revenue_micros: number | null; allocated_processor_fee_micros: number | null;
  direct_provider_estimated_micros: number | null; direct_provider_actual_micros: number | null;
  supporting_actual_micros: number | null; expense_coverage: "confirmed" | "estimated_unresolved" | "unresolved";
  contribution_profit_micros: number | null; provider_task_id: string | null; model: string | null;
  duration_seconds: number | null; ratio: string | null; created_at: string;
};
type BillingConsole = {
  control: JsonRecord; runway_rollout: JsonRecord; markup_rule_revisions: MarkupRule[];
  pricing_revisions: PricingRevision[]; operations: FinancialOperation[]; funding_activity: {
    customer_deposits?: JsonRecord[]; subscription_receipts?: JsonRecord[]; deposit_consumptions?: JsonRecord[];
    allowance_consumptions?: JsonRecord[]; owner_expenses?: JsonRecord[];
  }; pricing_discrepancies: JsonRecord[];
  failure_financials: JsonRecord[];
  customer_test_authorizations: JsonRecord[];
  openai_text_test_certification: JsonRecord;
  openai_text: {
    routes: JsonRecord[]; activation_proposals: JsonRecord[]; failure_limit_events: JsonRecord[];
    reconciliation: JsonRecord; customer_spending_enabled: boolean; provider_execution_globally_enabled: boolean;
  };
};
type RpcClient = { rpc: (name: string, args: JsonRecord) => Promise<{ data: unknown; error: { message: string } | null }> };

const client = tongsSupabase as unknown as RpcClient;
const emptyOpenAiText = { routes: [], activation_proposals: [], failure_limit_events: [], reconciliation: {}, customer_spending_enabled: false, provider_execution_globally_enabled: false };
const emptyConsole: BillingConsole = { control: {}, runway_rollout: {}, markup_rule_revisions: [], pricing_revisions: [], operations: [], funding_activity: {}, pricing_discrepancies: [], failure_financials: [], customer_test_authorizations: [], openai_text_test_certification: {}, openai_text: emptyOpenAiText };

function money(value: number | null | undefined, currency = "USD") {
  return value == null ? "Unavailable" : formatCurrencyMicros(value, currency);
}
function pctFromBps(value: number | null | undefined) { return value == null ? "Not set" : `${(value / 100).toFixed(2)}%`; }
function integerInput(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function asConsole(value: unknown): BillingConsole {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyConsole;
  const row = value as Partial<BillingConsole>;
  return {
    control: row.control ?? {}, runway_rollout: row.runway_rollout ?? {},
    markup_rule_revisions: Array.isArray(row.markup_rule_revisions) ? row.markup_rule_revisions : [],
    pricing_revisions: Array.isArray(row.pricing_revisions) ? row.pricing_revisions : [],
    operations: Array.isArray(row.operations) ? row.operations : [],
    funding_activity: row.funding_activity ?? {},
    pricing_discrepancies: Array.isArray(row.pricing_discrepancies) ? row.pricing_discrepancies : [],
    failure_financials: Array.isArray(row.failure_financials) ? row.failure_financials : [],
    customer_test_authorizations: Array.isArray(row.customer_test_authorizations) ? row.customer_test_authorizations : [],
    openai_text_test_certification: row.openai_text_test_certification ?? {},
    openai_text: row.openai_text ?? emptyOpenAiText,
  };
}

function asOpenAiTextReadiness(value: unknown): BillingConsole["openai_text"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyOpenAiText;
  const row = value as Partial<BillingConsole["openai_text"]>;
  return {
    routes: Array.isArray(row.routes) ? row.routes : [],
    activation_proposals: Array.isArray(row.activation_proposals) ? row.activation_proposals : [],
    failure_limit_events: Array.isArray(row.failure_limit_events) ? row.failure_limit_events : [],
    reconciliation: row.reconciliation ?? {},
    customer_spending_enabled: row.customer_spending_enabled === true,
    provider_execution_globally_enabled: row.provider_execution_globally_enabled === true,
  };
}

export default function OwnerBillingConsole() {
  const [data, setData] = useState<BillingConsole>(emptyConsole);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [defaultMarkup, setDefaultMarkup] = useState("");
  const [overrides, setOverrides] = useState<Array<{ scope: "provider" | "sku"; provider: string; sku: string; percentage: string }>>([]);
  const [changeReason, setChangeReason] = useState("");
  const [sku, setSku] = useState("gen4.5:5s:1280:720");
  const [directCost, setDirectCost] = useState("");
  const [supportCost, setSupportCost] = useState("");
  const [paymentCost, setPaymentCost] = useState("");
  const [retentionCost, setRetentionCost] = useState("");
  const [failureCost, setFailureCost] = useState("");
  const [creditUnits, setCreditUnits] = useState("");
  const [pricingReason, setPricingReason] = useState("");
  const [preview, setPreview] = useState<JsonRecord | null>(null);
  const [publishApproval, setPublishApproval] = useState<string | null>(null);
  const [modelCatalog, setModelCatalog] = useState<JsonRecord>({});
  const [openAiReconciliation, setOpenAiReconciliation] = useState<JsonRecord>({});

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    const [result, failureResult, openAiResult, canaryResult, certificationResult, modelCatalogResult, reconciliationResult] = await Promise.all([
      client.rpc("read_owner_billing_console", { p_limit: 250 }),
      client.rpc("read_failure_financials", { p_limit: 250 }),
      client.rpc("read_openai_text_enforcement_readiness", { p_limit: 250 }),
      client.rpc("read_customer_paid_execution_test_authorizations", { p_limit: 50 }),
      client.rpc("read_openai_text_test_certification", {}),
      client.rpc("read_openai_text_model_catalog_admin", {}),
      client.rpc("read_openai_reconciliation_summary", {}),
    ]);
    if (result.error || failureResult.error || openAiResult.error || canaryResult.error || certificationResult.error || modelCatalogResult.error || reconciliationResult.error) setError(result.error?.message ?? failureResult.error?.message ?? openAiResult.error?.message ?? canaryResult.error?.message ?? certificationResult.error?.message ?? modelCatalogResult.error?.message ?? reconciliationResult.error?.message ?? "Unable to load owner billing data.");
    else {
      const nextData = { ...asConsole(result.data), failure_financials: Array.isArray(failureResult.data) ? failureResult.data as JsonRecord[] : [], openai_text: asOpenAiTextReadiness(openAiResult.data), customer_test_authorizations: Array.isArray(canaryResult.data) ? canaryResult.data as JsonRecord[] : [], openai_text_test_certification: certificationResult.data && typeof certificationResult.data === "object" && !Array.isArray(certificationResult.data) ? certificationResult.data as JsonRecord : {} };
      setData(nextData);
      setModelCatalog(modelCatalogResult.data && typeof modelCatalogResult.data === "object" && !Array.isArray(modelCatalogResult.data) ? modelCatalogResult.data as JsonRecord : {});
      setOpenAiReconciliation(reconciliationResult.data && typeof reconciliationResult.data === "object" && !Array.isArray(reconciliationResult.data) ? reconciliationResult.data as JsonRecord : {});
      setDefaultMarkup((current) => current || (nextData.markup_rule_revisions[0] ? String(nextData.markup_rule_revisions[0].default_markup_basis_points / 100) : ""));
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([client.rpc("read_owner_billing_console", { p_limit: 250 }), client.rpc("read_failure_financials", { p_limit: 250 }), client.rpc("read_openai_text_enforcement_readiness", { p_limit: 250 }), client.rpc("read_customer_paid_execution_test_authorizations", { p_limit: 50 }), client.rpc("read_openai_text_test_certification", {}), client.rpc("read_openai_text_model_catalog_admin", {}), client.rpc("read_openai_reconciliation_summary", {})]).then(([result, failureResult, openAiResult, canaryResult, certificationResult, modelCatalogResult, reconciliationResult]) => {
      if (cancelled) return;
      if (result.error || failureResult.error || openAiResult.error || canaryResult.error || certificationResult.error || modelCatalogResult.error || reconciliationResult.error) setError(result.error?.message ?? failureResult.error?.message ?? openAiResult.error?.message ?? canaryResult.error?.message ?? certificationResult.error?.message ?? modelCatalogResult.error?.message ?? reconciliationResult.error?.message ?? "Unable to load owner billing data.");
      else {
        const nextData = { ...asConsole(result.data), failure_financials: Array.isArray(failureResult.data) ? failureResult.data as JsonRecord[] : [], openai_text: asOpenAiTextReadiness(openAiResult.data), customer_test_authorizations: Array.isArray(canaryResult.data) ? canaryResult.data as JsonRecord[] : [], openai_text_test_certification: certificationResult.data && typeof certificationResult.data === "object" && !Array.isArray(certificationResult.data) ? certificationResult.data as JsonRecord : {} };
        setData(nextData);
        setModelCatalog(modelCatalogResult.data && typeof modelCatalogResult.data === "object" && !Array.isArray(modelCatalogResult.data) ? modelCatalogResult.data as JsonRecord : {});
        setOpenAiReconciliation(reconciliationResult.data && typeof reconciliationResult.data === "object" && !Array.isArray(reconciliationResult.data) ? reconciliationResult.data as JsonRecord : {});
        setDefaultMarkup((current) => current || (nextData.markup_rule_revisions[0] ? String(nextData.markup_rule_revisions[0].default_markup_basis_points / 100) : ""));
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const latestRules = data.markup_rule_revisions[0] ?? null;
  const certificationBatches = Array.isArray(data.openai_text_test_certification.batches) ? data.openai_text_test_certification.batches as JsonRecord[] : [];
  const certificationTerms = Array.isArray(data.openai_text_test_certification.terms) ? data.openai_text_test_certification.terms as JsonRecord[] : [];
  const certificationOperations = Array.isArray(data.openai_text_test_certification.operations) ? data.openai_text_test_certification.operations as JsonRecord[] : [];
  const certificationExpenses = Array.isArray(data.openai_text_test_certification.expenses) ? data.openai_text_test_certification.expenses as JsonRecord[] : [];
  const modelCatalogs = Array.isArray(modelCatalog.catalogs) ? modelCatalog.catalogs as JsonRecord[] : [];
  const modelEntries = Array.isArray(modelCatalog.entries) ? modelCatalog.entries as JsonRecord[] : [];
  const supportEvidence = Array.isArray(modelCatalog.supporting_cost_evidence) ? modelCatalog.supporting_cost_evidence as JsonRecord[] : [];
  const hasOpenAiAuthoritativeEvidence = Number(openAiReconciliation.batch_count ?? 0) > 0;
  const currentPricing = useMemo(() => data.pricing_revisions.find((row) => row.provider === "runway" && row.sku === sku.toLowerCase()) ?? null, [data.pricing_revisions, sku]);

  const saveMarkupRules = async () => {
    const percentage = Number(defaultMarkup);
    if (!Number.isFinite(percentage) || percentage < 0 || !changeReason.trim()) { setError("Enter a non-negative default markup percentage and a change reason."); return; }
    const normalized: MarkupOverride[] = [];
    for (const override of overrides) {
      const value = Number(override.percentage);
      if (!override.provider.trim() || !Number.isFinite(value) || value < 0 || (override.scope === "sku" && !override.sku.trim())) { setError("Complete every override with a provider, non-negative markup percentage, and SKU when required."); return; }
      normalized.push({ scope_kind: override.scope, provider: override.provider.trim(), ...(override.scope === "sku" ? { sku: override.sku.trim() } : {}), markup_basis_points: Math.round(value * 100) });
    }
    const result = await client.rpc("commit_private_markup_rule_revision", {
      p_revision_id: crypto.randomUUID(), p_expected_revision: latestRules?.revision ?? 0,
      p_default_markup_basis_points: Math.round(percentage * 100), p_overrides_json: normalized,
      p_change_reason: changeReason.trim(),
    });
    if (result.error) { setError(result.error.message); return; }
    setNotice("A private markup-on-cost rule revision was saved. No customer price was published or activated.");
    setChangeReason(""); await refresh();
  };

  const createPricingVersion = async () => {
    if (!latestRules) { setError("Save a private markup rule revision first."); return; }
    const direct = integerInput(directCost), support = integerInput(supportCost), payment = integerInput(paymentCost), retention = integerInput(retentionCost), failure = integerInput(failureCost), units = integerInput(creditUnits);
    if ([direct, support, payment, retention, failure, units].some((value) => value == null) || !pricingReason.trim()) { setError("Enter non-negative integer currency micros, credit units, and a change reason."); return; }
    const full = (direct ?? 0) + (support ?? 0) + (payment ?? 0) + (retention ?? 0);
    if ((failure ?? 0) > full) { setError("The failure-cost ceiling cannot exceed the full-cost ceiling."); return; }
    const existing = currentPricing;
    const policyId = existing?.policy_id ?? crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const components = [
      { component_code: "runway_generation", component_kind: "direct_provider", credential_funding: "forge", provider_label: "Runway", success_ceiling_micros: direct, failure_ceiling_micros: Math.min(failure ?? 0, direct ?? 0), cost_policy_revision: "owner-supplied", tail_policy: "none", tail_policy_details: {} },
      { component_code: "supporting_services", component_kind: "supporting_provider", credential_funding: "forge", provider_label: "Forge supporting services", success_ceiling_micros: support, failure_ceiling_micros: Math.max(0, (failure ?? 0) - Math.min(failure ?? 0, direct ?? 0)), cost_policy_revision: "owner-supplied", tail_policy: "none", tail_policy_details: {} },
      { component_code: "payment_processing", component_kind: "payment_processing", credential_funding: "forge", provider_label: "Payment processor", success_ceiling_micros: payment, failure_ceiling_micros: 0, cost_policy_revision: "owner-supplied", tail_policy: "none", tail_policy_details: {} },
      { component_code: "retention_tail", component_kind: "retention_tail", credential_funding: "forge", provider_label: "Media retention", success_ceiling_micros: retention, failure_ceiling_micros: 0, cost_policy_revision: "owner-supplied", tail_policy: "included_until", tail_policy_details: { included_until: "24 hours after delivery" } },
    ];
    const result = await client.rpc("commit_operator_pricing_revision", {
      p_markup_rule_revision_id: latestRules.id, p_policy_id: policyId,
      p_policy_code: `runway:${sku.toLowerCase()}`, p_scope_kind: "sku", p_provider: "runway", p_sku: sku.toLowerCase(),
      p_expected_revision: existing?.revision ?? 0, p_revision_id: revisionId, p_customer_credit_units: units,
      p_currency: "USD", p_cost_components: components,
      p_billable_failure_classes: [],
      p_free_failure_classes: ["forge_failure", "provider_failure", "provider_billed_failure", "unknown_fault", "prebilling_rejection", "forge_validation_failure", "persistence_failure"],
      p_included_quantity: { model: sku.split(":")[0], duration_seconds: Number(sku.match(/:(\d+)s:/)?.[1] ?? 0), ratio: sku.split(":").slice(-2).join(":") },
      p_retention_policy: { kind: "included_until", duration_hours: 24 }, p_change_reason: pricingReason.trim(),
    });
    if (result.error) { setError(result.error.message); return; }
    const previewResult = await client.rpc("preview_private_price", { p_pricing_revision_id: revisionId });
    if (previewResult.error) setError(previewResult.error.message); else setPreview((previewResult.data ?? null) as JsonRecord | null);
    setNotice("A review-ready private pricing version was created and previewed. It remains unpublished.");
    await refresh();
  };

  const previewRevision = async (revisionId: string) => {
    const result = await client.rpc("preview_private_price", { p_pricing_revision_id: revisionId });
    if (result.error) setError(result.error.message); else { setError(null); setPreview((result.data ?? null) as JsonRecord | null); }
  };
  const publishRevision = async (revision: PricingRevision) => {
    if (publishApproval !== revision.pricing_revision_id) { setError("Check the explicit approval box for this exact preview before publishing."); return; }
    const result = await client.rpc("publish_private_pricing_revision", { p_publication_id: crypto.randomUUID(), p_pricing_revision_id: revision.pricing_revision_id, p_reason: "Explicit operator approval from Forge pricing console" });
    if (result.error) setError(result.error.message); else { setNotice("Customer price published. Execution still follows the independent paid-execution activation controls."); setPublishApproval(null); await refresh(); }
  };

  return <section className="ledger-owner-console" aria-label="Owner billing console" data-testid="owner-billing-console">
    <div className="ledger-route__owner-head"><div><h3>Private pricing and financial control</h3><p className="ledger-card__hint">Platform-operator only. Markup is the percentage added to cost; profit margin is contribution profit divided by customer revenue. The configured markup is applied to the complete cost basis before customer-price rounding and is not the same as profit margin.</p></div><button type="button" onClick={() => void refresh()} disabled={loading}>Refresh</button></div>
    {error ? <div className="ledger-route__error" role="alert">{error}</div> : null}
    {notice ? <div className="ledger-route__notice" role="status">{notice}</div> : null}
    <div className="ledger-owner-console__status"><span>Pricing machinery: {data.control.pricing_activation_enabled === true ? "enabled" : "disabled"}</span><span>Customer settlement: {data.control.customer_settlement_enabled === true ? "enabled" : "disabled"}</span><span>Runway: {String(data.runway_rollout.mode ?? "unknown")}</span><span>OpenAI text: {data.openai_text.routes.every((route) => route.mode === "inactive") ? "inactive" : "mixed"}</span></div>

    <details open className="ledger-owner-console__section"><summary>1. Versioned markup-on-cost rules</summary>
      <p className="ledger-card__hint">These private rules are server records. Saving them does not publish prices. Customer prices preserve micro precision through cost-plus calculation, then round upward to the next USD cent.</p>
      <div className="ledger-owner-console__form"><label>Default markup percentage<input inputMode="decimal" value={defaultMarkup} onChange={(event) => setDefaultMarkup(event.target.value)} placeholder={latestRules ? String(latestRules.default_markup_basis_points / 100) : "No value configured"} /></label><label>Change reason<input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} /></label></div>
      {overrides.map((override, index) => <div className="ledger-owner-console__override" key={index}><select value={override.scope} onChange={(event) => setOverrides((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, scope: event.target.value as "provider" | "sku" } : row))}><option value="provider">Provider override</option><option value="sku">SKU override</option></select><input value={override.provider} onChange={(event) => setOverrides((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, provider: event.target.value } : row))} placeholder="Provider" />{override.scope === "sku" ? <input value={override.sku} onChange={(event) => setOverrides((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, sku: event.target.value } : row))} placeholder="SKU" /> : null}<input inputMode="decimal" value={override.percentage} onChange={(event) => setOverrides((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, percentage: event.target.value } : row))} placeholder="Markup %" /><button type="button" onClick={() => setOverrides((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></div>)}
      <div className="ledger-owner-console__actions"><button type="button" onClick={() => setOverrides((rows) => [...rows, { scope: "provider", provider: "", sku: "", percentage: "" }])}>Add provider override</button><button type="button" onClick={() => setOverrides((rows) => [...rows, { scope: "sku", provider: "", sku: "", percentage: "" }])}>Add SKU override</button><button type="button" onClick={() => void saveMarkupRules()}>Save private rule version</button></div>
      <p className="ledger-card__hint">Latest: {latestRules ? `revision ${latestRules.revision}, default markup ${pctFromBps(latestRules.default_markup_basis_points)}` : "No private markup revision exists."}</p>
    </details>

    <details className="ledger-owner-console__section"><summary>2. Create Runway SKU price version</summary>
      <p className="ledger-card__hint">Enter currency micros (1,000,000 = $1.00). No cost or markup is seeded by the app.</p>
      <div className="ledger-owner-console__form"><label>Runway SKU<input value={sku} onChange={(event) => setSku(event.target.value)} /></label><label>Direct-provider ceiling<input inputMode="numeric" value={directCost} onChange={(event) => setDirectCost(event.target.value)} /></label><label>Supporting-cost ceiling<input inputMode="numeric" value={supportCost} onChange={(event) => setSupportCost(event.target.value)} /></label><label>Payment-cost allocation<input inputMode="numeric" value={paymentCost} onChange={(event) => setPaymentCost(event.target.value)} /></label><label>24-hour retention allocation<input inputMode="numeric" value={retentionCost} onChange={(event) => setRetentionCost(event.target.value)} /></label><label>Forge failure exposure ceiling<input inputMode="numeric" value={failureCost} onChange={(event) => setFailureCost(event.target.value)} /></label><label>AI credit units<input inputMode="numeric" value={creditUnits} onChange={(event) => setCreditUnits(event.target.value)} /></label><label>Change reason<input value={pricingReason} onChange={(event) => setPricingReason(event.target.value)} /></label></div>
      <p className="ledger-card__hint">Forge-caused, provider-caused, validation, persistence, and unknown-fault failures charge the customer $0. Supplier charges remain Forge expenses. Uncertain submissions stay reserved for reconciliation and are never automatically resubmitted.</p>
      <button type="button" onClick={() => void createPricingVersion()}>Create version and preview</button>
    </details>

    {preview ? <section className="ledger-owner-console__preview" aria-label="Private price preview"><h4>Owner-only preview</h4><div className="ledger-owner-console__metrics"><span>Full cost ceiling<strong>{money(Number(preview.full_cost_ceiling_micros ?? 0), String(preview.currency ?? "USD"))}</strong></span><span>Customer maximum<strong>{money(Number(preview.customer_price_ceiling_micros ?? 0), String(preview.currency ?? "USD"))}</strong></span><span>Failure customer maximum<strong>$0.00</strong></span><span>Markup on cost<strong>{pctFromBps(Number(preview.markup_basis_points ?? 0))}</strong></span><span>Expected contribution profit<strong>{money(Number(preview.expected_margin_micros ?? 0), String(preview.currency ?? "USD"))}</strong></span><span>Expected contribution margin<strong>{preview.expected_margin_percentage == null ? "Unavailable" : `${Number(preview.expected_margin_percentage).toFixed(2)}%`}</strong></span></div><p className="ledger-card__hint">Contribution profit excludes baseline corporate overhead. Publishing does not bypass customer-spending activation.</p></section> : null}

    <section className="ledger-owner-console__section"><h4>Pricing versions</h4>{data.pricing_revisions.length === 0 ? <p className="ledger-route__empty">No pricing versions exist. Production customer prices are unpublished.</p> : <ul className="ledger-route__operation-list">{data.pricing_revisions.map((revision) => <li key={revision.pricing_revision_id} className="ledger-route__operation-row"><div><strong>{revision.provider ?? "Default"} · {revision.sku ?? revision.scope_kind}</strong><span>Revision {revision.revision} · {revision.publication_state}</span><small>{revision.created_at ? new Date(revision.created_at).toLocaleString() : "Time unavailable"}</small></div><div className="ledger-route__operation-evidence"><span>Cost {money(revision.full_cost_ceiling_micros, revision.currency)}</span><span>Customer maximum {money(revision.customer_price_ceiling_micros, revision.currency)}</span><span>Markup on cost {pctFromBps(revision.markup_basis_points)}</span><span>Expected profit {money(revision.expected_contribution_profit_micros, revision.currency)} · margin {revision.expected_contribution_margin_percentage == null ? "unavailable" : `${revision.expected_contribution_margin_percentage}%`}</span><button type="button" onClick={() => void previewRevision(revision.pricing_revision_id)}>Preview</button>{revision.publication_state !== "published" ? <><label className="ledger-owner-console__approval"><input type="checkbox" checked={publishApproval === revision.pricing_revision_id} onChange={(event) => setPublishApproval(event.target.checked ? revision.pricing_revision_id : null)} />I approve this exact customer price</label><button type="button" onClick={() => void publishRevision(revision)}>Publish version</button></> : null}</div></li>)}</ul>}</section>

    <section className="ledger-owner-console__section"><h4>Reservations and contribution reporting</h4><p className="ledger-card__hint">Missing or estimated expenses never appear as zero-cost confirmed profit.</p>{data.operations.length === 0 ? <p className="ledger-route__empty">No shared-gate operations recorded.</p> : <ul className="ledger-route__operation-list">{data.operations.map((operation) => <li key={operation.reservation_id} className="ledger-route__operation-row"><div><strong>{operation.model ? `Runway ${operation.model}` : operation.operation_id}</strong><span>{operation.funding_source_type.replaceAll("_", " ")} · {operation.reservation_state.replaceAll("_", " ")}</span><small>{operation.provider_task_id ? `Provider task ${operation.provider_task_id}` : "No provider task recorded"}</small></div><div className="ledger-route__operation-evidence"><span>Customer charge / revenue: {money(operation.recognized_revenue_micros, operation.currency)}</span><span>Reserved cost ceiling: {money(operation.reserved_wholesale_spend_micros, operation.currency)}</span><span>Provider cost: {operation.direct_provider_actual_micros == null ? operation.direct_provider_estimated_micros == null ? "Unresolved" : `${money(operation.direct_provider_estimated_micros, operation.currency)} estimated` : `${money(operation.direct_provider_actual_micros, operation.currency)} confirmed`}</span><span>Supporting cost: {operation.supporting_actual_micros == null ? "Unresolved" : `${money(operation.supporting_actual_micros, operation.currency)} confirmed`}</span><strong>Contribution profit: {operation.contribution_profit_micros == null ? `Unavailable (${operation.expense_coverage.replaceAll("_", " ")})` : money(operation.contribution_profit_micros, operation.currency)}</strong></div></li>)}</ul>}</section>

    <section className="ledger-owner-console__section"><h4>Failure relief and supplier exposure</h4><p className="ledger-card__hint">Customer relief is independent of supplier reimbursement. A missing or estimated supplier charge keeps contribution profit explicitly incomplete.</p>{data.failure_financials.length === 0 ? <p className="ledger-route__empty">No relieved or supplier-failure operations recorded.</p> : <ul className="ledger-route__operation-list">{data.failure_financials.map((row) => <li key={String(row.reservation_id)} className="ledger-route__operation-row"><div><strong>{String(row.operation_id)}</strong><span>{String(row.cost_coverage ?? "missing")} cost coverage · {String(row.obligation_status ?? "no supplier obligation recorded")}</span></div><div className="ledger-route__operation-evidence"><span>Gross customer charge: {money(Number(row.gross_customer_charge_micros ?? 0), String(row.currency ?? "USD"))}</span><span>Customer relief / revenue reversal: {money(Number(row.revenue_reversal_micros ?? 0), String(row.currency ?? "USD"))}</span><span>Net recognized revenue: {money(Number(row.recognized_revenue_micros ?? 0), String(row.currency ?? "USD"))}</span><span>Supplier expense: {row.supplier_expense_micros == null ? "Unresolved" : `${money(Number(row.supplier_expense_micros), String(row.currency ?? "USD"))} ${String(row.supplier_expense_status)}`}</span><span>Confirmed recovery: {money(Number(row.confirmed_supplier_recovery_micros ?? 0), String(row.currency ?? "USD"))}</span><strong>Contribution profit: {row.contribution_profit_micros == null ? "Unavailable (incomplete cost evidence)" : money(Number(row.contribution_profit_micros), String(row.currency ?? "USD"))}</strong></div></li>)}</ul>}</section>

    <section className="ledger-owner-console__section"><h4>Customer paid-test authorizations</h4><p className="ledger-card__hint">These are narrow canary scopes, not general customer rollout. Closing a scope blocks new reservations while keeping terminal receipts and unresolved reconciliation available.</p>{data.customer_test_authorizations.length === 0 ? <p className="ledger-route__empty">No customer paid-test authorization has been created.</p> : <ul className="ledger-route__operation-list">{data.customer_test_authorizations.map((row) => <li key={String(row.id)} className="ledger-route__operation-row"><div><strong>{String(row.route_code)} · {String(row.model)}</strong><span>{String(row.status)} · one operation · {money(Number(row.maximum_customer_charge_micros ?? 0))} aggregate ceiling</span><small>Expires {row.authorization_expires_at ? new Date(String(row.authorization_expires_at)).toLocaleString() : "unknown"}</small></div><div className="ledger-route__operation-evidence"><span>Workspace {String(row.workspace_id)}</span><span>Reservation {row.reservation_id ? String(row.reservation_id) : "Not created"}</span><span>State {row.reservation_state ? String(row.reservation_state).replaceAll("_", " ") : "No reservation"}</span></div></li>)}</ul>}</section>

    <section className="ledger-owner-console__section"><h4>Seven-route OpenAI Test certification</h4><p className="ledger-card__hint">Synthetic Test-only execution. It cannot authorize a Live provider, expense, or revenue event. Wholesale ceilings and the private 33% markup remain visible only here.</p>{certificationBatches.length === 0 ? <p className="ledger-route__empty">No seven-route certification batch has been recorded.</p> : <><ul className="ledger-route__operation-list">{certificationBatches.map((batch) => <li key={String(batch.id)} className="ledger-route__operation-row"><div><strong>Batch {String(batch.id)}</strong><span>{String(batch.status)} · {Number(batch.maximum_operation_count)} operations · {money(Number(batch.maximum_aggregate_charge_micros))} maximum Test debit</span><small>Workspace {String(batch.workspace_id)} · expires {new Date(String(batch.expires_at)).toLocaleString()}</small></div><div className="ledger-route__operation-evidence"><span>Live provider authorized: no</span><span>Recorded operations: {certificationOperations.filter((row) => row.batch_id === batch.id).length}</span><span>Synthetic expense records: {certificationExpenses.length}</span></div></li>)}</ul><ul className="ledger-route__operation-list">{certificationTerms.map((term) => <li key={String(term.id)} className="ledger-route__operation-row"><div><strong>{String(term.route_code)} · {String(term.model)}</strong><span>Test pricing revision {Number(term.revision)} · {String(term.rate_evidence_status).replaceAll("_", " ")}</span></div><div className="ledger-route__operation-evidence"><span>Direct / support ceilings: {money(Number(term.direct_provider_ceiling_micros))} / {money(Number(term.supporting_cost_ceiling_micros))}</span><span>Input / output bounds: {Number(term.maximum_input_units).toLocaleString()} / {Number(term.maximum_output_units).toLocaleString()}</span><span>Markup on cost: {pctFromBps(Number(term.markup_basis_points))}</span><span>Customer Test ceiling: {money(Number(term.customer_price_ceiling_micros))}</span></div></li>)}</ul><ul className="ledger-route__operation-list">{certificationOperations.map((row) => <li key={String(row.operation_id)} className="ledger-route__operation-row"><div><strong>{String(row.route_code)} · {String(row.scenario).replaceAll("_", " ")}</strong><span>{String(row.reservation_state ?? "not reserved").replaceAll("_", " ")}</span><small>Operation {String(row.operation_id)}</small></div><div className="ledger-route__operation-evidence"><span>Customer Test charge: {money(Number(row.customer_charge_micros ?? 0))}</span><span>Provider executions: {Number(row.provider_execution_count ?? 0)}</span><span>Result {row.result_id ? String(row.result_id) : "none"}</span><span>Settlement {row.settlement_id ? String(row.settlement_id) : "pending"}</span></div></li>)}</ul></>}</section>

    <section className="ledger-owner-console__section"><h4>OpenAI text enforcement readiness</h4><p className="ledger-card__hint">Private exact-rate and loss-control data. A route with an unpriced supporting cost remains activation-blocked. Organization Costs evidence is authoritative only in aggregate until it is matched to an operation.</p>{data.openai_text.activation_proposals.map((proposal) => <div key={String(proposal.id)} className="ledger-owner-console__preview"><h4>Bounded activation proposal · {String(proposal.status).replaceAll("_", " ")}</h4><div className="ledger-owner-console__metrics"><span>Model<strong>{String(proposal.model)}</strong></span><span>Input / output maximum<strong>{Number(proposal.maximum_input_units).toLocaleString()} / {Number(proposal.maximum_output_units).toLocaleString()}</strong></span><span>Direct-provider ceiling<strong>{money(Number(proposal.direct_provider_ceiling_micros))}</strong></span><span>Supporting ceiling<strong>{money(Number(proposal.supporting_cost_ceiling_micros))}</strong></span><span>Total cost ceiling<strong>{money(Number(proposal.total_cost_ceiling_micros))}</strong></span><span>Configured-markup customer preview<strong>{money(Number(proposal.rounded_customer_price_micros))}</strong></span><span>Proposed owner test cap<strong>{money(Number(proposal.proposed_owner_budget_micros))}</strong></span><span>Attempts / concurrency<strong>{Number(proposal.maximum_attempts)} / 1</strong></span></div><p className="ledger-card__hint">This is a proposal only. It creates no budget, publishes no price, and cannot authorize a provider call.</p></div>)}<ul className="ledger-route__operation-list">{data.openai_text.routes.map((route) => <li key={String(route.route_code)} className="ledger-route__operation-row"><div><strong>{String(route.route_code)}</strong><span>{String(route.mode)} · {String(route.cost_coverage ?? "no active cost revision")}</span></div><div className="ledger-route__operation-evidence"><span>Direct-provider ceiling: {route.direct_provider_ceiling_micros == null ? "Not selected" : money(Number(route.direct_provider_ceiling_micros))}</span><span>Supporting ceiling: {route.supporting_cost_ceiling_micros == null ? "Unpriced — activation blocked" : money(Number(route.supporting_cost_ceiling_micros))}</span></div></li>)}</ul><p className="ledger-card__hint">Reconciliation batches: {Number(data.openai_text.reconciliation.batch_count ?? 0)} · unallocated: {Number(data.openai_text.reconciliation.unallocated_batches ?? 0)}</p></section>

    <section className="ledger-owner-console__section"><h4>OpenAI model catalog</h4><p className="ledger-card__hint">Operator-only availability, rate, compatibility, and supporting-cost evidence. Draft entries never become customer-executable choices.</p><p className="ledger-card__hint">Catalog revision {String(modelCatalogs[0]?.revision ?? "unavailable")} · {String(modelCatalogs[0]?.lifecycle_state ?? "unavailable")} · unresolved supporting components {supportEvidence.filter((row) => row.evidence_class === "unresolved").length}</p><ul className="ledger-route__operation-list">{modelEntries.map((entry) => <li key={String(entry.id)} className="ledger-route__operation-row"><div><strong>{String(entry.display_name)}</strong><span>{String(entry.provider_model_id)} · {String(entry.lifecycle_state)}</span><small>{String(entry.tradeoff_summary)}</small></div><div className="ledger-route__operation-evidence"><span>Quality rank {String(entry.quality_rank)}</span><span>Forge availability: {String(entry.availability_status).replaceAll("_", " ")}</span><span>Rate revision {String(entry.rate_revision_id)}</span></div></li>)}</ul><div className="ledger-owner-console__metrics"><span>Organization source total<strong>{money(hasOpenAiAuthoritativeEvidence ? Number(openAiReconciliation.source_total_micros) : null)}</strong></span><span>Matched to operations<strong>{money(hasOpenAiAuthoritativeEvidence ? Number(openAiReconciliation.matched_micros) : null)}</strong></span><span>Estimate replacement delta<strong>{money(hasOpenAiAuthoritativeEvidence ? Number(openAiReconciliation.estimate_replacement_adjustment_micros) : null)}</strong></span><span>Unresolved source amount<strong>{money(hasOpenAiAuthoritativeEvidence ? Number(openAiReconciliation.unresolved_source_micros) : null)}</strong></span></div><p className="ledger-card__hint">{hasOpenAiAuthoritativeEvidence ? String(openAiReconciliation.source_granularity) : "No authoritative Costs batch ingested; expense and profit remain unconfirmed."}</p></section>

    <section className="ledger-owner-console__section"><h4>Funding and revenue categories</h4><div className="ledger-owner-console__metrics"><span>Customer deposits<strong>{data.funding_activity.customer_deposits?.length ?? 0}</strong><small>Prepaid liability, not revenue</small></span><span>Subscription receipts<strong>{data.funding_activity.subscription_receipts?.length ?? 0}</strong><small>Separate from AI consumption</small></span><span>AI consumption revenue<strong>{(data.funding_activity.deposit_consumptions?.length ?? 0) + (data.funding_activity.allowance_consumptions?.length ?? 0)}</strong><small>Recognized once on settlement</small></span><span>Owner-funded expenses<strong>{data.funding_activity.owner_expenses?.length ?? 0}</strong><small>Zero customer revenue</small></span></div></section>
  </section>;
}
