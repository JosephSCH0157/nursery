export type LedgerUsageEvent = {
  created_at: string | null;
  feature: string | null;
  subfeature: string | null;
  actual_cost_usd: number | null;
  workpiece_id: string | null;
};

export type LedgerToolBucket = "hearth" | "hammer" | "quench";

export type LedgerEpisodeCost = {
  workpieceId: string;
  costUsd: number;
};

export type LedgerSummary = {
  costTodayUsd: number;
  costByToolUsd: Record<LedgerToolBucket, number>;
  costPerEpisode: LedgerEpisodeCost[];
  totalCostUsd: number;
};

export type LedgerTopFeature = {
  tool: LedgerToolBucket;
  costUsd: number;
  percent: number;
};

export type LedgerTimeRange = "today" | "7d" | "30d";

function roundUsd(value: number): number {
  return Math.max(0, Number(value.toFixed(6)));
}

function normalizeCost(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

function parseCreatedAt(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function filterLedgerEventsByRange(
  events: LedgerUsageEvent[],
  range: LedgerTimeRange,
  now: Date = new Date(),
): LedgerUsageEvent[] {
  if (range === "30d") {
    const from = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    return events.filter((event) => {
      const createdAt = parseCreatedAt(event.created_at);
      return createdAt ? createdAt.getTime() >= from : false;
    });
  }

  if (range === "7d") {
    const from = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    return events.filter((event) => {
      const createdAt = parseCreatedAt(event.created_at);
      return createdAt ? createdAt.getTime() >= from : false;
    });
  }

  return events.filter((event) => {
    const createdAt = parseCreatedAt(event.created_at);
    return createdAt ? isSameUtcDay(createdAt, now) : false;
  });
}

export function classifyToolBucket(feature: string | null, subfeature: string | null): LedgerToolBucket {
  const normalizedFeature = (feature ?? "").trim().toLowerCase();
  const normalizedSubfeature = (subfeature ?? "").trim().toLowerCase();

  if (normalizedFeature === "thumbnail_generate") return "quench";
  if (normalizedSubfeature === "hammer_prep_nonbillable") return "hammer";
  return "hearth";
}

export function buildLedgerSummary(
  events: LedgerUsageEvent[],
  now: Date = new Date(),
): LedgerSummary {
  const byTool: Record<LedgerToolBucket, number> = {
    hearth: 0,
    hammer: 0,
    quench: 0,
  };

  const byEpisode = new Map<string, number>();
  let costToday = 0;
  let total = 0;

  for (const event of events) {
    const cost = normalizeCost(event.actual_cost_usd);
    if (cost <= 0) continue;

    total += cost;

    const bucket = classifyToolBucket(event.feature, event.subfeature);
    byTool[bucket] += cost;

    const createdAt = event.created_at ? new Date(event.created_at) : null;
    if (createdAt && !Number.isNaN(createdAt.getTime()) && isSameUtcDay(createdAt, now)) {
      costToday += cost;
    }

    const workpieceId = (event.workpiece_id ?? "").trim();
    if (workpieceId) {
      byEpisode.set(workpieceId, (byEpisode.get(workpieceId) ?? 0) + cost);
    }
  }

  const costPerEpisode = [...byEpisode.entries()]
    .map(([workpieceId, costUsd]) => ({ workpieceId, costUsd: roundUsd(costUsd) }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    costTodayUsd: roundUsd(costToday),
    costByToolUsd: {
      hearth: roundUsd(byTool.hearth),
      hammer: roundUsd(byTool.hammer),
      quench: roundUsd(byTool.quench),
    },
    costPerEpisode,
    totalCostUsd: roundUsd(total),
  };
}

export function computeAvgCostPerEpisode(summary: LedgerSummary): number {
  const episodes = summary.costPerEpisode.length;
  if (episodes <= 0) return 0;
  return roundUsd(summary.totalCostUsd / episodes);
}

export function computeTopFeature(summary: LedgerSummary): LedgerTopFeature | null {
  const total = summary.totalCostUsd;
  if (total <= 0) return null;

  const entries: Array<{ tool: LedgerToolBucket; costUsd: number }> = [
    { tool: "hearth", costUsd: summary.costByToolUsd.hearth },
    { tool: "hammer", costUsd: summary.costByToolUsd.hammer },
    { tool: "quench", costUsd: summary.costByToolUsd.quench },
  ];

  const top = entries.sort((a, b) => b.costUsd - a.costUsd)[0] ?? null;
  if (!top || top.costUsd <= 0) return null;

  return {
    tool: top.tool,
    costUsd: roundUsd(top.costUsd),
    percent: Number(((top.costUsd / total) * 100).toFixed(1)),
  };
}
