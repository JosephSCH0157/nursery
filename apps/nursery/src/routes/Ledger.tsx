import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase, tongsSupabase } from "../lib/supabase";
import { loadThumbnailLedgerIntelligence } from "../lib/thumbnail-ledger";
import {
  formatCurrencyMicros,
  formatCurrencyMinor,
  ownerPurchaseAccountingLabel,
  type OwnerPurchaseActivity,
  type OwnerPurchaseActivityResponse,
  type OwnerPurchaseMode,
} from "../lib/owner-purchase-activity";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import OwnerBillingConsole from "../components/OwnerBillingConsole";
import "./Ledger.css";

type LedgerTimeRange = "today" | "7d" | "30d" | "90d";

type BillingOperation = {
  operation_id: string;
  occurred_at: string;
  state: string;
  tool: string;
  media_kind: string;
  provider: string;
  payment_source: "forge_funded" | "provider_byo" | "unknown";
  maximum_customer_charge_credits: number;
  settled_customer_charge_credits: number | null;
  workpiece_id: string | null;
};

type BillingLedgerResponse = {
  contract_version: "forge.workspace-billing-ledger.v1";
  current_user_credit_balance: number;
  operations: BillingOperation[];
  coverage: {
    paid_media?: string;
    legacy_ai_activity?: string;
  };
};

type EpisodeRow = {
  id: string;
  title: string | null;
};

type BillingLedgerRpcClient = {
  rpc: (name: "read_workspace_billing_ledger", args: {
    p_workspace_id: string;
    p_from: string;
    p_to: string;
  }) => Promise<{
    data: BillingLedgerResponse | null;
    error: { message: string } | null;
  }>;
};

type OwnerPurchaseRpcClient = {
  rpc: (
    name: "is_platform_operator" | "read_owner_purchase_activity",
    args: Record<string, unknown>,
  ) => Promise<{ data: boolean | OwnerPurchaseActivityResponse | null; error: { message: string } | null }>;
};

const RANGE_OPTIONS: ReadonlyArray<{ value: LedgerTimeRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

const ACTIVE_HOLD_STATES = new Set([
  "reserved",
  "submitting",
  "submission_unknown",
  "provider_completed",
  "delivery_failed",
  "delivered",
]);

function rangeBounds(range: LedgerTimeRange, now = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  if (range === "today") {
    return {
      from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      to,
    };
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to };
}

function formatCredits(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return `${safe.toLocaleString("en-US")} credits`;
}

function providerLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai") return "OpenAI";
  if (normalized === "runway") return "Runway";
  if (normalized === "huggingface") return "Hugging Face";
  return value.trim() || "Unknown provider";
}

function paymentSourceLabel(value: BillingOperation["payment_source"]): string {
  if (value === "provider_byo") return "Customer provider account";
  if (value === "forge_funded") return "Forge billing";
  return "Payment source pending";
}

function operationChargeLabel(operation: BillingOperation): string {
  if (operation.settled_customer_charge_credits != null) {
    return formatCredits(operation.settled_customer_charge_credits);
  }
  if (operation.payment_source === "provider_byo") return "BYO provider";
  return `Up to ${formatCredits(operation.maximum_customer_charge_credits)}`;
}

function purchaseLabel(purchase: OwnerPurchaseActivity): string {
  const item = purchase.item_id.replaceAll("_", " ");
  const kind = purchase.purchase_type === "cloud_storage" ? "Cloud storage" : "Subscription";
  return `${kind} · ${item} · ${purchase.interval}`;
}

