import type { Draft, DraftId } from "../domain/draft";
import type { HearthStore } from "./hearth-store";

const DRAFTS_STORAGE_KEY = "hearth:drafts";

type DraftRecord = Record<string, Draft>;

function cloneDraft(draft: Draft): Draft {
  return { ...draft };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeDraft(value: unknown): Draft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) return null;

  const createdAt = isFiniteNumber(row.createdAt) ? row.createdAt : Date.now();
  const updatedAt = isFiniteNumber(row.updatedAt) ? row.updatedAt : createdAt;

  return {
    id,
    title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Untitled Draft",
    body: typeof row.body === "string" ? row.body : "",
    createdAt,
    updatedAt,
  };
}

function readDraftRecord(): DraftRecord {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const out: DraftRecord = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const normalized = normalizeDraft({ ...(value as object), id });
      if (normalized) out[normalized.id] = normalized;
    }
    return out;
  } catch {
    return {};
  }
}

function writeDraftRecord(record: DraftRecord): void {
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(record));
}

export class LocalHearthStore implements HearthStore {
  async listDrafts(): Promise<Draft[]> {
    const record = readDraftRecord();
    return Object.values(record)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(cloneDraft);
  }

  async getDraft(id: DraftId): Promise<Draft | null> {
    const record = readDraftRecord();
    const found = record[id];
    return found ? cloneDraft(found) : null;
  }

  async saveDraft(draft: Draft): Promise<void> {
    const normalized = normalizeDraft(draft);
    if (!normalized) {
      throw new Error("Invalid draft payload");
    }

    const record = readDraftRecord();
    record[normalized.id] = cloneDraft(normalized);
    writeDraftRecord(record);
  }

  async deleteDraft(id: DraftId): Promise<void> {
    const record = readDraftRecord();
    if (!record[id]) return;
    delete record[id];
    writeDraftRecord(record);
  }
}
