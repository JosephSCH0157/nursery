const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WARNED_MISSING_WORKSPACE_NAV_KEYS = new Set<string>();

const WORKSPACE_PARAM_KEYS = ["workspace_id", "workspaceId", "workspace"] as const;
const WORKPIECE_PARAM_KEYS = [
  "workpiece_id",
  "workpieceId",
  "workpiece",
  "cradle_id",
  "cradleId",
] as const;

export type ForgeRouteContext = {
  workspaceId: string | null;
  workpieceId: string | null;
  hasInvalidWorkspaceId: boolean;
  hasInvalidWorkpieceId: boolean;
};

export type ForgeRouteHrefOptions = {
  search?: string;
  workspaceId?: string | null;
  workpieceId?: string | null;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
  const str = readString(value);
  if (!str) return null;
  return UUID_RE.test(str) ? str.toLowerCase() : null;
}

function resolveParam(
  params: URLSearchParams,
  keys: readonly string[],
): { value: string | null; hasInvalid: boolean } {
  let value: string | null = null;
  let hasInvalid = false;

  for (const key of keys) {
    const raw = readString(params.get(key));
    if (!raw) continue;
    const normalized = normalizeUuid(raw);
    if (normalized) {
      if (!value) value = normalized;
      continue;
    }
    hasInvalid = true;
  }

  return { value, hasInvalid };
}

function deleteParams(params: URLSearchParams, keys: readonly string[]): void {
  for (const key of keys) {
    params.delete(key);
  }
}

export function parseForgeRouteContext(search: string): ForgeRouteContext {
  const params = new URLSearchParams(search);
  const workspace = resolveParam(params, WORKSPACE_PARAM_KEYS);
  const workpiece = resolveParam(params, WORKPIECE_PARAM_KEYS);
  return {
    workspaceId: workspace.value,
    workpieceId: workpiece.value,
    hasInvalidWorkspaceId: workspace.hasInvalid,
    hasInvalidWorkpieceId: workpiece.hasInvalid,
  };
}

export function buildForgeRouteHref(pathname: string, options: ForgeRouteHrefOptions): string {
  const params = new URLSearchParams(options.search ?? "");
  deleteParams(params, WORKSPACE_PARAM_KEYS);
  deleteParams(params, WORKPIECE_PARAM_KEYS);

  const workspaceId = normalizeUuid(options.workspaceId);
  const workpieceId = normalizeUuid(options.workpieceId);

  if (workspaceId) {
    params.set("workspace_id", workspaceId);
  }
  if (workpieceId) {
    params.set("workpiece_id", workpieceId);
  }

  const nextSearch = params.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

export function removeWorkspaceParams(search: string): string {
  const params = new URLSearchParams(search);
  deleteParams(params, WORKSPACE_PARAM_KEYS);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

export function warnMissingWorkspaceParamInDev(args: {
  source: string;
  href: string;
  workspaceId: string | null;
}): void {
  if (!import.meta.env.DEV) return;
  if (!args.workspaceId) return;
  if (typeof window === "undefined") return;
  try {
    const parsed = new URL(args.href, window.location.origin);
    if (!parsed.pathname.startsWith("/app")) return;
    if (normalizeUuid(parsed.searchParams.get("workspace_id"))) return;
    const key = `${args.source}|${parsed.pathname}`;
    if (WARNED_MISSING_WORKSPACE_NAV_KEYS.has(key)) return;
    WARNED_MISSING_WORKSPACE_NAV_KEYS.add(key);
    console.warn("[workspace] ForgeNav link missing workspace_id", {
      source: args.source,
      href: args.href,
      workspaceId: args.workspaceId,
    });
  } catch {
    // ignore malformed hrefs
  }
}
