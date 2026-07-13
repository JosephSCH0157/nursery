import {
  commitHammerCompositionCommand,
  hammerStableFingerprint,
  readHammerCompositionAtHead,
  type HammerCompositionCommand,
  type HammerCompositionHistoryV2,
  type HammerCompositionV2,
} from "./hammerCompositionV2";

export type HammerCompositionTransactionV2 = Readonly<{
  schema_version: 2;
  transaction_id: string;
  expected_revision_updated_at: string;
  composition: HammerCompositionV2;
  history: HammerCompositionHistoryV2;
  transaction_fingerprint: string;
}>;

export function prepareHammerCompositionTransactionV2(args: {
  history: HammerCompositionHistoryV2;
  command: HammerCompositionCommand;
  label: string;
  expectedRevisionUpdatedAt: string;
}): HammerCompositionTransactionV2 {
  if (!args.expectedRevisionUpdatedAt.trim()) throw new Error("composition_expected_revision_missing");
  const history = commitHammerCompositionCommand(args.history, args.command, args.label);
  const composition = readHammerCompositionAtHead(history);
  const head = history.entries[history.head_index] ?? null;
  const draft = {
    schema_version: 2 as const,
    transaction_id: `composition-tx:${composition.recording_revision_id}:${composition.revision}:${head?.entry_id ?? "raw"}`,
    expected_revision_updated_at: args.expectedRevisionUpdatedAt,
    composition,
    history,
  };
  return Object.freeze({ ...draft, transaction_fingerprint: hammerStableFingerprint(draft) });
}

export function readAcknowledgedHammerCompositionV2(args: {
  transaction: HammerCompositionTransactionV2;
  recordingRevisionId: string;
  acknowledgedRevision: number | null;
  acknowledgedFingerprint: string | null;
  acknowledgedHistoryHeadId: string | null;
}): HammerCompositionV2 {
  const { transaction_fingerprint: storedFingerprint, ...draft } = args.transaction;
  if (hammerStableFingerprint(draft) !== storedFingerprint) throw new Error("composition_transaction_fingerprint_mismatch");
  const composition = args.transaction.composition;
  const head = args.transaction.history.entries[args.transaction.history.head_index]?.entry_id ?? null;
  if (composition.recording_revision_id !== args.recordingRevisionId) throw new Error("composition_transaction_identity_mismatch");
  if (composition.revision !== args.acknowledgedRevision
    || composition.fingerprint !== args.acknowledgedFingerprint
    || head !== args.acknowledgedHistoryHeadId) throw new Error("composition_transaction_not_acknowledged");
  if (readHammerCompositionAtHead(args.transaction.history).fingerprint !== composition.fingerprint) throw new Error("composition_history_head_mismatch");
  return composition;
}

export function assertHammerCompositionV2(value: unknown): asserts value is HammerCompositionV2 {
  if (!value || typeof value !== "object") throw new Error("composition_v2_invalid");
  const row = value as Partial<HammerCompositionV2>;
  if (row.schema_version !== 2 || !row.composition_id || !row.recording_revision_id
    || !Number.isInteger(row.revision) || !Array.isArray(row.source_media) || !Array.isArray(row.source_groups) || !Array.isArray(row.tracks)
    || typeof row.fingerprint !== "string") throw new Error("composition_v2_invalid");
}
