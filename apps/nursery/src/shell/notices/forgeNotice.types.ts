export const FORGE_NOTICE_EVENT = "forge:notice";

export type ForgeNoticeSeverity = "info" | "success" | "warning" | "error";

export type ForgeNoticeTool = "hearth" | "hammer" | "quench" | "tongs" | "anvil" | "ledger";

export type ForgeNoticeJob =
  | "image-generated"
  | "script-completed"
  | "sources-found"
  | "save-failed"
  | "render-finished"
  | "export-finished"
  | "job-failed";

export type ForgeNoticeEvent = {
  tool: ForgeNoticeTool;
  job: ForgeNoticeJob;
  title: string;
  message?: string;
  route?: string;
  workspaceId?: string;
  workpieceId?: string;
  severity: ForgeNoticeSeverity;
  timestamp: number;
};

export type ForgeNoticeToast = ForgeNoticeEvent & {
  id: string;
  message: string | null;
  route: string | null;
};

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isForgeNoticeEventDetail(value: unknown): value is ForgeNoticeEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;
  const tool = readTrimmedString(row.tool);
  const job = readTrimmedString(row.job);
  const title = readTrimmedString(row.title);
  const severity = readTrimmedString(row.severity);
  const timestamp = row.timestamp;

  return Boolean(
    tool
    && job
    && title
    && severity
    && typeof timestamp === "number"
    && Number.isFinite(timestamp),
  );
}
