import { tongsFetch } from "../lib/tongsFetch";

type JsonRecord = Record<string, unknown>;

export type HammerTakeAdoptionTarget = Readonly<{
  workspaceId: string;
  workpieceId: string;
}>;

export type HammerTakeAdoptionResult = Readonly<{
  canonicalRecordingId: string;
  outcome: "adopted" | "duplicate" | "already_current";
}>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) return null;
  try { return JSON.parse(body) as unknown; } catch { return null; }
}

export async function adoptLatestKeptTakeForHammer(
  target: HammerTakeAdoptionTarget,
  operationKey = `hammer-take-adopt:${crypto.randomUUID()}`,
): Promise<HammerTakeAdoptionResult> {
  const response = await tongsFetch(
    `/tongs/workspaces/${encodeURIComponent(target.workspaceId)}/workpieces/${encodeURIComponent(target.workpieceId)}/hammer/canonical-recording/adopt-latest-take`,
    { method: "POST", json: { operation_key: operationKey }, timeoutMs: 45_000 },
  );
  const payload = record(await readJson(response));
  const data = record(payload?.data);
  if (!response.ok) {
    const message = text(record(payload?.error)?.message) ?? "Hammer could not safely use the newer take.";
    throw new Error(message);
  }
  const outcome = text(data?.outcome);
  const canonicalRecordingId = text(record(data?.canonical_recording)?.id);
  if (!canonicalRecordingId || !outcome || !["adopted", "duplicate", "already_current"].includes(outcome)) {
    throw new Error("Tongs returned an incomplete take-adoption receipt.");
  }
  return { canonicalRecordingId, outcome: outcome as HammerTakeAdoptionResult["outcome"] };
}

export async function useNewTakeThenOpen(args: {
  target: HammerTakeAdoptionTarget;
  adopt?: (target: HammerTakeAdoptionTarget) => Promise<HammerTakeAdoptionResult>;
  open: (target: HammerTakeAdoptionTarget, authority: HammerTakeAdoptionResult) => void;
}): Promise<HammerTakeAdoptionResult> {
  const authority = await (args.adopt ?? adoptLatestKeptTakeForHammer)(args.target);
  args.open(args.target, authority);
  return authority;
}
