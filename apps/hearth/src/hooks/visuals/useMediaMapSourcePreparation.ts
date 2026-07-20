import { useCallback } from "react";
import { isBulletOutlineScript } from "../../lib/hearth-spoken-beats";
import { buildBrollPlanFromScript } from "../../lib/hearth-broll-plan";
import { resolveImageMapEntriesForMediaMapBootstrap } from "../../lib/hearth-media-map-bootstrap";
import { resolveReferenceClipPlanForMediaMapBootstrap } from "../../lib/hearth-reference-clip-bootstrap";
import type {
  EpisodePackageV2,
  EpisodeReferenceClipPlan,
} from "../../lib/episode-package-v2";
import type { MediaMapGenerationScope } from "../../lib/hearth-media-map-conversation";
import {
  deriveFullMediaBudgetPolicy,
  type FullMediaBudgetPolicy,
} from "../../lib/hearth-media-map-builder";

type CanonicalScriptResult =
  | {
      ok: true;
      text: string;
      source: "primary_script" | "saved_draft";
      includesUnsavedLocalEdits: boolean;
    }
  | {
      ok: false;
      message: string;
    };

type PersistImageMapEntriesResult =
  | { ok: true; episodePackage: EpisodePackageV2; metadataUpdatedAt: string | null }
  | { ok: false; error: string };

type PersistBrollPlanResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; error: string };

type PersistReferenceClipPlanResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; error: string };

type UseMediaMapSourcePreparationArgs = {
  episodePackage: EpisodePackageV2 | null;
  workpieceId: string | null;
  effectiveComposeSetupMode:
    | "outline_by_speaker"
    | "full_script_single_speaker"
    | "full_script_multi_speaker"
    | "full_script_all_speakers"
    | null;
  readCanonicalScriptForImageMapGeneration: () => Promise<CanonicalScriptResult>;
  persistImageMapEntries: (args: {
    entries: EpisodePackageV2["image_map"]["entries"];
    spokenBeats?: EpisodePackageV2["spoken_beats"] | null;
  }) => Promise<PersistImageMapEntriesResult>;
  persistBrollPlan: (args: {
    plan: EpisodePackageV2["broll_plan"];
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }) => Promise<PersistBrollPlanResult>;
  persistReferenceClipPlan: (args: {
    plan: EpisodeReferenceClipPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }) => Promise<PersistReferenceClipPlanResult>;
};

