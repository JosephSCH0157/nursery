import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { tongsSupabase } from "../lib/supabase";
import { buildLedgerSummary, type LedgerUsageEvent } from "../lib/ledger-costs";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import "./Ledger.css";

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

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

export default function LedgerRoute() {
  const shell = useOutletContext<AppShellContext>();
  const workspaceId = shell.workspaceId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<LedgerUsageEvent[]>([]);
  const [episodeTitles, setEpisodeTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await tongsSupabase
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

  const summary = useMemo(() => buildLedgerSummary(events), [events]);
  const topEpisodes = summary.costPerEpisode.slice(0, 5);

  if (!workspaceId) {
    return <WorkspaceRequiredNotice toolName="Ledger" />;
  }

  return (
    <section className="ledger-route">
      <header className="ledger-route__header">
        <h2 className="ledger-route__title">Ledger</h2>
        <p className="ledger-route__subtitle">Tiny AI cost truth panel from ai_usage_events.</p>
      </header>

      {error ? <div className="ledger-route__error">{error}</div> : null}

      <div className="ledger-route__grid">
        <article className="ledger-card">
          <h3 className="ledger-card__label">Cost Today</h3>
          <p className="ledger-card__value">{formatUsd(summary.costTodayUsd)}</p>
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
    </section>
  );
}
