export type RecordingNameMode = "av" | "audio";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function sanitizeRecordingTitle(title: string): string {
  const trimmed = String(title || "Script").trim() || "Script";
  const cleaned = trimmed
    .replace(/[:/\\?<>|*"']/g, "-")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
  const sliced = cleaned.slice(0, 64).replace(/^_+|_+$/g, "");
  return sliced || "Script";
}

export function pickRecordingBaseTitle(args: {
  inputTitle?: string | null;
  routeEpisodeTitle?: string | null;
  storedTitle?: string | null;
}): string {
  // Canon: the *current* script title input wins. Route params are stale-prone.
  return (
    readString(args.inputTitle)
    ?? readString(args.routeEpisodeTitle)
    ?? readString(args.storedTitle)
    ?? "Script"
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatRecordingTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());
  return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
}

export function buildRecordingFilename(args: {
  mode: RecordingNameMode;
  baseTitle: string;
  date?: Date;
}): string {
  const date = args.date ?? new Date();
  const title = sanitizeRecordingTitle(args.baseTitle);
  const ts = formatRecordingTimestamp(date);
  if (args.mode === "audio") return `${title}_${ts}_audio.wav`;
  return `${title}_${ts}.webm`;
}

