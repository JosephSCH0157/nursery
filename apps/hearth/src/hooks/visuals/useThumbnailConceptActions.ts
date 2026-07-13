import { useCallback } from "react";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";
import type {
  EpisodeLaunchVariant,
  EpisodePackageV2,
  EpisodeThumbnailConcept,
  EpisodeThumbnailVersion,
} from "../../lib/episode-package-v2";

type UseThumbnailConceptActionsArgs = {
  operationAuthority: HearthOperationAuthority;
  episodePackage: EpisodePackageV2 | null;
  thumbnailVersions: EpisodeThumbnailVersion[];
  launchVariants: EpisodeLaunchVariant[];
  metadataTitlesDraft: Array<{ id: string; text: string }>;
  selectedThumbnailTitleId: string | null;
  selectedThumbnailConceptId: string;
  selectedThumbnailVersionId: string | null;
  selectedLaunchVariantId: string | null;
  thumbnailConceptLabelDraft: string;
  thumbnailConceptPromptDraft: string;
  thumbnailConceptStyleDraft: string;
  thumbnailTitleStyleDraft: EpisodeThumbnailConcept["title_style"];
  thumbnailConceptBrandTemplateIdDraft: string | null;
  launchVariantStatusDraft: EpisodeLaunchVariant["status"];
  launchVariantNotesDraft: string;
  defaultThumbnailBrandTemplateId: string | null;
  isThumbnailConceptSaving: boolean;
  isThumbnailGenerating: boolean;
  isThumbnailUploading: boolean;
  createThumbnailClientId: (prefix: string) => string;
  normalizeVisualStyle: (
    value: string | null | undefined,
  ) => EpisodeThumbnailConcept["style_preset"];
  normalizeThumbnailTitleStyle: (
    value: EpisodeThumbnailConcept["title_style"],
  ) => EpisodeThumbnailConcept["title_style"];
  persistThumbnailEpisodePackage: (
    nextEpisodePackage: EpisodePackageV2,
    eventName: string,
    eventPayload: Record<string, unknown>,
  ) => Promise<EpisodePackageV2 | null>;
  setIsThumbnailConceptSaving: (next: boolean) => void;
  setSelectedThumbnailTitleId: (next: string) => void;
  setSelectedThumbnailConceptId: (next: string) => void;
  setSelectedThumbnailVersionId: (next: string | null) => void;
  setSelectedLaunchVariantId: (next: string | null) => void;
  setThumbnailGenerateError: (next: string | null) => void;
  setThumbnailPairingError: (next: string | null) => void;
};

