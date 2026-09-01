import {
  HAMMER_AUDIO_DSP_IMPLEMENTATION_VERSION,
  HAMMER_AUDIO_DSP_SCHEMA_VERSION,
  HAMMER_AUDIO_RENDERER_VERSION,
  canonicalHammerAudioJson,
  fingerprintHammerAudio,
  type HammerAudioDspOperationId,
  type HammerAudioDspPlanV1,
  type HammerAudioRenderIdentityV1,
} from "./hammerAudioDspPlan";

export const HAMMER_EXACT_AUDIO_RECEIPT_VERSION = "HammerExactAudioRenderReceiptV1" as const;
export const HAMMER_AUDIO_ALGORITHM_VERSIONS = Object.freeze({
  dsp: HAMMER_AUDIO_DSP_IMPLEMENTATION_VERSION,
  ffmpeg_filter_plan: "ffmpeg-filter-plan.3",
  loudness: "ffmpeg-loudnorm-two-pass.1",
  sample_limiter: "ffmpeg-alimiter.1",
});

export type HammerExactAudioOperationDecision = Readonly<{
  id: HammerAudioDspOperationId;
  order: number;
  state: "applied" | "bypassed" | "failed";
  detail: string | null;
}>;

export type HammerLoudnessMeasurementV1 = Readonly<{
  integrated_lufs: number;
  loudness_range_lu: number;
  true_peak_dbtp: number;
  threshold_lufs: number;
  offset_lu: number;
}>;

export type HammerExactAudioLoudnessReceiptV1 = Readonly<{
  status: "not_requested" | "verified" | "failed";
  target_lufs: number | null;
  target_lra_lu: number | null;
  true_peak_ceiling_dbtp: number | null;
  first_pass: HammerLoudnessMeasurementV1 | null;
  second_pass_parameters: Readonly<Record<string, number>> | null;
  verification: HammerLoudnessMeasurementV1 | null;
  sample_peak_dbfs: number | null;
}>;

export type HammerExactAudioRenderReceiptV1 = Readonly<{
  schemaVersion: typeof HAMMER_EXACT_AUDIO_RECEIPT_VERSION;
  dspSchemaVersion: typeof HAMMER_AUDIO_DSP_SCHEMA_VERSION;
  dspImplementationVersion: string;
  rendererVersion: string;
  algorithmVersions: Readonly<Record<string, string>>;
  dspFingerprint: string;
  renderIdentity: HammerAudioRenderIdentityV1;
  operations: readonly HammerExactAudioOperationDecision[];
  ffmpegFilterPlan: string;
  loudness: HammerExactAudioLoudnessReceiptV1;
  output: Readonly<{
    canonicalAssetId: string | null;
    contentHash: string;
    workpiecePath: string;
    mimeType: string;
    durationMs: number;
    sampleRate: number;
    channels: number;
  }>;
  receiptFingerprint: string;
}>;

export type HammerExactAudioReceiptValidationCode =
  | "exact_audio_receipt_missing" | "exact_audio_receipt_fingerprint_mismatch"
  | "exact_audio_dsp_identity_mismatch" | "exact_audio_render_identity_mismatch"
  | "exact_audio_algorithm_obsolete" | "exact_audio_operation_incomplete"
  | "exact_audio_operation_order_invalid" | "exact_audio_loudness_evidence_missing"
  | "exact_audio_loudness_out_of_tolerance" | "exact_audio_true_peak_exceeded"
  | "exact_audio_output_identity_mismatch";

export type HammerExactAudioReceiptValidation = Readonly<{
  ok: boolean;
  reasons: readonly Readonly<{ code: HammerExactAudioReceiptValidationCode; label: string }>[];
}>;

function allFinite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).every(allFinite);
  return true;
}

export function fingerprintHammerExactAudioReceipt(
  receipt: Omit<HammerExactAudioRenderReceiptV1, "receiptFingerprint">,
): string {
  if (!allFinite(receipt)) throw new Error("Exact audio receipt contains a non-finite value.");
  return fingerprintHammerAudio(receipt);
}

export function buildHammerExactAudioRenderReceipt(
  receipt: Omit<HammerExactAudioRenderReceiptV1, "schemaVersion" | "dspSchemaVersion" | "receiptFingerprint">,
): HammerExactAudioRenderReceiptV1 {
  const seed = {
    ...receipt,
    schemaVersion: HAMMER_EXACT_AUDIO_RECEIPT_VERSION,
    dspSchemaVersion: HAMMER_AUDIO_DSP_SCHEMA_VERSION,
  } as const;
  const receiptFingerprint = fingerprintHammerExactAudioReceipt(seed);
  return Object.freeze({ ...seed, receiptFingerprint });
}

