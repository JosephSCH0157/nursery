import type { MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";

export type HammerRecordingIdentityStatus = {
  canonicalMediaPath: string | null;
  resolvedMediaPath: string | null;
  labelMismatchWarning: string | null;
  actualRecordingMismatchWarning: string | null;
  hasActualRecordingMismatch: boolean;
};

function normalizeLabelForComparison(value: string | null | undefined): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSystemMediaLabel(value: string | null | undefined): boolean {
  const raw = value?.trim() ?? "";
  if (!raw) return true;
  return raw.startsWith("tongs:")
    || raw.includes("/")
    || raw.includes("\\");
}

function normalizePathForComparison(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .toLowerCase();
}

export function resolveHammerRecordingIdentityStatus(args: {
  canonicalWorkpieceLabel: string | null;
  legacyCaptureLabel: string | null;
  canonicalMediaPath: string | null;
  mediaRef: MediaRef | null;
}): HammerRecordingIdentityStatus {
  const canonicalLabel = normalizeLabelForComparison(args.canonicalWorkpieceLabel);
  const legacyLabel = normalizeLabelForComparison(args.legacyCaptureLabel);
  const canonicalMediaPath = normalizePathForComparison(args.canonicalMediaPath);
  const resolvedMediaPath = normalizePathForComparison(args.mediaRef?.local_relpath ?? null);

  const labelMismatchWarning = !canonicalLabel
    || !legacyLabel
    || isSystemMediaLabel(args.legacyCaptureLabel)
    || canonicalLabel.includes(legacyLabel)
    || legacyLabel.includes(canonicalLabel)
    ? null
    : `Capture label "${args.legacyCaptureLabel}" does not match this episode title "${args.canonicalWorkpieceLabel}". Tongs binding remains authoritative.`;

  const hasActualRecordingMismatch = Boolean(
    canonicalMediaPath
    && resolvedMediaPath
    && canonicalMediaPath !== resolvedMediaPath,
  );
  const actualRecordingMismatchWarning = hasActualRecordingMismatch
    ? `Bound recording path "${args.mediaRef?.local_relpath ?? resolvedMediaPath}" does not match the canonical Tongs media for this episode.`
    : null;

  return {
    canonicalMediaPath,
    resolvedMediaPath,
    labelMismatchWarning,
    actualRecordingMismatchWarning,
    hasActualRecordingMismatch,
  };
}