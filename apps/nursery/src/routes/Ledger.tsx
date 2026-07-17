import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { tongsSupabase } from "../lib/supabase";
import {
  buildLedgerSummary,
  computeAvgCostPerEpisode,
  computeTopFeature,
  filterLedgerEventsByRange,
  type LedgerTimeRange,
  type LedgerUsageEvent,
} from "../lib/ledger-costs";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import "./Ledger.css";
import { loadThumbnailLedgerIntelligence } from "../lib/thumbnail-ledger";

type LedgerEventRow = {
  created_at: string | null;
  feature: string | null;
  subfeature: string | null;
  actual_cost_usd: number | null;
  workpiece_id: string | null;
};

type EpisodeRow = {
  id: string;
  title: string | null;
};

type AiUsageEventsTableClient = {
  from: (table: "ai_usage_events") => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          order: (column: string, options?: { ascending?: boolean }) => {
            limit: (value: number) => {
              returns: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
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
];

export default function LedgerRoute() {
  const shell = useOutletContext<AppShellContext>();
  const workspaceId = shell.workspaceId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<LedgerUsageEvent[]>([]);
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

      const aiUsageClient = tongsSupabase as unknown as AiUsageEventsTableClient;

      const { data, error: queryError } = await aiUsageClient
        .from("ai_usage_events")
        .select("created_at, feature, subfeature, actual_cost_usd, workpiece_id")
        .eq("workspace_id", workspaceId)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(2000)
        .returns<LedgerEventRow[]>();

      if (cancelled) return;

      if (queryError) {
        setError(queryError.message || "Failed to load Ledger usage events.");
        setLoading(false);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      setEvents(rows);

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
  }, [workspaceId]);

  const filteredEvents = useMemo(
    () => filterLedgerEventsByRange(events, timeRange),
    [events, timeRange],
  );
  const summary = useMemo(() => buildLedgerSummary(filteredEvents), [filteredEvents]);
  const avgCostPerEpisode = useMemo(() => computeAvgCostPerEpisode(summary), [summary]);
  const topFeature = useMemo(() => computeTopFeature(summary), [summary]);
  const topEpisodes = summary.costPerEpisode.slice(0, 5);

  if (!workspaceId) {
    return <WorkspaceRequiredNotice toolName="Ledger" />;
  }

  return (
    <section className="ledger-route">
      <header className="ledger-route__header">
        <div>
          <h2 className="ledger-route__title">Ledger</h2>
          <p className="ledger-route__subtitle">Tiny AI cost truth panel from ai_usage_events.</p>
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
          <h3 className="ledger-card__label">Cost Today</h3>
          <p className="ledger-card__value">{formatUsd(summary.totalCostUsd)}</p>
          <p className="ledger-card__hint">{timeRange === "today" ? "today" : `selected range: ${timeRange}`}</p>
        </article>

        <article className="ledger-card">
          <h3 className="ledger-card__label">Cost By Feature</h3>
          <p className="ledger-card__subvalue">Hearth: {formatUsd(summary.costByToolUsd.hearth)}</p>
          <p className="ledger-card__subvalue">Hammer: {formatUsd(summary.costByToolUsd.hammer)}</p>
          <p className="ledger-card__subvalue">Quench: {formatUsd(summary.costByToolUsd.quench)}</p>
        </article>

        <article className="ledger-card">
          <h3 className="ledger-card__label">Cost Per Episode</h3>
          <p className="ledger-card__value">{summary.costPerEpisode.length}</p>
          <p className="ledger-card__hint">episodes with billable AI usage</p>
          <p className="ledger-card__subvalue">Avg: {formatUsd(avgCostPerEpisode)}</p>
        </article>
      </div>

      <section className="ledger-route__episodes">
        <div className="ledger-route__episodes-head">
          <h3>Top Episodes</h3>
          <span>{loading ? "Loading..." : `Total: ${formatUsd(summary.totalCostUsd)}`}</span>
        </div>

        {topEpisodes.length === 0 ? (
          <p className="ledger-route__empty">No AI usage yet for this workspace.</p>
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
