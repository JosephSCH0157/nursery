import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { tongsSupabase } from "../lib/supabase";
import {
  buildLedgerSummary,
  computeAvgCostPerEpisode,
  computeTopFeature,
  type LedgerTimeRange,
  type LedgerUsageEvent,
} from "../lib/ledger-costs";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import "./Ledger.css";
import { loadThumbnailLedgerIntelligence } from "../lib/thumbnail-ledger";

type CostLedgerComponent = {
  incurred_at: string | null;
  category: "ai_request" | "paid_media" | "infrastructure";
  feature: string | null;
  subfeature: string | null;
  provider: string;
  key_source: string;
  payer: "forge" | "customer_provider_account" | "unknown";
  cost_basis: "pricing_estimate" | "provider_usage_actual" | "invoice_actual";
  cost_usd: number | null;
  workpiece_id: string | null;
};

type CostCoverage = {
  state: "estimated" | "provider_usage_actual" | "invoice_actual" | "unavailable";
  detail: string;
};

type CostLedgerResponse = {
  contract_version: string;
  components: CostLedgerComponent[];
  coverage: Record<"ai_requests" | "paid_media" | "fly_io", CostCoverage>;
};

type EpisodeRow = {
  id: string;
  title: string | null;
};

type CostLedgerRpcClient = {
  rpc: (name: "read_workspace_cost_ledger", args: {
    p_workspace_id: string;
    p_from: string;
    p_to: string;
  }) => Promise<{
    data: CostLedgerResponse | null;
    error: { message: string } | null;
  }>;
};

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

function costBasisLabel(basis: CostLedgerComponent["cost_basis"]): string {
  if (basis === "invoice_actual") return "Invoice actual";
  if (basis === "provider_usage_actual") return "Provider-rated actual usage";
  return "Provider-price estimate";
}

function coverageLabel(coverage: CostCoverage | undefined): string {
  if (!coverage || coverage.state === "unavailable") return "Unavailable";
  if (coverage.state === "invoice_actual") return "Invoice actual";
  if (coverage.state === "provider_usage_actual") return "Provider-rated usage";
  return "Estimated";
}

function providerLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai") return "OpenAI";
  if (["fly", "fly.io", "fly_io"].includes(normalized)) return "Fly.io";
  if (normalized === "runway") return "Runway";
  return value.trim() || "Unknown";
}

function payerLabel(value: CostLedgerComponent["payer"]): string {
  if (value === "forge") return "Forge-paid";
  if (value === "customer_provider_account") return "Customer provider account";
  return "Payer untracked";
}

function categoryLabel(value: CostLedgerComponent["category"]): string {
  if (value === "paid_media") return "Paid media usage receipt";
  if (value === "infrastructure") return "Infrastructure billing observation";
  return "AI usage event";
}

function isByo(component: CostLedgerComponent): boolean {
  const source = component.key_source.toLowerCase();
  return source.includes("byo") || source.includes("personal");
}

const EMPTY_COVERAGE: CostLedgerResponse["coverage"] = {
  ai_requests: { state: "unavailable", detail: "AI request cost data is unavailable." },
  paid_media: { state: "unavailable", detail: "Paid-media cost data is unavailable." },
  fly_io: { state: "unavailable", detail: "Fly.io billing data is not connected." },
};

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatToolLabel(tool: string): string {
  return tool.slice(0, 1).toUpperCase() + tool.slice(1);
}

