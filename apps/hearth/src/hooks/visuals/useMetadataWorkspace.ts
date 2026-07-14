import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  EpisodePackageV2,
  EpisodeSeoTitle,
} from "../../lib/episode-package-v2";
import {
  ensureSeoV2,
  normalizeSeoTags,
} from "../../lib/episode-package-v2";
import { saveEpisodePackageForWorkpiece } from "../../lib/hearth-thumbnail-api";
import { retainCanonicalVisualArtifacts } from "../../lib/hearth-visual-artifact-authority";

type MetadataPreviewMode = "youtube" | "rss" | "plain";
type MetadataSaveState = "loading" | "saved" | "editing" | "saving" | "error";

const METADATA_AUTOSAVE_DELAY_MS = 450;
const METADATA_SAVE_TIMEOUT_MS = 10000;

type UseMetadataWorkspaceArgs = {
  workpieceId: string | null;
  workspaceId: string | null;
  episodePackage: EpisodePackageV2 | null;
  setEpisodePackage: Dispatch<SetStateAction<EpisodePackageV2 | null>>;
  setImageMapMetadataUpdatedAt: (value: string | null) => void;
  parseTagInput: (input: string) => string[];
  normalizeTag: (tag: string) => string | null;
  deriveThumbnailOverlayText: (value: string) => string;
};

