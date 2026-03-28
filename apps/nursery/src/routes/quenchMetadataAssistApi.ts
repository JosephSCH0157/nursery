import type { QuenchMetadataAssistDraft } from "@forge/quench";
import { QUENCH_METADATA_ASSIST_ROUTE } from "@forge/quench";
import { tongsFetch } from "../../../hammer/src/lib/tongsFetch";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readErrorMessage(payload: unknown): string {
  const row = readObject(payload);
  const error = readObject(row?.error);
  return readString(error?.message)
    ?? readString(row?.message)
    ?? readString(row?.detail)
    ?? "Quench metadata assist failed.";
}

function normalizeDraft(payload: unknown): QuenchMetadataAssistDraft | null {
  const row = readObject(payload);
  const data = readObject(row?.data);
  const draft = readObject(data?.draft);
  const title = readString(draft?.title);
  const description = readString(draft?.description);
  const tagsRaw = Array.isArray(draft?.tags) ? draft.tags : [];
  const tags = tagsRaw
    .map((value) => readString(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, 12);
  if (!title || !description) return null;
  return { title, description, tags };
}

export async function requestQuenchMetadataAssist(args: {
  workspace_id: string;
  workpiece_id: string;
  title: string;
  description: string;
  tags: string[];
}): Promise<QuenchMetadataAssistDraft> {
  const response = await tongsFetch(QUENCH_METADATA_ASSIST_ROUTE, {
    method: "POST",
    json: {
      workspace_id: args.workspace_id,
      workpiece_id: args.workpiece_id,
      title: args.title,
      description: args.description,
      tags: args.tags,
    },
    timeoutMs: 120_000,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload));
  }

  const draft = normalizeDraft(payload);
  if (!draft) {
    throw new Error("Quench metadata assist returned an invalid draft payload.");
  }
  return draft;
}

