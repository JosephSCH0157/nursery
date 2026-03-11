import type { Draft } from "../domain/draft";
import type { Revision } from "../domain/revision";
import type { BarStockSpark } from "./barstock-sparks";
import type { HearthReadyScript } from "./hearth-ready-scripts";
import type { HearthWorkpieceSummary } from "./hearth-workpieces";

export type HearthWorkpieceNavItem = {
  kind: "workpiece";
  id: string;
  workpieceId: string;
  title: string;
  label: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  archivedAt: string | null;
  isArchived: boolean;
  draftId: string | null;
  readyEntry: HearthReadyScript | null;
  sparkCount: number;
};

export type HearthNavItem =
  | HearthWorkpieceNavItem
  | { kind: "spark"; id: string }
  | { kind: "ready"; id: string }
  | { kind: "series"; id: string };

export type ActiveWorkpieceContext = {
  workpiece: HearthWorkpieceSummary | null;
  draft: Draft | null;
  readyEntry: HearthReadyScript | null;
  linkedSparks: BarStockSpark[];
  revisions: Revision[];
};

type WorkpieceSortKey = "updated" | "title";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function indexDraftBindingsByWorkpiece(
  drafts: readonly Draft[],
  sparks: readonly BarStockSpark[] = [],
): Map<string, string> {
  const bindings = new Map<string, string>();

  for (const draft of drafts) {
    const workpieceId = readString(draft.id);
    if (!workpieceId || bindings.has(workpieceId)) continue;
    bindings.set(workpieceId, draft.id);
  }

  for (const spark of sparks) {
    const workpieceId = readString(spark.links?.hearthWorkpieceId);
    const draftId = readString(spark.links?.hearthDraftId);
    if (!workpieceId || !draftId || bindings.has(workpieceId)) continue;
    if (!drafts.some((draft) => draft.id === draftId)) continue;
    bindings.set(workpieceId, draftId);
  }

  return bindings;
}

export function selectDraftForWorkpiece(args: {
  workpieceId: string | null;
  drafts: readonly Draft[];
  sparks?: readonly BarStockSpark[];
  preferredDraftId?: string | null;
}): Draft | null {
  const workpieceId = readString(args.workpieceId);
  if (!workpieceId) return null;

  const directDraft = args.drafts.find((draft) => draft.id === workpieceId) ?? null;
  if (directDraft) return directDraft;

  const bindings = indexDraftBindingsByWorkpiece(args.drafts, args.sparks ?? []);
  const preferredDraftId = readString(args.preferredDraftId);
  if (preferredDraftId && bindings.get(workpieceId) === preferredDraftId) {
    return args.drafts.find((draft) => draft.id === preferredDraftId) ?? null;
  }

  const boundDraftId = bindings.get(workpieceId) ?? null;
  if (!boundDraftId) return null;
  return args.drafts.find((draft) => draft.id === boundDraftId) ?? null;
}

function selectLinkedSparks(
  workpieceId: string,
  sparks: readonly BarStockSpark[],
  draft: Draft | null,
): BarStockSpark[] {
  return sparks.filter((spark) => {
    if (spark.links?.hearthWorkpieceId === workpieceId) return true;
    if (!spark.links?.hearthWorkpieceId && draft && spark.links?.hearthDraftId === draft.id) return true;
    return false;
  });
}

export function selectWorkpieceNavItems(args: {
  workpieces: readonly HearthWorkpieceSummary[];
  drafts: readonly Draft[];
  readyScripts?: readonly HearthReadyScript[];
  sparks?: readonly BarStockSpark[];
  searchText?: string;
  sortKey?: WorkpieceSortKey;
  preferredDraftIdsByWorkpiece?: ReadonlyMap<string, string | null>;
}): HearthWorkpieceNavItem[] {
  const query = readString(args.searchText)?.toLowerCase() ?? "";
  const readyByWorkpieceId = new Map(
    (args.readyScripts ?? []).map((entry) => [entry.workpieceId, entry] as const),
  );
  const sparkList = args.sparks ?? [];

  const items = args.workpieces
    .map((workpiece) => {
      const draft = selectDraftForWorkpiece({
        workpieceId: workpiece.workpieceId,
        drafts: args.drafts,
        sparks: sparkList,
        preferredDraftId: args.preferredDraftIdsByWorkpiece?.get(workpiece.workpieceId) ?? null,
      });

      const linkedSparks = selectLinkedSparks(workpiece.workpieceId, sparkList, draft);
      return {
        kind: "workpiece" as const,
        id: workpiece.workpieceId,
        workpieceId: workpiece.workpieceId,
        title: workpiece.title,
        label: workpiece.label,
        createdAt: workpiece.createdAt,
        updatedAt: workpiece.updatedAt,
        createdAtMs: workpiece.createdAtMs,
        updatedAtMs: workpiece.updatedAtMs,
        archivedAt: workpiece.archivedAt,
        isArchived: workpiece.isArchived,
        draftId: draft?.id ?? null,
        readyEntry: readyByWorkpieceId.get(workpiece.workpieceId) ?? null,
        sparkCount: linkedSparks.length,
      };
    })
    .filter((item) => {
      if (!query) return true;
      return item.title.toLowerCase().includes(query);
    });

  return items.sort((left, right) => {
    if (args.sortKey === "title") {
      return left.title.localeCompare(right.title);
    }
    if (left.updatedAtMs !== right.updatedAtMs) return right.updatedAtMs - left.updatedAtMs;
    if (left.createdAtMs !== right.createdAtMs) return right.createdAtMs - left.createdAtMs;
    return left.title.localeCompare(right.title);
  });
}

export function selectActiveWorkpieceContext(args: {
  activeWorkpieceId: string | null;
  workpieces: readonly HearthWorkpieceSummary[];
  drafts: readonly Draft[];
  readyScripts?: readonly HearthReadyScript[];
  sparks?: readonly BarStockSpark[];
  revisions?: readonly Revision[];
  preferredDraftId?: string | null;
}): ActiveWorkpieceContext {
  const activeWorkpieceId = readString(args.activeWorkpieceId);
  const workpiece = activeWorkpieceId
    ? args.workpieces.find((entry) => entry.workpieceId === activeWorkpieceId) ?? null
    : null;
  const draft = selectDraftForWorkpiece({
    workpieceId: workpiece?.workpieceId ?? null,
    drafts: args.drafts,
    sparks: args.sparks ?? [],
    preferredDraftId: args.preferredDraftId ?? null,
  });
  const readyEntry = workpiece
    ? (args.readyScripts ?? []).find((entry) => entry.workpieceId === workpiece.workpieceId) ?? null
    : null;
  const linkedSparks = workpiece
    ? selectLinkedSparks(workpiece.workpieceId, args.sparks ?? [], draft)
    : [];
  const revisions = draft
    ? (args.revisions ?? []).filter((revision) => revision.draftId === draft.id)
    : [];

  return {
    workpiece,
    draft,
    readyEntry,
    linkedSparks,
    revisions,
  };
}