const RANGE_OPTIONS: ReadonlyArray<{ value: LedgerTimeRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

export default function LedgerRoute() {
  const shell = useOutletContext<AppShellContext>();
  const workspaceId = shell.workspaceId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<LedgerUsageEvent[]>([]);
  const [components, setComponents] = useState<CostLedgerComponent[]>([]);
  const [coverage, setCoverage] = useState<CostLedgerResponse["coverage"]>(EMPTY_COVERAGE);
  const [episodeTitles, setEpisodeTitles] = useState<Record<string, string>>({});
  const [timeRange, setTimeRange] = useState<LedgerTimeRange>("today");
  const [thumbnailIntelligence, setThumbnailIntelligence] = useState<Awaited<ReturnType<typeof loadThumbnailLedgerIntelligence>> | null>(null);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      void loadThumbnailLedgerIntelligence(workspaceId).then((value) => { if (!cancelled) { setThumbnailIntelligence(value); setThumbnailError(null); } })
        .catch((reason: unknown) => { if (!cancelled) setThumbnailError(reason instanceof Error ? reason.message : "Thumbnail intelligence is unavailable."); });

      const bounds = rangeBounds(timeRange);
      const ledgerClient = tongsSupabase as unknown as CostLedgerRpcClient;
      const { data, error: queryError } = await ledgerClient.rpc("read_workspace_cost_ledger", {
        p_workspace_id: workspaceId,
        p_from: bounds.from.toISOString(),
        p_to: bounds.to.toISOString(),
      });

      if (cancelled) return;

      if (queryError) {
        setError(queryError.message || "Failed to load the Forge cost ledger.");
        setEvents([]);
        setComponents([]);
        setCoverage(EMPTY_COVERAGE);
        setLoading(false);
        return;
      }

      const rows = Array.isArray(data?.components) ? data.components : [];
      setComponents(rows);
      setCoverage(data?.coverage ?? EMPTY_COVERAGE);
      setEvents(rows.map((row) => ({
        created_at: row.incurred_at,
        feature: row.feature,
        subfeature: row.subfeature,
        actual_cost_usd: row.cost_usd,
        workpiece_id: row.workpiece_id,
      })));

      const workpieceIds = [...new Set(
        rows
          .map((row) => (row.workpiece_id ?? "").trim())
          .filter((id) => id.length > 0),
      )].slice(0, 100);

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
        const map: Record<string, string> = {};
        for (const row of episodeData ?? []) {
          const id = row.id?.trim();
          if (!id) continue;
          map[id] = (row.title ?? "").trim() || `Episode ${id.slice(0, 8)}`;
        }
        setEpisodeTitles(map);
      }

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, timeRange]);

  const summary = useMemo(() => buildLedgerSummary(events), [events]);
  const avgCostPerEpisode = useMemo(() => computeAvgCostPerEpisode(summary), [summary]);
  const topFeature = useMemo(() => computeTopFeature(summary), [summary]);
  const topEpisodes = summary.costPerEpisode.slice(0, 5);
  const costByProvider = useMemo(() => {
    const totals = new Map<string, number>();
    for (const component of components) {
      const cost = Number(component.cost_usd ?? 0);
      if (!Number.isFinite(cost) || cost <= 0) continue;
      const label = providerLabel(component.provider);
      totals.set(label, (totals.get(label) ?? 0) + cost);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [components]);
  const byoCost = useMemo(() => components.reduce((total, component) => {
    const cost = Number(component.cost_usd ?? 0);
    return total + (isByo(component) && Number.isFinite(cost) && cost > 0 ? cost : 0);
  }, 0), [components]);
  const forgePaidCost = useMemo(() => components.reduce((total, component) => {
    const cost = Number(component.cost_usd ?? 0);
    return total + (component.payer === "forge" && Number.isFinite(cost) && cost > 0 ? cost : 0);
  }, 0), [components]);
  const customerPaidCost = useMemo(() => components.reduce((total, component) => {
    const cost = Number(component.cost_usd ?? 0);
    return total + (component.payer === "customer_provider_account" && Number.isFinite(cost) && cost > 0 ? cost : 0);
  }, 0), [components]);
  const basisTotals = useMemo(() => components.reduce<Record<CostLedgerComponent["cost_basis"], number>>((totals, component) => {
    const cost = Number(component.cost_usd ?? 0);
    if (Number.isFinite(cost) && cost > 0) totals[component.cost_basis] += cost;
    return totals;
  }, { pricing_estimate: 0, provider_usage_actual: 0, invoice_actual: 0 }), [components]);
  const recentOperations = components.slice(0, 20);

  if (!workspaceId) {
    return <WorkspaceRequiredNotice toolName="Ledger" />;
  }

  return (
    <section className="ledger-route">
      <header className="ledger-route__header">
        <div>
          <h2 className="ledger-route__title">Ledger</h2>
          <p className="ledger-route__subtitle">Recorded provider costs across Forge for this workspace, including BYO-key usage.</p>
          {topFeature ? (
            <p className="ledger-route__badge" role="status" aria-live="polite">
              Highest cost {timeRange === "today" ? "today" : `in ${timeRange}`}: {formatToolLabel(topFeature.tool)} ({topFeature.percent}%)
            </p>
          ) : null}
        </div>
        <div className="ledger-route__filters" role="group" aria-label="Ledger time range">
          {RANGE_OPTIONS.map((option) => {
            const active = timeRange === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={active ? "ledger-route__filter-btn ledger-route__filter-btn--active" : "ledger-route__filter-btn"}
                onClick={() => setTimeRange(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </header>

      {error ? <div className="ledger-route__error">{error}</div> : null}

      <div className="ledger-route__grid">
        <article className="ledger-card">
          <h3 className="ledger-card__label">Recorded cost</h3>
          <p className="ledger-card__value">{formatUsd(summary.totalCostUsd)}</p>
          <p className="ledger-card__hint">{timeRange === "today" ? "today" : `selected range: ${timeRange}`}</p>
        </article>

        <article className="ledger-card">
          <h3 className="ledger-card__label">Cost by Forge area</h3>
          <p className="ledger-card__subvalue">Hearth: {formatUsd(summary.costByToolUsd.hearth)}</p>
          <p className="ledger-card__subvalue">Hammer: {formatUsd(summary.costByToolUsd.hammer)}</p>
          <p className="ledger-card__subvalue">Quench: {formatUsd(summary.costByToolUsd.quench)}</p>
        </article>

        <article className="ledger-card">
          <h3 className="ledger-card__label">Cost Per Episode</h3>
          <p className="ledger-card__value">{summary.costPerEpisode.length}</p>
          <p className="ledger-card__hint">episodes with recorded provider cost</p>
          <p className="ledger-card__subvalue">Avg: {formatUsd(avgCostPerEpisode)}</p>
        </article>
      </div>

      <section className="ledger-route__episodes" aria-label="Cost provenance">
        <div className="ledger-route__episodes-head">
          <h3>Cost provenance</h3>
          <span>BYO usage included: {formatUsd(byoCost)}</span>
        </div>
        <div className="ledger-route__payer-summary" aria-label="Who pays">
          <span>Forge-paid: <strong>{formatUsd(forgePaidCost)}</strong></span>
          <span>Customer provider account: <strong>{formatUsd(customerPaidCost)}</strong></span>
        </div>
        <div className="ledger-route__grid ledger-route__coverage-grid">
          <article className="ledger-card">
            <h4 className="ledger-card__label">AI requests · {coverageLabel(coverage.ai_requests)}</h4>
            <p className="ledger-card__value">{formatUsd(basisTotals.pricing_estimate)}</p>
            <p className="ledger-card__hint">{coverage.ai_requests.detail}</p>
          </article>
          <article className="ledger-card">
            <h4 className="ledger-card__label">Paid media · {coverageLabel(coverage.paid_media)}</h4>
            <p className="ledger-card__value">{formatUsd(basisTotals.provider_usage_actual)}</p>
            <p className="ledger-card__hint">{coverage.paid_media.detail}</p>
          </article>
          <article className="ledger-card">
            <h4 className="ledger-card__label">Fly.io · {coverageLabel(coverage.fly_io)}</h4>
            <p className="ledger-card__value">{coverage.fly_io.state === "unavailable" ? "—" : formatUsd(basisTotals.invoice_actual)}</p>
            <p className="ledger-card__hint">{coverage.fly_io.detail}</p>
          </article>
        </div>
        <div className="ledger-route__provider-breakdown">
          <h4>By provider</h4>
          {costByProvider.length === 0 ? <p className="ledger-route__empty">No recorded provider costs in this range.</p> : (
            <ul className="ledger-route__episode-list">
              {costByProvider.map(([provider, cost]) => <li key={provider} className="ledger-route__episode-row"><span>{provider}</span><strong>{formatUsd(cost)}</strong></li>)}
            </ul>
          )}
        </div>
        <p className="ledger-card__hint">Totals combine rows with different evidence strength. {costBasisLabel("pricing_estimate")} is not an invoice actual; provider-rated usage is based on canonical metering receipts.</p>
      </section>

      <section className="ledger-route__episodes">
        <div className="ledger-route__episodes-head">
          <h3>Top Episodes</h3>
          <span>{loading ? "Loading..." : `Total: ${formatUsd(summary.totalCostUsd)}`}</span>
        </div>

        {topEpisodes.length === 0 ? (
          <p className="ledger-route__empty">No recorded provider cost yet for this workspace and range.</p>
        ) : (
          <ul className="ledger-route__episode-list">
            {topEpisodes.map((row) => (
              <li key={row.workpieceId} className="ledger-route__episode-row">
                <span>{episodeTitles[row.workpieceId] ?? `Episode ${row.workpieceId.slice(0, 8)}`}</span>
                <strong>{formatUsd(row.costUsd)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="ledger-route__episodes" aria-label="Recorded cost operations">
        <div className="ledger-route__episodes-head"><h3>Recorded operations</h3><span>Newest {Math.min(recentOperations.length, 20)}</span></div>
        <p className="ledger-card__hint">Each row answers which provider ran it, who paid, how certain the amount is, and which canonical Ledger source recorded it.</p>
        {recentOperations.length === 0 ? <p className="ledger-route__empty">No recorded operations in this range.</p> : (
          <ul className="ledger-route__operation-list">
            {recentOperations.map((component, index) => (
              <li key={`${component.incurred_at ?? "unknown"}-${index}`} className="ledger-route__operation-row">
                <div>
                  <strong>{providerLabel(component.provider)}</strong>
                  <span>{component.feature ?? component.subfeature ?? "Unclassified operation"}</span>
                  <small>{component.incurred_at ? new Date(component.incurred_at).toLocaleString() : "Time unavailable"}</small>
                </div>
                <div className="ledger-route__operation-evidence">
                  <strong>{formatUsd(Number(component.cost_usd ?? 0))}</strong>
                  <span>{payerLabel(component.payer)}</span>
                  <span>{costBasisLabel(component.cost_basis)}</span>
                  <span>Ledger source: {categoryLabel(component.category)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
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
