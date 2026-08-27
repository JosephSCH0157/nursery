import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  deriveMediaMapConversationFromScript,
  type MediaMapConversationSeed,
} from "../../lib/hearth-media-map-conversation";
import type { EpisodePackageV2 } from "../../lib/episode-package-v2";

type UseMediaMapConversationBootstrapArgs = {
  activeWorkpieceTab: string;
  episodePackage: EpisodePackageV2 | null;
  mediaMapEntriesLength: number;
  mediaMapConversationState: "idle" | "loading" | "ready" | "error";
  setMediaMapConversationSeed: Dispatch<SetStateAction<MediaMapConversationSeed | null>>;
  setMediaMapConversationState: Dispatch<SetStateAction<"idle" | "loading" | "ready" | "error">>;
  setMediaMapConversationError: Dispatch<SetStateAction<string | null>>;
  readCanonicalScriptForImageMapGeneration: () => Promise<
    | {
        ok: true;
        text: string;
        source: "approved_script";
        includesUnsavedLocalEdits: boolean;
      }
    | {
        ok: false;
        message: string;
      }
  >;
};

export function useMediaMapConversationBootstrap(args: UseMediaMapConversationBootstrapArgs) {
  useEffect(() => {
    if (!args.episodePackage) return;
    if (args.activeWorkpieceTab !== "visuals") return;
    if (args.mediaMapEntriesLength > 0) return;
    if (args.mediaMapConversationState !== "idle") return;
    let cancelled = false;
    args.setMediaMapConversationState("loading");
    args.setMediaMapConversationError(null);
    void args.readCanonicalScriptForImageMapGeneration().then((result) => {
      if (cancelled) return;
      args.setMediaMapConversationSeed(deriveMediaMapConversationFromScript(result.ok ? result.text : null));
      args.setMediaMapConversationError(result.ok ? null : result.message);
      args.setMediaMapConversationState("ready");
    }).catch((error) => {
      if (cancelled) return;
      args.setMediaMapConversationSeed(deriveMediaMapConversationFromScript(null));
      args.setMediaMapConversationError(error instanceof Error ? error.message : "Unable to read the current script for visual planning.");
      args.setMediaMapConversationState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [
    args.activeWorkpieceTab,
    args.episodePackage,
    args.mediaMapConversationState,
    args.mediaMapEntriesLength,
    args.readCanonicalScriptForImageMapGeneration,
    args.setMediaMapConversationError,
    args.setMediaMapConversationSeed,
    args.setMediaMapConversationState,
  ]);
}
