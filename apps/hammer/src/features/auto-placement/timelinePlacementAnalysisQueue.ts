export type TimelinePlacementAnalysisStatus =
  | "queued"
  | "waiting-evidence"
  | "safe-existing"
  | "resolved-safe"
  | "needs-review"
  | "missing-media"
  | "stale-evidence"
  | "unsupported";

export type TimelinePlacementAnalysisWorkItem = Readonly<{
  placementId: string;
  sessionIdentity: string;
  sourceIdentity: string;
  compositionPresentationTimeSec: number;
  sourceMediaTimeSec: number;
  canonicalRevision: string;
  mediaRevision: string;
  geometryRevision: string;
}>;

export type TimelinePlacementAnalysisResult<TTransform = unknown> = Readonly<{
  item: TimelinePlacementAnalysisWorkItem;
  status: Exclude<TimelinePlacementAnalysisStatus, "queued" | "waiting-evidence">;
  resolvedTransform?: TTransform;
  reason?: string;
}>;

export type TimelinePlacementAnalysisEntry<TTransform = unknown> = Readonly<{
  item: TimelinePlacementAnalysisWorkItem;
  status: TimelinePlacementAnalysisStatus;
  resolvedTransform?: TTransform;
  reason?: string;
}>;

function compareWorkItems(a: TimelinePlacementAnalysisWorkItem, b: TimelinePlacementAnalysisWorkItem): number {
  return a.compositionPresentationTimeSec - b.compositionPresentationTimeSec
    || a.placementId.localeCompare(b.placementId);
}

export function timelinePlacementWorkKey(item: TimelinePlacementAnalysisWorkItem): string {
  return [item.sessionIdentity, item.placementId, item.sourceIdentity, item.compositionPresentationTimeSec.toFixed(3), item.sourceMediaTimeSec.toFixed(3),
    item.canonicalRevision, item.mediaRevision, item.geometryRevision].join("|");
}

/** Session-only serial queue. It owns no geometry, history, persistence, or media providers. */
export class TimelinePlacementAnalysisQueue<TTransform = unknown> {
  private readonly entries = new Map<string, TimelinePlacementAnalysisEntry<TTransform>>();
  private activeKey: string | null = null;

  public reconcile(items: readonly TimelinePlacementAnalysisWorkItem[]): void {
    const desired = new Map(items.map((item) => [item.placementId, item]));
    for (const [placementId, entry] of this.entries) {
      const next = desired.get(placementId);
      if (!next) {
        this.entries.delete(placementId);
        if (this.activeKey === timelinePlacementWorkKey(entry.item)) this.activeKey = null;
        continue;
      }
      if (timelinePlacementWorkKey(next) !== timelinePlacementWorkKey(entry.item)) {
        if (this.activeKey === timelinePlacementWorkKey(entry.item)) this.activeKey = null;
        this.entries.set(placementId, Object.freeze({ item: next, status: "queued" }));
      }
      desired.delete(placementId);
    }
    for (const item of desired.values()) {
      this.entries.set(item.placementId, Object.freeze({ item, status: "queued" }));
    }
  }

  public takeNext(): TimelinePlacementAnalysisWorkItem | null {
    if (this.activeKey) return null;
    const entry = [...this.entries.values()]
      .filter((candidate) => candidate.status === "queued")
      .sort((a, b) => compareWorkItems(a.item, b.item))[0];
    if (!entry) return null;
    this.activeKey = timelinePlacementWorkKey(entry.item);
    this.entries.set(entry.item.placementId, Object.freeze({ item: entry.item, status: "waiting-evidence" }));
    return entry.item;
  }

  public settle(result: TimelinePlacementAnalysisResult<TTransform>): boolean {
    const current = this.entries.get(result.item.placementId);
    const key = timelinePlacementWorkKey(result.item);
    if (!current || timelinePlacementWorkKey(current.item) !== key || this.activeKey !== key) return false;
    this.activeKey = null;
    this.entries.set(result.item.placementId, Object.freeze({
      item: result.item,
      status: result.status,
      ...(result.resolvedTransform === undefined ? {} : { resolvedTransform: result.resolvedTransform }),
      ...(result.reason === undefined ? {} : { reason: result.reason }),
    }));
    return true;
  }

  public cancelActive(): void {
    if (!this.activeKey) return;
    const entry = [...this.entries.values()].find((candidate) => timelinePlacementWorkKey(candidate.item) === this.activeKey);
    this.activeKey = null;
    if (entry) this.entries.set(entry.item.placementId, Object.freeze({ item: entry.item, status: "queued" }));
  }

  public reset(): void {
    this.activeKey = null;
    this.entries.clear();
  }

  public snapshot(): readonly TimelinePlacementAnalysisEntry<TTransform>[] {
    return Object.freeze([...this.entries.values()].sort((a, b) => compareWorkItems(a.item, b.item)));
  }
}