export function useThumbnailConceptActions(args: UseThumbnailConceptActionsArgs) {
  const onCreateThumbnailConcept = useCallback(async () => {
    if (args.isThumbnailConceptSaving || args.isThumbnailGenerating || args.isThumbnailUploading) return;
    if (!args.episodePackage) return;

    const label = args.thumbnailConceptLabelDraft.trim();
    const promptText = args.thumbnailConceptPromptDraft.trim();
    if (!label || !promptText) {
      args.setThumbnailGenerateError("Concept label and prompt are required.");
      return;
    }

    const concept: EpisodeThumbnailConcept = {
      id: args.createThumbnailClientId("thumb-concept"),
      label,
      prompt_text: promptText,
      style_preset: args.normalizeVisualStyle(args.thumbnailConceptStyleDraft),
      title_style: args.normalizeThumbnailTitleStyle(args.thumbnailTitleStyleDraft),
      brand_template_id: args.thumbnailConceptBrandTemplateIdDraft ?? args.defaultThumbnailBrandTemplateId,
    };

    const nextEpisodePackage: EpisodePackageV2 = {
      ...args.episodePackage,
      thumbnail: {
        ...args.episodePackage.thumbnail,
        concepts: [...args.episodePackage.thumbnail.concepts, concept],
      },
    };

    args.setIsThumbnailConceptSaving(true);
    const operation = args.operationAuthority.begin("thumbnail.concept.create");
    args.setThumbnailGenerateError(null);
    try {
      const saved = await args.persistThumbnailEpisodePackage(
        nextEpisodePackage,
        "hearth.thumbnail.concept.created.v1",
        { concept_id: concept.id },
      );
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved) return;
      args.setSelectedThumbnailConceptId(concept.id);
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsThumbnailConceptSaving(false);
    }
  }, [args]);

  const onSaveSelectedThumbnailConcept = useCallback(async () => {
    if (args.isThumbnailConceptSaving || args.isThumbnailGenerating || args.isThumbnailUploading) return;
    if (!args.episodePackage || !args.selectedThumbnailConceptId) return;

    const label = args.thumbnailConceptLabelDraft.trim();
    const promptText = args.thumbnailConceptPromptDraft.trim();
    if (!label || !promptText) {
      args.setThumbnailGenerateError("Concept label and prompt are required.");
      return;
    }

    const nextConcepts = args.episodePackage.thumbnail.concepts.map((concept) => (
      concept.id === args.selectedThumbnailConceptId
        ? {
            ...concept,
            label,
            prompt_text: promptText,
            style_preset: args.normalizeVisualStyle(args.thumbnailConceptStyleDraft),
            title_style: args.normalizeThumbnailTitleStyle(args.thumbnailTitleStyleDraft),
            brand_template_id: args.thumbnailConceptBrandTemplateIdDraft ?? null,
          }
        : concept
    ));

    const nextEpisodePackage: EpisodePackageV2 = {
      ...args.episodePackage,
      thumbnail: {
        ...args.episodePackage.thumbnail,
        concepts: nextConcepts,
      },
    };

    args.setIsThumbnailConceptSaving(true);
    const operation = args.operationAuthority.begin("thumbnail.concept.save");
    args.setThumbnailGenerateError(null);
    try {
      await args.persistThumbnailEpisodePackage(
        nextEpisodePackage,
        "hearth.thumbnail.concept.updated.v1",
        { concept_id: args.selectedThumbnailConceptId },
      );
      if (!args.operationAuthority.isCurrent(operation)) return;
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsThumbnailConceptSaving(false);
    }
  }, [args]);

  const onDeleteSelectedThumbnailConcept = useCallback(async () => {
    if (args.isThumbnailConceptSaving || args.isThumbnailGenerating || args.isThumbnailUploading) return;
    if (!args.episodePackage || !args.selectedThumbnailConceptId) return;
    const confirmed = window.confirm("Delete this concept and its linked versions?");
    if (!confirmed) return;

    const nextConcepts = args.episodePackage.thumbnail.concepts.filter((concept) => concept.id !== args.selectedThumbnailConceptId);
    const nextVersions = args.episodePackage.thumbnail.versions.filter((version) => version.concept_id !== args.selectedThumbnailConceptId);
    const nextPrimary = nextVersions.some((version) => version.id === args.episodePackage?.thumbnail.primary_version_id)
      ? args.episodePackage.thumbnail.primary_version_id
      : nextVersions[0]?.id ?? null;
    const nextSelectedConceptId = nextConcepts[0]?.id ?? "";
    const nextSelectedVersionId = nextPrimary ?? nextVersions[0]?.id ?? null;

    const nextEpisodePackage: EpisodePackageV2 = {
      ...args.episodePackage,
      thumbnail: {
        ...args.episodePackage.thumbnail,
        concepts: nextConcepts,
        versions: nextVersions,
        primary_version_id: nextPrimary,
      },
    };

    args.setIsThumbnailConceptSaving(true);
    const operation = args.operationAuthority.begin("thumbnail.concept.delete");
    args.setThumbnailGenerateError(null);
    try {
      const saved = await args.persistThumbnailEpisodePackage(
        nextEpisodePackage,
        "hearth.thumbnail.concept.deleted.v1",
        { concept_id: args.selectedThumbnailConceptId },
      );
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved) return;
      args.setSelectedThumbnailConceptId(nextSelectedConceptId);
      args.setSelectedThumbnailVersionId(nextSelectedVersionId);
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsThumbnailConceptSaving(false);
    }
  }, [args]);

  const onSetPrimaryThumbnailVersion = useCallback(async (versionId: string) => {
    if (args.isThumbnailConceptSaving || args.isThumbnailGenerating || args.isThumbnailUploading) return;
    if (!args.episodePackage) return;
    const version = args.episodePackage.thumbnail.versions.find((entry) => entry.id === versionId);
    if (!version || version.status !== "ready") return;
    const operation = args.operationAuthority.begin("thumbnail.primary.set");

    const nextEpisodePackage: EpisodePackageV2 = {
      ...args.episodePackage,
      thumbnail: {
        ...args.episodePackage.thumbnail,
        primary_version_id: versionId,
      },
    };

    const saved = await args.persistThumbnailEpisodePackage(
      nextEpisodePackage,
      "hearth.thumbnail.primary.set.v1",
      { version_id: versionId },
    );
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved) return;
    args.setSelectedThumbnailConceptId(version.concept_id);
    args.setSelectedThumbnailVersionId(versionId);
  }, [args]);

  const onSelectThumbnailTitle = useCallback((titleId: string): void => {
    args.setSelectedThumbnailTitleId(titleId);
    args.setThumbnailPairingError(null);
  }, [args]);

  const onSelectThumbnailVersion = useCallback((versionId: string): void => {
    const version = args.thumbnailVersions.find((entry) => entry.id === versionId) ?? null;
    if (version) {
      args.setSelectedThumbnailConceptId(version.concept_id);
    }
    args.setSelectedThumbnailVersionId(versionId);
    args.setThumbnailPairingError(null);
  }, [args]);

  const onCreateLaunchVariant = useCallback((): void => {
    args.setSelectedLaunchVariantId(null);
    args.setThumbnailPairingError(null);
  }, [args]);

  const onSelectLaunchVariant = useCallback((variantId: string): void => {
    const variant = args.launchVariants.find((entry) => entry.id === variantId) ?? null;
    if (!variant) return;
    const version = args.thumbnailVersions.find((entry) => entry.id === variant.thumbnail_version_id) ?? null;
    if (version) {
      args.setSelectedThumbnailConceptId(version.concept_id);
      args.setSelectedThumbnailVersionId(version.id);
    }
    args.setSelectedThumbnailTitleId(variant.title_id);
    args.setSelectedLaunchVariantId(variant.id);
    args.setThumbnailPairingError(null);
  }, [args]);

  const onSaveLaunchVariant = useCallback(async () => {
    if (args.isThumbnailConceptSaving || args.isThumbnailGenerating || args.isThumbnailUploading) return;
    if (!args.episodePackage) return;

    const titleId = args.selectedThumbnailTitleId?.trim() ?? "";
    const versionId = args.selectedThumbnailVersionId?.trim() ?? "";
    if (!titleId || !versionId) {
      args.setThumbnailPairingError("Choose both a title and a thumbnail version before saving a launch variant.");
      return;
    }

    const title = args.metadataTitlesDraft.find((entry) => entry.id === titleId) ?? null;
    if (!title || !title.text.trim()) {
      args.setThumbnailPairingError("Choose a populated title before saving a launch variant.");
      return;
    }

    const version = args.thumbnailVersions.find((entry) => entry.id === versionId) ?? null;
    if (!version) {
      args.setThumbnailPairingError("Select a valid thumbnail version before saving a launch variant.");
      return;
    }

    const existingVariant = args.selectedLaunchVariantId
      ? args.episodePackage.launch_variants.find((entry) => entry.id === args.selectedLaunchVariantId) ?? null
      : null;
    const nowIso = new Date().toISOString();
    const status = args.launchVariantStatusDraft;
    const notes = args.launchVariantNotesDraft.trim() || null;
    const lastTestedAt = status === "tested" || status === "winner"
      ? existingVariant?.last_tested_at ?? nowIso
      : existingVariant?.last_tested_at ?? null;
    const winnerSelectedAt = status === "winner"
      ? existingVariant?.winner_selected_at ?? nowIso
      : null;
    const nextVariant: EpisodeLaunchVariant = existingVariant
      ? {
          ...existingVariant,
          title_id: titleId,
          thumbnail_version_id: versionId,
          updated_at: nowIso,
          status,
          notes,
          last_tested_at: lastTestedAt,
          winner_selected_at: winnerSelectedAt,
        }
      : {
          id: args.createThumbnailClientId("launch-variant"),
          title_id: titleId,
          thumbnail_version_id: versionId,
          created_at: nowIso,
          updated_at: nowIso,
          status,
          notes,
          last_tested_at: lastTestedAt,
          winner_selected_at: winnerSelectedAt,
        };

    const nextEpisodePackage: EpisodePackageV2 = {
      ...args.episodePackage,
      launch_variants: existingVariant
        ? args.episodePackage.launch_variants.map((entry) => (entry.id === nextVariant.id ? nextVariant : entry))
        : [...args.episodePackage.launch_variants, nextVariant],
    };

    args.setThumbnailPairingError(null);
    const operation = args.operationAuthority.begin("thumbnail.launch-variant.save");
    const saved = await args.persistThumbnailEpisodePackage(
      nextEpisodePackage,
      existingVariant ? "hearth.launch.variant.updated.v1" : "hearth.launch.variant.created.v1",
      {
        launch_variant_id: nextVariant.id,
        title_id: titleId,
        thumbnail_version_id: versionId,
        status,
      },
    );
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved) {
      args.setThumbnailPairingError("Unable to save launch variant.");
      return;
    }
    args.setSelectedLaunchVariantId(nextVariant.id);
  }, [args]);

  return {
    onCreateThumbnailConcept,
    onSaveSelectedThumbnailConcept,
    onDeleteSelectedThumbnailConcept,
    onSetPrimaryThumbnailVersion,
    onSelectThumbnailTitle,
    onSelectThumbnailVersion,
    onCreateLaunchVariant,
    onSelectLaunchVariant,
    onSaveLaunchVariant,
  };
}