export default function LedgerRoute() {
  const shell = useOutletContext<AppShellContext>();
  const workspaceId = shell.workspaceId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<BillingOperation[]>([]);
  const [creditBalance, setCreditBalance] = useState(0);
  const [legacyCoverage, setLegacyCoverage] = useState<string | null>(null);
  const [episodeTitles, setEpisodeTitles] = useState<Record<string, string>>({});
  const [timeRange, setTimeRange] = useState<LedgerTimeRange>("today");
  const [thumbnailIntelligence, setThumbnailIntelligence] = useState<Awaited<ReturnType<typeof loadThumbnailLedgerIntelligence>> | null>(null);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [ownerMode, setOwnerMode] = useState<OwnerPurchaseMode>("test");
  const [ownerAccess, setOwnerAccess] = useState<"checking" | "operator" | "not_operator">("checking");
  const [ownerPurchases, setOwnerPurchases] = useState<OwnerPurchaseActivity[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadOwnerPurchases = async () => {
      setOwnerLoading(true);
      setOwnerError(null);
      const { data: authData } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!authData.user) {
        setOwnerAccess("not_operator");
        setOwnerLoading(false);
        return;
      }
      const ownerClient = tongsSupabase as unknown as OwnerPurchaseRpcClient;
      const operatorResult = await ownerClient.rpc("is_platform_operator", { p_user_id: authData.user.id });
      if (cancelled) return;
      if (operatorResult.error || operatorResult.data !== true) {
        setOwnerAccess("not_operator");
        setOwnerPurchases([]);
        setOwnerLoading(false);
        return;
      }
      setOwnerAccess("operator");
      const result = await ownerClient.rpc("read_owner_purchase_activity", {
        p_stripe_mode: ownerMode,
        p_limit: 100,
      });
      if (cancelled) return;
      if (result.error) {
        setOwnerError(result.error.message || "Owner purchase activity is unavailable.");
        setOwnerPurchases([]);
      } else {
        const response = result.data as OwnerPurchaseActivityResponse | null;
        setOwnerPurchases(Array.isArray(response?.purchases) ? response.purchases : []);
      }
      setOwnerLoading(false);
    };
    void loadOwnerPurchases();
    return () => { cancelled = true; };
  }, [ownerMode]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      void loadThumbnailLedgerIntelligence(workspaceId)
        .then((value) => {
          if (!cancelled) {
            setThumbnailIntelligence(value);
            setThumbnailError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) setThumbnailError(reason instanceof Error ? reason.message : "Thumbnail intelligence is unavailable.");
        });

      const bounds = rangeBounds(timeRange);
      const ledgerClient = tongsSupabase as unknown as BillingLedgerRpcClient;
      const { data, error: queryError } = await ledgerClient.rpc("read_workspace_billing_ledger", {
        p_workspace_id: workspaceId,
        p_from: bounds.from.toISOString(),
        p_to: bounds.to.toISOString(),
      });

      if (cancelled) return;
      if (queryError) {
        setError(queryError.message || "Failed to load workspace billing activity.");
        setOperations([]);
        setCreditBalance(0);
        setLegacyCoverage(null);
        setLoading(false);
        return;
      }

      const rows = Array.isArray(data?.operations) ? data.operations : [];
      setOperations(rows);
      setCreditBalance(Number(data?.current_user_credit_balance ?? 0));
      setLegacyCoverage(data?.coverage?.legacy_ai_activity ?? null);

      const workpieceIds = [...new Set(rows.map((row) => row.workpiece_id?.trim() ?? "").filter(Boolean))].slice(0, 100);
      if (workpieceIds.length === 0) {
        setEpisodeTitles({});
        setLoading(false);
        return;
      }

      const { data: episodeData, error: episodeError } = await tongsSupabase
        .from("episodes")
        .select("id, title")
        .in("id", workpieceIds)
        .returns<EpisodeRow[]>();

      if (cancelled) return;
      if (episodeError) {
        setEpisodeTitles({});
      } else {
        const titles: Record<string, string> = {};
        for (const row of episodeData ?? []) {
          titles[row.id] = row.title?.trim() || `Episode ${row.id.slice(0, 8)}`;
        }
        setEpisodeTitles(titles);
      }
      setLoading(false);
    };

    void load();
    return () => { cancelled = true; };
  }, [timeRange, workspaceId]);

  const settledCredits = useMemo(() => operations.reduce(
    (sum, operation) => sum + Math.max(0, Number(operation.settled_customer_charge_credits ?? 0)),
    0,
  ), [operations]);
  const activeMaximum = useMemo(() => operations.reduce(
    (sum, operation) => sum + (ACTIVE_HOLD_STATES.has(operation.state)
      ? Math.max(0, Number(operation.maximum_customer_charge_credits ?? 0))
      : 0),
    0,
  ), [operations]);
  const byTool = useMemo(() => {
    const totals = new Map<string, number>();
    for (const operation of operations) {
      const charge = Math.max(0, Number(operation.settled_customer_charge_credits ?? 0));
      totals.set(operation.tool, (totals.get(operation.tool) ?? 0) + charge);
    }
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  }, [operations]);
  const topEpisodes = useMemo(() => {
    const totals = new Map<string, number>();
    for (const operation of operations) {
      if (!operation.workpiece_id) continue;
      const charge = Math.max(0, Number(operation.settled_customer_charge_credits ?? 0));
      totals.set(operation.workpiece_id, (totals.get(operation.workpiece_id) ?? 0) + charge);
    }
    return [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
  }, [operations]);

  if (!workspaceId) return <WorkspaceRequiredNotice toolName="Ledger" />;

  return (
    <section className="ledger-route">
      <header className="ledger-route__header">
        <div>
          <h2 className="ledger-route__title">Ledger</h2>
          <p className="ledger-route__subtitle">Customer charges and payment status for this workspace.</p>
        </div>
        <div className="ledger-route__filters" role="group" aria-label="Ledger time range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={timeRange === option.value ? "ledger-route__filter-btn ledger-route__filter-btn--active" : "ledger-route__filter-btn"}
              onClick={() => setTimeRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {error ? <div className="ledger-route__error">{error}</div> : null}

      <div className="ledger-route__grid">
        <article className="ledger-card">
          <h3 className="ledger-card__label">Settled charges</h3>
          <p className="ledger-card__value">{formatCredits(settledCredits)}</p>
          <p className="ledger-card__hint">{timeRange === "today" ? "today" : `selected range: ${timeRange}`}</p>
        </article>
        <article className="ledger-card">
          <h3 className="ledger-card__label">Pending maximum</h3>
          <p className="ledger-card__value">{formatCredits(activeMaximum)}</p>
          <p className="ledger-card__hint">Active reservations may settle for less.</p>
        </article>
        <article className="ledger-card">
          <h3 className="ledger-card__label">Your AI credit balance</h3>
          <p className="ledger-card__value">{formatCredits(creditBalance)}</p>
          <p className="ledger-card__hint">Personal balance; workspace charges are listed below.</p>
        </article>
      </div>

      <section className="ledger-route__episodes" aria-label="Customer charge summary">
        <div className="ledger-route__episodes-head">
          <h3>Charges by Forge area</h3>
          <span>{loading ? "Loading..." : `${operations.length} operations`}</span>
        </div>
        {byTool.length === 0 ? <p className="ledger-route__empty">No paid-media charges in this range.</p> : (
          <ul className="ledger-route__episode-list">
            {byTool.map(([tool, credits]) => (
              <li key={tool} className="ledger-route__episode-row"><span>{tool}</span><strong>{formatCredits(credits)}</strong></li>
            ))}
          </ul>
        )}
        {legacyCoverage === "unavailable_until_workspace_scoped_accounting" ? (
          <p className="ledger-card__hint">Legacy AI activity is omitted until its customer charges can be attributed safely to a workspace.</p>
        ) : null}
      </section>

      <section className="ledger-route__episodes" aria-label="Customer billing operations">
        <div className="ledger-route__episodes-head"><h3>Billing operations</h3><span>Newest {Math.min(operations.length, 20)}</span></div>
        {operations.length === 0 ? <p className="ledger-route__empty">No customer billing operations in this range.</p> : (
          <ul className="ledger-route__operation-list">
            {operations.slice(0, 20).map((operation) => (
              <li key={operation.operation_id} className="ledger-route__operation-row">
                <div>
                  <strong>{providerLabel(operation.provider)}</strong>
                  <span>{operation.tool} · {operation.media_kind}</span>
                  <small>{new Date(operation.occurred_at).toLocaleString()}</small>
                </div>
                <div className="ledger-route__operation-evidence">
                  <strong>{operationChargeLabel(operation)}</strong>
                  <span>{paymentSourceLabel(operation.payment_source)}</span>
                  <span>Status: {operation.state}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ledger-route__episodes">
        <div className="ledger-route__episodes-head"><h3>Top Episodes</h3><span>By settled customer charge</span></div>
        {topEpisodes.length === 0 ? <p className="ledger-route__empty">No settled episode charges in this range.</p> : (
          <ul className="ledger-route__episode-list">
            {topEpisodes.map(([workpieceId, credits]) => (
              <li key={workpieceId} className="ledger-route__episode-row">
                <span>{episodeTitles[workpieceId] ?? `Episode ${workpieceId.slice(0, 8)}`}</span>
                <strong>{formatCredits(credits)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ownerAccess === "operator" ? (
        <>
        <section className="ledger-route__episodes" aria-label="Owner purchase activity">
          <div className="ledger-route__owner-head">
            <div>
              <h3>Owner purchase activity</h3>
              <p className="ledger-card__hint">Cross-customer Stripe receipts. Test activity never funds live execution or counts as revenue.</p>
            </div>
            <div className="ledger-route__filters" role="group" aria-label="Purchase environment">
              {(["test", "live"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={ownerMode === mode ? "ledger-route__filter-btn ledger-route__filter-btn--active" : "ledger-route__filter-btn"}
                  onClick={() => setOwnerMode(mode)}
                >
                  {mode === "test" ? "Test" : "Live"}
                </button>
              ))}
            </div>
          </div>
          {ownerError ? <div className="ledger-route__error">{ownerError}</div> : null}
          {ownerLoading ? <p className="ledger-route__empty">Loading owner purchases...</p> : ownerPurchases.length === 0 ? (
            <p className="ledger-route__empty">No {ownerMode} purchases recorded.</p>
          ) : (
            <ul className="ledger-route__operation-list">
              {ownerPurchases.map((purchase) => (
                <li key={`${purchase.stripe_mode}:${purchase.purchase_id}`} className="ledger-route__operation-row">
                  <div>
                    <strong>{purchase.customer_name?.trim() || purchase.customer_email || "Unknown customer"}</strong>
                    <span>{purchase.customer_email}</span>
                    <span>{purchaseLabel(purchase)}</span>
                    <small>{new Date(purchase.observed_at).toLocaleString()}</small>
                  </div>
                  <div className="ledger-route__operation-evidence">
                    <strong>{formatCurrencyMinor(purchase.checkout_amount_minor, purchase.checkout_currency)}</strong>
                    <span className={`ledger-route__mode-badge ledger-route__mode-badge--${purchase.stripe_mode}`}>
                      {purchase.stripe_mode === "test" ? "Test" : "Live"}
                    </span>
                    <span>Status: {purchase.status} · payment {purchase.payment_status ?? "unknown"}</span>
                    <span>Accounting: {ownerPurchaseAccountingLabel(purchase)}</span>
                    <span>Recognized revenue: {formatCurrencyMicros(purchase.recognized_revenue_micros, purchase.checkout_currency ?? purchase.accounting_currency)}</span>
                    <span>Funding: {purchase.live_funding_eligible ? "eligible allowance recorded" : "not enabled"}</span>
                    <span>Webhook evidence: {purchase.signed_webhook_events.length} event{purchase.signed_webhook_events.length === 1 ? "" : "s"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <OwnerBillingConsole />
        </>
      ) : null}

      <section className="ledger-route__episodes" aria-label="Thumbnail intelligence">
        <div className="ledger-route__episodes-head"><h3>Thumbnail Intelligence</h3><span>{thumbnailIntelligence?.analysis.freshness.state ?? "unavailable"}</span></div>
        {thumbnailError ? <p className="ledger-route__empty">Thumbnail evidence is unavailable: {thumbnailError}</p> : <>
          <p className="ledger-card__hint">Provider-neutral historical evidence. Ledger observes; it never edits or publishes a thumbnail.</p>
          <div className="ledger-route__grid">
            <article className="ledger-card"><h4 className="ledger-card__label">Launch intervals</h4><p className="ledger-card__value">{thumbnailIntelligence?.launchIntervals.length ?? 0}</p></article>
            <article className="ledger-card"><h4 className="ledger-card__label">Platform observations</h4><p className="ledger-card__value">{thumbnailIntelligence?.performanceObservations.length ?? 0}</p></article>
            <article className="ledger-card"><h4 className="ledger-card__label">Historical analyses</h4><p className="ledger-card__value">{thumbnailIntelligence?.analyses.length ?? 0}</p></article>
          </div>
          <p className="ledger-card__hint">Last collection: {thumbnailIntelligence?.analysis.freshness.last_collected_at ?? "No provider observations yet"}</p>
        </>}
      </section>
    </section>
  );
}