export function validateHammerExactAudioReleaseReceipt(args: {
  receipt: HammerExactAudioRenderReceiptV1 | null | undefined;
  plan: HammerAudioDspPlanV1;
  renderIdentity: HammerAudioRenderIdentityV1;
  canonicalAssetId?: string | null;
  contentHash?: string | null;
  renderFingerprint?: string | null;
  receiptFingerprint?: string | null;
}): HammerExactAudioReceiptValidation {
  const reasons: { code: HammerExactAudioReceiptValidationCode; label: string }[] = [];
  const receipt = args.receipt;
  if (!receipt) return { ok: false, reasons: [{ code: "exact_audio_receipt_missing", label: "Exact-audio render receipt is missing." }] };
  const { receiptFingerprint: _fingerprint, ...fingerprintSeed } = receipt;
  try {
    if (fingerprintHammerExactAudioReceipt(fingerprintSeed) !== receipt.receiptFingerprint) reasons.push({ code: "exact_audio_receipt_fingerprint_mismatch", label: "Exact-audio receipt fingerprint does not match its contents." });
  } catch {
    reasons.push({ code: "exact_audio_receipt_fingerprint_mismatch", label: "Exact-audio receipt contains invalid numeric evidence." });
  }
  if (receipt.dspFingerprint !== args.plan.dspFingerprint) reasons.push({ code: "exact_audio_dsp_identity_mismatch", label: "Exact-audio DSP intent is stale." });
  if (canonicalHammerAudioJson(receipt.renderIdentity) !== canonicalHammerAudioJson(args.renderIdentity)) reasons.push({ code: "exact_audio_render_identity_mismatch", label: "Exact-audio source, timeline, or history identity is stale." });
  if (receipt.rendererVersion !== HAMMER_AUDIO_RENDERER_VERSION || canonicalHammerAudioJson(receipt.algorithmVersions) !== canonicalHammerAudioJson(HAMMER_AUDIO_ALGORITHM_VERSIONS)) reasons.push({ code: "exact_audio_algorithm_obsolete", label: "Exact-audio renderer semantics are obsolete." });
  const expected = args.plan.operations.filter((operation) => operation.enabled).map((operation) => operation.id);
  const actual = receipt.operations.filter((operation) => operation.state === "applied").map((operation) => operation.id);
  if (receipt.operations.some((operation) => operation.state === "failed") || expected.some((id) => !actual.includes(id))) reasons.push({ code: "exact_audio_operation_incomplete", label: "One or more enabled DSP operations were omitted or failed." });
  const receiptOrder = receipt.operations.map((operation) => operation.id);
  const canonicalOrder = args.plan.operations.map((operation) => operation.id);
  const ordinalOrder = receipt.operations.map((operation) => operation.order);
  const canonicalOrdinals = args.plan.operations.map((operation) => operation.order);
  if (receiptOrder.join("|") !== canonicalOrder.join("|") || ordinalOrder.join("|") !== canonicalOrdinals.join("|")) reasons.push({ code: "exact_audio_operation_order_invalid", label: "Exact-audio operations were not applied in canonical order." });
  const loudnessRequested = args.plan.operations.some((operation) => operation.id === "loudness_normalization" && operation.enabled);
  if (loudnessRequested) {
    if (receipt.loudness.status !== "verified" || !receipt.loudness.first_pass || !receipt.loudness.second_pass_parameters || !receipt.loudness.verification) reasons.push({ code: "exact_audio_loudness_evidence_missing", label: "Measured two-pass loudness evidence is incomplete." });
    else {
      if (Math.abs(receipt.loudness.verification.integrated_lufs - (receipt.loudness.target_lufs ?? 0)) > 1) reasons.push({ code: "exact_audio_loudness_out_of_tolerance", label: "Exact audio is outside the ±1 LU loudness tolerance." });
      if (receipt.loudness.verification.true_peak_dbtp > (receipt.loudness.true_peak_ceiling_dbtp ?? 0)) reasons.push({ code: "exact_audio_true_peak_exceeded", label: "Exact audio exceeds its authoritative true-peak ceiling." });
    }
  }
  if ((args.canonicalAssetId && receipt.output.canonicalAssetId !== args.canonicalAssetId) || (args.contentHash && receipt.output.contentHash !== args.contentHash)) reasons.push({ code: "exact_audio_output_identity_mismatch", label: "Exact-audio output identity does not match the canonical master." });
  if (args.renderFingerprint && receipt.renderIdentity.renderFingerprint !== args.renderFingerprint) reasons.push({ code: "exact_audio_render_identity_mismatch", label: "Canonical master and exact-audio receipt have different render identities." });
  if (args.receiptFingerprint && receipt.receiptFingerprint !== args.receiptFingerprint) reasons.push({ code: "exact_audio_receipt_fingerprint_mismatch", label: "Canonical master and exact-audio receipt have different receipt fingerprints." });
  return Object.freeze({ ok: reasons.length === 0, reasons: Object.freeze(reasons) });
}