export function useMetadataWorkspace(args: UseMetadataWorkspaceArgs) {
  const {
    workpieceId,
    workspaceId,
    episodePackage,
    setEpisodePackage,
    setImageMapMetadataUpdatedAt,
    parseTagInput,
    normalizeTag,
    deriveThumbnailOverlayText,
  } = args;

  const [metadataTitlesDraft, setMetadataTitlesDraft] = useState<EpisodeSeoTitle[]>([]);
  const [metadataTagsDraft, setMetadataTagsDraft] = useState<string[]>([]);
  const [metadataTagInputDraft, setMetadataTagInputDraft] = useState("");
  const [metadataDescriptionShortDraft, setMetadataDescriptionShortDraft] = useState("");
  const [metadataDescriptionLongDraft, setMetadataDescriptionLongDraft] = useState("");
  const [metadataPreviewMode, setMetadataPreviewMode] = useState<MetadataPreviewMode>("youtube");
  const [metadataSaveState, setMetadataSaveState] = useState<MetadataSaveState>("loading");
  const [metadataSaveError, setMetadataSaveError] = useState<string | null>(null);

  useEffect(() => {
    setMetadataSaveState("loading");
    setMetadataSaveError((prev) => (prev === null ? prev : null));
    setMetadataTagInputDraft((prev) => (prev === "" ? prev : ""));
  }, [workpieceId]);

  useEffect(() => {
    if (!episodePackage) {
      setMetadataTitlesDraft((prev) => (prev.length === 0 ? prev : []));
      setMetadataTagsDraft((prev) => (prev.length === 0 ? prev : []));
      setMetadataTagInputDraft((prev) => (prev === "" ? prev : ""));
      setMetadataDescriptionShortDraft((prev) => (prev === "" ? prev : ""));
      setMetadataDescriptionLongDraft((prev) => (prev === "" ? prev : ""));
      setMetadataSaveState("loading");
      setMetadataSaveError((prev) => (prev === null ? prev : null));
      return;
    }
    if (metadataSaveState === "editing" || metadataSaveState === "saving") {
      return;
    }

    const normalized = ensureSeoV2(episodePackage);
    const nextTitles = normalized.seo.titles;
    const nextTags = normalized.seo.tags;
    const nextDescriptionShort = normalized.seo.description_short ?? "";
    const nextDescriptionLong = normalized.seo.description_long ?? "";

    // Avoid resetting drafts if nothing actually changed. This prevents a render
    // loop when the parent recreates `episodePackage` on every render.
    const titlesUnchanged = JSON.stringify(metadataTitlesDraft) === JSON.stringify(nextTitles);
    const tagsUnchanged = JSON.stringify(metadataTagsDraft) === JSON.stringify(nextTags);
    const descriptionsUnchanged =
      metadataDescriptionShortDraft === nextDescriptionShort &&
      metadataDescriptionLongDraft === nextDescriptionLong;

    if (!titlesUnchanged) setMetadataTitlesDraft(nextTitles);
    if (!tagsUnchanged) setMetadataTagsDraft(nextTags);
    if (metadataDescriptionShortDraft !== nextDescriptionShort) {
      setMetadataDescriptionShortDraft(nextDescriptionShort);
    }
    if (metadataDescriptionLongDraft !== nextDescriptionLong) {
      setMetadataDescriptionLongDraft(nextDescriptionLong);
    }

    if (!titlesUnchanged || !tagsUnchanged || !descriptionsUnchanged || metadataSaveState !== "saved") {
      setMetadataSaveState("saved");
      setMetadataSaveError(null);
    }
  }, [
    episodePackage,
    metadataSaveState,
    metadataTitlesDraft,
    metadataTagsDraft,
    metadataDescriptionShortDraft,
    metadataDescriptionLongDraft,
  ]);

  useEffect(() => {
    if (metadataSaveState !== "editing") return;
    const timer = window.setTimeout(() => {
      setMetadataSaveState("saving");
      setMetadataSaveError(null);
    }, METADATA_AUTOSAVE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [metadataSaveState]);

  useEffect(() => {
    if (metadataSaveState !== "saving") return;
    if (!episodePackage) return;

    const current = ensureSeoV2(episodePackage);
    const normalizedTitles = metadataTitlesDraft.map((title, index) => ({
      id: title.id,
      label: (title.label || ["A", "B", "C"][index] || `V${index + 1}`).toUpperCase(),
      text: title.text ?? "",
      thumbnail_text: title.thumbnail_text?.trim() || deriveThumbnailOverlayText(title.text ?? ""),
      is_primary: Boolean(title.is_primary),
    }));
    const primaryId = normalizedTitles.find((title) => title.is_primary)?.id ?? normalizedTitles[0]?.id ?? null;
    const titles = normalizedTitles.map((title) => ({
      ...title,
      is_primary: primaryId != null && title.id === primaryId,
    }));
    const nextSeo = {
      ...current.seo,
      titles,
      tags: normalizeSeoTags(metadataTagsDraft),
      description_short: metadataDescriptionShortDraft.trim() || null,
      description_long: metadataDescriptionLongDraft.trim() || null,
    };

    const hasChanges = JSON.stringify(nextSeo) !== JSON.stringify(current.seo);
    if (!hasChanges) {
      setMetadataSaveState("saved");
      setMetadataSaveError(null);
      return;
    }

    let cancelled = false;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      setMetadataSaveState("error");
      setMetadataSaveError("Save timed out. Retry.");
    }, METADATA_SAVE_TIMEOUT_MS);

    void (async () => {
      const workspace = workspaceId?.trim() ?? "";
      const workpiece = workpieceId?.trim() ?? "";
      if (!workspace || !workpiece) {
        if (cancelled || timedOut) return;
        window.clearTimeout(timeout);
        setMetadataSaveState("error");
        setMetadataSaveError("Workspace or workpiece is missing.");
        return;
      }

      const nextEpisodePackage: EpisodePackageV2 = {
        ...current,
        seo: nextSeo,
      };

      const saved = await saveEpisodePackageForWorkpiece({
        workpieceId: workpiece,
        workspaceId: workspace,
        episodePackage: nextEpisodePackage,
        eventName: "hearth.metadata.autosave.v1",
        eventPayload: {
          section: "seo",
        },
      });

      if (cancelled || timedOut) return;
      window.clearTimeout(timeout);

      if (!saved.ok) {
        setMetadataSaveState("error");
        setMetadataSaveError(saved.error || "Save failed. Retry.");
        return;
      }

      const authoritativeEpisodePackage = retainCanonicalVisualArtifacts(
        saved.episodePackage,
        nextEpisodePackage,
      );
      setEpisodePackage(authoritativeEpisodePackage);
      setImageMapMetadataUpdatedAt(saved.metadataUpdatedAt);
      setMetadataSaveState("saved");
      setMetadataSaveError(null);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    deriveThumbnailOverlayText,
    metadataDescriptionLongDraft,
    metadataDescriptionShortDraft,
    metadataSaveState,
    metadataTagsDraft,
    metadataTitlesDraft,
    episodePackage,
    setEpisodePackage,
    setImageMapMetadataUpdatedAt,
    workpieceId,
    workspaceId,
  ]);

  function markMetadataEditing(): void {
    if (metadataSaveState !== "editing") {
      setMetadataSaveState("editing");
    }
    setMetadataSaveError(null);
  }

  function onMetadataTitleChange(titleId: string, nextText: string): void {
    setMetadataTitlesDraft((prev) => prev.map((title) => (
      title.id === titleId
        ? {
          ...title,
          text: nextText,
          thumbnail_text: deriveThumbnailOverlayText(nextText),
        }
        : title
    )));
    markMetadataEditing();
  }

  function onMetadataSetPrimaryTitle(titleId: string): void {
    setMetadataTitlesDraft((prev) => prev.map((title) => ({
      ...title,
      is_primary: title.id === titleId,
    })));
    markMetadataEditing();
  }

  function onMetadataAddTagFromInput(): void {
    const parsed = parseTagInput(metadataTagInputDraft);
    if (parsed.length === 0) return;
    setMetadataTagsDraft((prev) => normalizeSeoTags([...prev, ...parsed]));
    setMetadataTagInputDraft("");
    markMetadataEditing();
  }

  function onMetadataRemoveTag(tag: string): void {
    setMetadataTagsDraft((prev) => prev.filter((entry) => entry !== tag));
    markMetadataEditing();
  }

  function onMetadataAddTagSuggestion(tag: string): void {
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    setMetadataTagsDraft((prev) => normalizeSeoTags([...prev, normalized]));
    markMetadataEditing();
  }

  function onMetadataDescriptionShortChange(nextValue: string): void {
    setMetadataDescriptionShortDraft(nextValue);
    markMetadataEditing();
  }

  function onMetadataDescriptionLongChange(nextValue: string): void {
    setMetadataDescriptionLongDraft(nextValue);
    markMetadataEditing();
  }

  function onMetadataPreviewModeChange(mode: MetadataPreviewMode): void {
    setMetadataPreviewMode(mode);
  }

  function onMetadataSaveNow(): void {
    if (metadataSaveState === "saving") return;
    setMetadataSaveError(null);
    setMetadataSaveState("saving");
  }

  function onMetadataRetrySave(): void {
    setMetadataSaveError(null);
    setMetadataSaveState("saving");
  }

  const hasUnsavedMetadataChanges = metadataSaveState === "editing"
    || metadataSaveState === "saving"
    || metadataSaveState === "error";

  return {
    metadataTitlesDraft,
    metadataTagsDraft,
    metadataTagInputDraft,
    metadataDescriptionShortDraft,
    metadataDescriptionLongDraft,
    metadataPreviewMode,
    metadataSaveState,
    metadataSaveError,
    setMetadataTitlesDraft,
    setMetadataTagsDraft,
    setMetadataTagInputDraft,
    setMetadataDescriptionShortDraft,
    setMetadataDescriptionLongDraft,
    onMetadataTitleChange,
    onMetadataSetPrimaryTitle,
    onMetadataAddTagFromInput,
    onMetadataRemoveTag,
    onMetadataAddTagSuggestion,
    onMetadataDescriptionShortChange,
    onMetadataDescriptionLongChange,
    onMetadataPreviewModeChange,
    onMetadataSaveNow,
    onMetadataRetrySave,
    hasUnsavedMetadataChanges,
  };
}
