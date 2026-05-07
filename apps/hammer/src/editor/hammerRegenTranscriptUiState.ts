type HammerRegenJobTelemetryShape = {
  status: "idle" | "blocked" | "creating" | "queued" | "running" | "completed" | "failed" | "canceled";
  progressPercent: number | null;
};

export function deriveRegenProgressLabel(telemetry: HammerRegenJobTelemetryShape): string | null {
  if (telemetry.status === "creating") return "Preparing job…";
  if (telemetry.status === "queued") return "Sending for transcription…";
  if (telemetry.status !== "running") return null;
  if (typeof telemetry.progressPercent === "number" && Number.isFinite(telemetry.progressPercent) && telemetry.progressPercent > 1) {
    return `Progress ${telemetry.progressPercent}%`;
  }
  return "Receiving transcript chunks…";
}

export function resolveIngestSelectedSource(diag: Record<string, unknown> | null): string | null {
  if (!diag) return null;
  const extra = (diag.extra && typeof diag.extra === "object" && !Array.isArray(diag.extra))
    ? diag.extra as Record<string, unknown>
    : null;
  if (typeof extra?.selected_transcript_source === "string") return extra.selected_transcript_source;
  if (typeof diag.selected_source === "string") return diag.selected_source;
  return null;
}

