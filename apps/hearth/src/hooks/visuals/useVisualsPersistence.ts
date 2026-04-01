import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  ensureBrollPlanV2,
  ensureLaunchVariantsV2,
  ensureReferenceClipPlanV2,
  type EpisodeBrollPlan,
  type EpisodeImageMapEntry,
  type EpisodeMediaMap,
  type EpisodePackageV2,
  type EpisodeReferenceClipPlan,
  type EpisodeSpokenBeat,
} from "../../lib/episode-package-v2";
import { replaceEpisodePackageImageMap } from "../../lib/hearth-episode-package-image-map";
import { saveEpisodePackageForWorkpiece } from "../../lib/hearth-thumbnail-api";
import { saveWorkpieceImageMap } from "../../lib/hearth-image-map-repo";
import { syncMediaMapImageEntriesFromImageMap } from "../../lib/hearth-media-map-sync";
import { saveWorkpieceEpisodeMediaMap } from "../../lib/hearth-media-map-repo";

type UseVisualsPersistenceArgs = {
  episodePackage: EpisodePackageV2 | null;
  workpieceId: string | null;
  workspaceId: string | null;
  imageMapMetadataUpdatedAt: string | null;
  setEpisodePackage: Dispatch<SetStateAction<EpisodePackageV2 | null>>;
  setImageMapMetadataUpdatedAt: (next: string | null) => void;
  setThumbnailGenerateError: (next: string | null) => void;
};

