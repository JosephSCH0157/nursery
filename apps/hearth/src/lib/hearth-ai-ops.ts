import type { Draft } from "../domain/draft";
import type { HearthPlanningSession, HearthTitleVariants } from "../domain/hearth-session";
import type { SourceIndexEntry, WorkpieceSourceRef } from "../domain/source";
import type { BarStockSpark } from "./barstock-sparks";
import { normalizeSourceId, parseSourceTokens } from "./source-tokens";

export type EpisodeTitleVariants = {
  A: string;
  B: string;
  C: string;
};

export type EpisodeContext = {
  episodeId: string;
  workspaceId: string | null;
  title: string;
  titleVariants: EpisodeTitleVariants;
  outline: string;
  body: string;
  tonePreset: string | null;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    note: string;
    citedIn: string[];
  }>;
  sparks: Array<{ id: string; text: string }>;
};

export type HearthOp =
  | { op: "set_title_variant"; slot: "A" | "B" | "C"; value: string }
  | { op: "set_title"; value: string }
  | { op: "set_outline"; value: string }
  | { op: "set_body"; value: string }
  | { op: "add_source"; source: { title?: string; url?: string; note?: string } }
  | { op: "update_source"; id: string; patch: { title?: string; url?: string; note?: string } }
  | { op: "remove_source"; id: string };

export type HearthAiReplyPayload = {
  assistantText: string;
  ops: HearthOp[];
};

type BuildEpisodeContextInput = {
  episodeId: string;
  workspaceId: string | null;
  draft: Pick<Draft, "id" | "title" | "body"> | null;
  planningSession: Pick<HearthPlanningSession, "title" | "title_variants" | "outline" | "tone_preset"> | null;
  workpieceSources: Array<Pick<WorkpieceSourceRef, "source_id" | "notes">>;
  sourceIndexById: Map<string, Pick<SourceIndexEntry, "source_id" | "title" | "url">>;
  sparks: Array<Pick<BarStockSpark, "id" | "body">>;
};

function normalizeTitleVariants(value: HearthTitleVariants | null | undefined): EpisodeTitleVariants {
  return {
    A: value?.A?.trim() ?? "",
    B: value?.B?.trim() ?? "",
    C: value?.C?.trim() ?? "",
  };
}

export function buildEpisodeContext(input: BuildEpisodeContextInput): EpisodeContext {
  const body = input.draft?.body ?? "";
  const sourceTokens = parseSourceTokens(body);
  const citedInBySourceId = new Map<string, string[]>();
  for (const token of sourceTokens) {
    const list = citedInBySourceId.get(token.normalized) ?? [];
    if (!list.includes(token.token)) {
      list.push(token.token);
    }
    citedInBySourceId.set(token.normalized, list);
  }

  return {
    episodeId: input.episodeId,
    workspaceId: input.workspaceId,
    title: (input.draft?.title ?? input.planningSession?.title ?? "").trim(),
    titleVariants: normalizeTitleVariants(input.planningSession?.title_variants),
    outline: (input.planningSession?.outline ?? []).join("\n"),
    body,
    tonePreset: input.planningSession?.tone_preset?.trim() ?? null,
    sources: input.workpieceSources.map((ref) => {
      const normalized = normalizeSourceId(ref.source_id);
      const entry = input.sourceIndexById.get(normalized);
      return {
        id: ref.source_id,
        title: entry?.title?.trim() ?? "",
        url: entry?.url?.trim() ?? "",
        note: ref.notes?.trim() ?? "",
        citedIn: citedInBySourceId.get(normalized) ?? [],
      };
    }),
    sparks: input.sparks.map((spark) => ({
      id: spark.id,
      text: spark.body ?? "",
    })),
  };
}

export type HearthOpsStore = {
  setTitle: (value: string) => void | Promise<void>;
  setTitleVariant: (slot: "A" | "B" | "C", value: string) => void | Promise<void>;
  setOutline: (value: string) => void | Promise<void>;
  setBody: (value: string) => void | Promise<void>;
  addSource: (source: { title?: string; url?: string; note?: string }) => void | Promise<void>;
  updateSource: (id: string, patch: { title?: string; url?: string; note?: string }) => void | Promise<void>;
  removeSource: (id: string) => void | Promise<void>;
  requestSave: (reason: "proposal_apply_ops") => void | Promise<void>;
};

export async function applyHearthOps(store: HearthOpsStore, ops: HearthOp[]): Promise<void> {
  for (const op of ops) {
    switch (op.op) {
      case "set_title":
        await store.setTitle(op.value);
        break;
      case "set_title_variant":
        await store.setTitleVariant(op.slot, op.value);
        break;
      case "set_outline":
        await store.setOutline(op.value);
        break;
      case "set_body":
        await store.setBody(op.value);
        break;
      case "add_source":
        await store.addSource(op.source);
        break;
      case "update_source":
        await store.updateSource(op.id, op.patch);
        break;
      case "remove_source":
        await store.removeSource(op.id);
        break;
      default:
        break;
    }
  }
  await store.requestSave("proposal_apply_ops");
}

export function describeHearthOp(op: HearthOp): string {
  switch (op.op) {
    case "set_title":
      return "Set Episode title";
    case "set_title_variant":
      return `Set Title ${op.slot}`;
    case "set_outline":
      return "Replace outline";
    case "set_body":
      return "Replace draft body";
    case "add_source":
      return "Add source";
    case "update_source":
      return `Update source ${op.id}`;
    case "remove_source":
      return `Remove source ${op.id}`;
    default:
      return "Edit";
  }
}
