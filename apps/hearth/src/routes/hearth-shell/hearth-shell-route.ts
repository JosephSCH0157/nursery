import type { HearthReadyScript } from "../../lib/hearth-ready-scripts";
import { getHearthPrimaryScriptPath } from "../../lib/hearth-script-repo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKSPACE_QUERY_KEYS = ["workspace_id", "workspaceId", "workspace"] as const;
const WORKPIECE_QUERY_KEYS = ["workpiece_id", "workpieceId", "workpiece", "cradle_id", "cradleId"] as const;
const INTAKE_QUERY_KEYS = [
  "spark_id",
  "sparkId",
  "barstock_spark_id",
  "project_id",
  "projectId",
  "barstock_project_id",
] as const;
const ANVIL_SCRIPT_PATH = getHearthPrimaryScriptPath();

export function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function normalizeUuid(value: unknown): string | null {
  const str = readTrimmedString(value);
  if (!str) return null;
  return UUID_RE.test(str) ? str.toLowerCase() : null;
}

function hasNonEmptyQueryValue(search: string, keys: readonly string[]): boolean {
  try {
    const query = new URLSearchParams(search);
    return keys.some((key) => Boolean(query.get(key)?.trim()));
  } catch {
    return false;
  }
}

export function hasExplicitWorkpieceQuery(search?: string): boolean {
  const resolvedSearch = search ?? (typeof window === "undefined" ? "" : window.location.search);
  return hasNonEmptyQueryValue(resolvedSearch, WORKPIECE_QUERY_KEYS);
}

export function hasIncomingBarStockIntakeQuery(search?: string): boolean {
  const resolvedSearch = search ?? (typeof window === "undefined" ? "" : window.location.search);
  if (hasExplicitWorkpieceQuery(resolvedSearch)) return false;
  return hasNonEmptyQueryValue(resolvedSearch, INTAKE_QUERY_KEYS);
}

export function buildHearthRouteContextUrl(args: {
  pathname: string;
  search: string;
  hash: string;
  workspaceId: string | null;
  workpieceId: string | null;
}): string {
  const params = new URLSearchParams(args.search);
  for (const key of [...WORKSPACE_QUERY_KEYS, ...WORKPIECE_QUERY_KEYS, ...INTAKE_QUERY_KEYS]) {
    params.delete(key);
  }

  const workspaceId = normalizeUuid(args.workspaceId);
  const workpieceId = normalizeUuid(args.workpieceId);
  if (workspaceId) params.set("workspace_id", workspaceId);
  if (workpieceId) params.set("workpiece_id", workpieceId);

  const nextSearch = params.toString();
  return `${args.pathname}${nextSearch ? `?${nextSearch}` : ""}${args.hash}`;
}

export function buildCurrentForgeNoticeRoute(args: {
  href: string;
  workspaceId: string | null;
  workpieceId: string | null;
}): string {
  const nextUrl = new URL(args.href);
  const workspaceId = readTrimmedString(args.workspaceId);
  const workpieceId = readTrimmedString(args.workpieceId);
  if (workspaceId) nextUrl.searchParams.set("workspace_id", workspaceId);
  if (workpieceId) nextUrl.searchParams.set("workpiece_id", workpieceId);
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}

export function buildOpenInAnvilHref(
  workspaceId: string | null,
  workpieceId: string | null,
  scriptPath = ANVIL_SCRIPT_PATH,
): string | null {
  const workspace = workspaceId?.trim();
  const workpiece = workpieceId?.trim();
  if (!workspace || !workpiece) return null;
  const normalizedScriptPath = scriptPath.trim();
  if (!normalizedScriptPath || normalizedScriptPath.startsWith("/") || normalizedScriptPath.includes("..")) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("workspace_id", workspace);
  params.set("workpiece_id", workpiece);
  params.set("open", "script");
  params.set("script_path", normalizedScriptPath);
  return `/app/anvil?${params.toString()}`;
}

export function resolveReadyOpenHref(entry: HearthReadyScript): string | null {
  return buildOpenInAnvilHref(entry.workspaceId, entry.workpieceId, entry.primaryScriptPath);
}