export function useMediaMapSourcePreparation(args: UseMediaMapSourcePreparationArgs) {
  const prepareSourceEpisodePackageForMediaMapGeneration = useCallback(async (scope: MediaMapGenerationScope): Promise<{
    ok: true;
    episodePackage: EpisodePackageV2;
    bootstrappedImageCount: number;
    bootstrappedBrollCount: number;
    bootstrappedReferenceClipCount: number;
    budgetPolicy: FullMediaBudgetPolicy;
  } | {
    ok: false;
    error: string;
  }> => {
    if (!args.episodePackage) {
      return { ok: false, error: "Select an Episode before generating visuals." };
    }
    const shouldIncludeBroll = scope === "images_broll" || scope === "full_media_plan";
    const shouldIncludeReferenceClips = scope === "images_reference_clips" || scope === "full_media_plan";
    let sourceEpisodePackage = args.episodePackage;
    let bootstrappedImageCount = 0;
    let bootstrappedBrollCount = 0;
    let bootstrappedReferenceClipCount = 0;
    let canonicalScriptCache: CanonicalScriptResult | null = null;

    const ensureCanonicalScript = async () => {
      if (canonicalScriptCache) return canonicalScriptCache;
      canonicalScriptCache = await args.readCanonicalScriptForImageMapGeneration();
      return canonicalScriptCache;
    };

    const durationScript = scope === "full_media_plan"
      ? await ensureCanonicalScript()
      : null;
    if (scope === "full_media_plan" && durationScript && !durationScript.ok) {
      return { ok: false, error: durationScript.message };
    }
    const budgetPolicy = deriveFullMediaBudgetPolicy({
      scriptText: durationScript?.ok ? durationScript.text : null,
    });

    if (sourceEpisodePackage.image_map.entries.length === 0) {
      const canonicalScript = await ensureCanonicalScript();
      if (canonicalScript.ok) {
        const bootstrap = resolveImageMapEntriesForMediaMapBootstrap({
          currentEntries: sourceEpisodePackage.image_map.entries,
          currentSpokenBeats: sourceEpisodePackage.spoken_beats,
          scriptText: canonicalScript.text,
          preferBeatAnchors: args.effectiveComposeSetupMode === "outline_by_speaker" || isBulletOutlineScript(canonicalScript.text),
        });
        if (bootstrap.seededFromScript && bootstrap.entries.length > 0) {
          const seeded = await args.persistImageMapEntries({
            entries: bootstrap.entries,
            spokenBeats: bootstrap.spokenBeats,
          });
          if (!seeded.ok) {
            return { ok: false, error: seeded.error };
          }
          sourceEpisodePackage = seeded.episodePackage;
          bootstrappedImageCount = bootstrap.entries.length;
        }
      }
    }

    if (shouldIncludeBroll && sourceEpisodePackage.broll_plan.beats.length === 0) {
      const canonicalScript = await ensureCanonicalScript();
      const episodeId = args.workpieceId?.trim();
      if (canonicalScript.ok && episodeId) {
        const plan = buildBrollPlanFromScript({
          workpieceId: episodeId,
          scriptText: canonicalScript.text,
          previousPlan: sourceEpisodePackage.broll_plan,
        });
        if (plan.beats.length > 0) {
          const seeded = await args.persistBrollPlan({
            plan,
            eventName: "hearth.broll_plan.bootstrapped_from_media_map.v1",
            eventPayload: {
              beat_count: plan.beats.length,
              source: canonicalScript.source,
            },
            baseEpisodePackage: sourceEpisodePackage,
          });
          if (!seeded.ok) {
            return { ok: false, error: seeded.error };
          }
          sourceEpisodePackage = seeded.episodePackage;
          bootstrappedBrollCount = plan.beats.length;
        }
      }
    }

    if (shouldIncludeReferenceClips && sourceEpisodePackage.cdc_plan.entries.length === 0) {
      const episodeId = args.workpieceId?.trim();
      if (episodeId) {
        const bootstrap = resolveReferenceClipPlanForMediaMapBootstrap({
          workpieceId: episodeId,
          currentEntries: sourceEpisodePackage.cdc_plan.entries,
          imageMapEntries: sourceEpisodePackage.image_map.entries,
        });
        if (bootstrap.seededFromImageMap && bootstrap.entries.length > 0) {
          const plan: EpisodeReferenceClipPlan = {
            ...sourceEpisodePackage.cdc_plan,
            workpiece_id: episodeId,
            version: Math.max(1, sourceEpisodePackage.cdc_plan.version + 1),
            entries: bootstrap.entries,
            generated_at: new Date().toISOString(),
          };
          const seeded = await args.persistReferenceClipPlan({
            plan,
            eventName: "hearth.cdc_plan.bootstrapped_from_image_map.v1",
            eventPayload: {
              entry_count: bootstrap.entries.length,
              source: "image_map_explanation_beats",
            },
            baseEpisodePackage: sourceEpisodePackage,
          });
          if (!seeded.ok) {
            return { ok: false, error: seeded.error };
          }
          sourceEpisodePackage = seeded.episodePackage;
          bootstrappedReferenceClipCount = bootstrap.entries.length;
        }
      }
    }

    return {
      ok: true,
      episodePackage: sourceEpisodePackage,
      bootstrappedImageCount,
      bootstrappedBrollCount,
      bootstrappedReferenceClipCount,
      budgetPolicy,
    };
  }, [args]);

  return { prepareSourceEpisodePackageForMediaMapGeneration };
}