export function useVisualsPersistence(args: UseVisualsPersistenceArgs) {
  const persistThumbnailEpisodePackage = useCallback(async (
    nextEpisodePackage: EpisodePackageV2,
    eventName: string,
    eventPayload: Record<string, unknown>,
  ): Promise<EpisodePackageV2 | null> => {
    const episodeId = args.workpieceId?.trim() ?? "";
    const workspace = args.workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      args.setThumbnailGenerateError("Select an Episode before editing visuals.");
      return null;
    }
    const normalizedEpisodePackage = ensureLaunchVariantsV2(nextEpisodePackage);
    const saved = await saveEpisodePackageForWorkpiece({
      workpieceId: episodeId,
      workspaceId: workspace,
      episodePackage: normalizedEpisodePackage,
      eventName,
      eventPayload,
    });
    if (!saved.ok) {
      args.setThumbnailGenerateError(saved.error);
      return null;
    }
    args.setEpisodePackage(saved.episodePackage);
    args.setImageMapMetadataUpdatedAt(saved.metadataUpdatedAt);
    return saved.episodePackage;
  }, [args]);

  const persistImageMapEntries = useCallback(async (input: {
    entries: EpisodeImageMapEntry[];
    spokenBeats?: EpisodeSpokenBeat[] | null;
    expectedMetadataUpdatedAt?: string | null;
    skipOptimisticConflictCheck?: boolean;
  }): Promise<
    | { ok: true; episodePackage: EpisodePackageV2; metadataUpdatedAt: string | null }
    | { ok: false; error: string }
  > => {
    if (!args.episodePackage) {
      return {
        ok: false,
        error: "Unable to save image map for this episode.",
      };
    }

    const workspace = args.workspaceId?.trim() ?? "";
    const workpiece = args.workpieceId?.trim() ?? "";
    if (!workspace || !workpiece) {
      return {
        ok: false,
        error: "Workspace or workpiece is missing.",
      };
    }

    const expectedMetadataUpdatedAt = input.skipOptimisticConflictCheck
      ? undefined
      : (typeof input.expectedMetadataUpdatedAt !== "undefined"
        ? input.expectedMetadataUpdatedAt
        : args.imageMapMetadataUpdatedAt);

    const saved = await saveWorkpieceImageMap({
      workpieceId: workpiece,
      workspaceId: workspace,
      entries: input.entries,
      spokenBeats: input.spokenBeats ?? args.episodePackage.spoken_beats,
      ...(typeof expectedMetadataUpdatedAt !== "undefined"
        ? { expectedMetadataUpdatedAt }
        : {}),
    });

    if (!saved.ok) {
      if (saved.reason === "conflict" && saved.latest) {
        const latest = saved.latest;
        const retry = await saveWorkpieceImageMap({
          workpieceId: workpiece,
          workspaceId: workspace,
          entries: input.entries,
          spokenBeats: input.spokenBeats ?? args.episodePackage.spoken_beats,
          expectedMetadataUpdatedAt: latest.metadataUpdatedAt,
        });
        if (retry.ok) {
          const retriedEpisodePackage = replaceEpisodePackageImageMap(
            args.episodePackage,
            retry.imageMap.entries,
            input.spokenBeats ?? args.episodePackage.spoken_beats,
          );
          const retriedWithMediaMap = retriedEpisodePackage.media_map.entries.length > 0
            ? {
              ...retriedEpisodePackage,
              media_map: syncMediaMapImageEntriesFromImageMap({
                mediaMap: retriedEpisodePackage.media_map,
                imageEntries: retry.imageMap.entries,
              }),
            }
            : retriedEpisodePackage;
          args.setEpisodePackage(retriedWithMediaMap);
          args.setImageMapMetadataUpdatedAt(retry.imageMap.metadataUpdatedAt);
          return {
            ok: true,
            episodePackage: retriedWithMediaMap,
            metadataUpdatedAt: retry.imageMap.metadataUpdatedAt,
          };
        }
        args.setEpisodePackage((prev) => (
          prev
            ? {
              ...replaceEpisodePackageImageMap(prev, latest.entries, latest.spokenBeats),
              media_map: syncMediaMapImageEntriesFromImageMap({
                mediaMap: prev.media_map,
                imageEntries: latest.entries,
              }),
            }
            : prev
        ));
        args.setImageMapMetadataUpdatedAt(latest.metadataUpdatedAt);
        return {
          ok: false,
          error: "Image map changed on another client. Latest entries have been reloaded.",
        };
      }

      return {
        ok: false,
        error: saved.reason === "invalid_response"
          ? "Image map save returned an invalid response."
          : saved.error ?? "Unable to save image map.",
      };
    }

    const nextEpisodePackage = replaceEpisodePackageImageMap(
      args.episodePackage,
      saved.imageMap.entries,
      input.spokenBeats ?? args.episodePackage.spoken_beats,
    );
    const nextEpisodePackageWithMediaMap = nextEpisodePackage.media_map.entries.length > 0
      ? {
        ...nextEpisodePackage,
        media_map: syncMediaMapImageEntriesFromImageMap({
          mediaMap: nextEpisodePackage.media_map,
          imageEntries: saved.imageMap.entries,
        }),
      }
      : nextEpisodePackage;
    args.setEpisodePackage(nextEpisodePackageWithMediaMap);
    args.setImageMapMetadataUpdatedAt(saved.imageMap.metadataUpdatedAt);
    return {
      ok: true,
      episodePackage: nextEpisodePackageWithMediaMap,
      metadataUpdatedAt: saved.imageMap.metadataUpdatedAt,
    };
  }, [args]);

  const persistBrollPlan = useCallback(async (input: {
    plan: EpisodeBrollPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }): Promise<
    | { ok: true; episodePackage: EpisodePackageV2 }
    | { ok: false; error: string }
  > => {
    const baseEpisodePackage = input.baseEpisodePackage ?? args.episodePackage;
    if (!baseEpisodePackage) {
      return { ok: false, error: "Unable to save B-roll plan for this episode." };
    }
    const episodeId = args.workpieceId?.trim() ?? "";
    const workspace = args.workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      return { ok: false, error: "Workspace or workpiece is missing." };
    }
    const nextEpisodePackage = ensureBrollPlanV2({
      ...baseEpisodePackage,
      broll_plan: {
        ...input.plan,
        workpiece_id: episodeId,
      },
    });
    const saved = await saveEpisodePackageForWorkpiece({
      workpieceId: episodeId,
      workspaceId: workspace,
      episodePackage: ensureLaunchVariantsV2(nextEpisodePackage),
      eventName: input.eventName,
      eventPayload: input.eventPayload,
    });
    if (!saved.ok) {
      return { ok: false, error: saved.error };
    }
    args.setEpisodePackage(saved.episodePackage);
    args.setImageMapMetadataUpdatedAt(saved.metadataUpdatedAt);
    return { ok: true, episodePackage: saved.episodePackage };
  }, [args]);

  const persistMediaMap = useCallback(async (input: {
    map: EpisodeMediaMap;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }): Promise<
    | { ok: true; episodePackage: EpisodePackageV2 }
    | { ok: false; error: string }
  > => {
    const baseEpisodePackage = input.baseEpisodePackage ?? args.episodePackage;
    if (!baseEpisodePackage) {
      return { ok: false, error: "Unable to save Episode Media Map for this episode." };
    }
    const episodeId = args.workpieceId?.trim() ?? "";
    const workspace = args.workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      return { ok: false, error: "Workspace or workpiece is missing." };
    }
    const nextEpisodePackage: EpisodePackageV2 = {
      ...baseEpisodePackage,
      media_map: {
        ...input.map,
        workpiece_id: episodeId,
      },
    };
    const savedEpisode = await saveEpisodePackageForWorkpiece({
      workpieceId: episodeId,
      workspaceId: workspace,
      episodePackage: ensureLaunchVariantsV2(nextEpisodePackage),
      eventName: input.eventName,
      eventPayload: input.eventPayload,
    });
    if (!savedEpisode.ok) {
      return { ok: false, error: savedEpisode.error };
    }
    const mediaMapSaved = await saveWorkpieceEpisodeMediaMap({
      workpieceId: episodeId,
      mediaMap: savedEpisode.episodePackage.media_map,
      eventName: "hearth.media_map.artifact.saved.v1",
      eventPayload: {
        entry_count: savedEpisode.episodePackage.media_map.entries.length,
        script_version_id: savedEpisode.episodePackage.media_map.script_version_id,
      },
    });
    if (!mediaMapSaved.ok) {
      return { ok: false, error: mediaMapSaved.error };
    }
    args.setEpisodePackage(savedEpisode.episodePackage);
    args.setImageMapMetadataUpdatedAt(savedEpisode.metadataUpdatedAt);
    return { ok: true, episodePackage: savedEpisode.episodePackage };
  }, [args]);

  const persistReferenceClipPlan = useCallback(async (input: {
    plan: EpisodeReferenceClipPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }): Promise<
    | { ok: true; episodePackage: EpisodePackageV2 }
    | { ok: false; error: string }
  > => {
    const baseEpisodePackage = input.baseEpisodePackage ?? args.episodePackage;
    if (!baseEpisodePackage) {
      return { ok: false, error: "Unable to save Reference Clip plan for this episode." };
    }
    const episodeId = args.workpieceId?.trim() ?? "";
    const workspace = args.workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      return { ok: false, error: "Workspace or workpiece is missing." };
    }
    const nextEpisodePackage = ensureReferenceClipPlanV2({
      ...baseEpisodePackage,
      cdc_plan: {
        ...input.plan,
        workpiece_id: episodeId,
      },
    });
    const saved = await saveEpisodePackageForWorkpiece({
      workpieceId: episodeId,
      workspaceId: workspace,
      episodePackage: ensureLaunchVariantsV2(nextEpisodePackage),
      eventName: input.eventName,
      eventPayload: input.eventPayload,
    });
    if (!saved.ok) {
      return { ok: false, error: saved.error };
    }
    args.setEpisodePackage(saved.episodePackage);
    args.setImageMapMetadataUpdatedAt(saved.metadataUpdatedAt);
    return { ok: true, episodePackage: saved.episodePackage };
  }, [args]);

  return {
    persistThumbnailEpisodePackage,
    persistImageMapEntries,
    persistBrollPlan,
    persistMediaMap,
    persistReferenceClipPlan,
  };
}
