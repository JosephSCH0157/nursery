type DailyRefreshPreference = {
  revision: number;
  enabled: boolean;
  auto_refresh_authorized: boolean;
};

type TopicBasisPreference = {
  genre: string;
  enabled: boolean;
};

export type DailyRefreshOperation = {
  operationKey: string;
  preferenceRevision: number;
};

export type TopicDiscoveryFailure = {
  outcome?: string;
  next_eligible_at?: string | null;
};

export class TopicDiscoveryRequestError extends Error {
  readonly outcome: string | null;
  readonly nextEligibleAt: string | null;

  constructor(message: string, failure?: TopicDiscoveryFailure | null) {
    super(message);
    this.name = "TopicDiscoveryRequestError";
    this.outcome = failure?.outcome ?? null;
    this.nextEligibleAt = failure?.next_eligible_at ?? null;
  }
}

export function localCalendarDateKey(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDailyRefreshOperation(
  workspaceId: string,
  preference: DailyRefreshPreference | null | undefined,
  lastSuccessfulRefresh: string | null | undefined,
  now = new Date(),
): DailyRefreshOperation | null {
  if (!preference?.enabled || !preference.auto_refresh_authorized || !lastSuccessfulRefresh) {
    return null;
  }

  const today = localCalendarDateKey(now);
  const lastSuccessfulDay = localCalendarDateKey(lastSuccessfulRefresh);
  if (!today || !lastSuccessfulDay || today === lastSuccessfulDay) return null;

  return {
    operationKey: `auto:${workspaceId}:${preference.revision}:${today}`,
    preferenceRevision: preference.revision,
  };
}

export function getCollapsedTopicBasis(
  preference: TopicBasisPreference | null | undefined,
  settingsOpen: boolean,
): string | null {
  if (!preference?.enabled || settingsOpen) return null;
  return preference.genre.trim() || null;
}

export function isPreviousResultSet(
  preferenceRevision: number | null | undefined,
  runRevision: number | null | undefined,
): boolean {
  return Number.isFinite(preferenceRevision)
    && Number.isFinite(runRevision)
    && preferenceRevision !== runRevision;
}

export function formatNextEligibleAt(
  value: string | null | undefined,
  now = new Date(),
): string | null {
  if (!value) return null;
  const eligibleAt = new Date(value);
  if (!Number.isFinite(eligibleAt.getTime())) return null;

  if (localCalendarDateKey(eligibleAt) === localCalendarDateKey(now)) {
    return eligibleAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return eligibleAt.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
