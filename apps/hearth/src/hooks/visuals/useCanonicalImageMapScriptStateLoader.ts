import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { EpisodeImageMapEntry } from "../../lib/episode-package-v2";

type CanonicalImageMapScriptState = {
  status: "idle" | "loading" | "ready" | "error";
  text: string | null;
  source: "primary_script" | "saved_draft" | null;
  includesUnsavedLocalEdits: boolean;
  error: string | null;
};

type UseCanonicalImageMapScriptStateLoaderArgs = {
  workpieceId: string | null;
  selectedImageMapEntry: EpisodeImageMapEntry | null;
  setCanonicalImageMapScriptState: Dispatch<SetStateAction<CanonicalImageMapScriptState>>;
  readCanonicalScriptForImageMapGeneration: () => Promise<
    | {
        ok: true;
        text: string;
        source: "primary_script" | "saved_draft";
        includesUnsavedLocalEdits: boolean;
      }
    | {
        ok: false;
        message: string;
      }
  >;
};

export function useCanonicalImageMapScriptStateLoader(args: UseCanonicalImageMapScriptStateLoaderArgs) {
  const readCanonicalScriptRef = useRef(args.readCanonicalScriptForImageMapGeneration);

  useEffect(() => {
    readCanonicalScriptRef.current = args.readCanonicalScriptForImageMapGeneration;
  }, [args.readCanonicalScriptForImageMapGeneration]);

  useEffect(() => {
    let cancelled = false;

    if (!args.selectedImageMapEntry || !args.workpieceId) {
      args.setCanonicalImageMapScriptState({
        status: "idle",
        text: null,
        source: null,
        includesUnsavedLocalEdits: false,
        error: null,
      });
      return;
    }

    args.setCanonicalImageMapScriptState((current) => ({
      status: "loading",
      text: current.text,
      source: current.source,
      includesUnsavedLocalEdits: current.includesUnsavedLocalEdits,
      error: null,
    }));

    void readCanonicalScriptRef.current().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        args.setCanonicalImageMapScriptState({
          status: "error",
          text: null,
          source: null,
          includesUnsavedLocalEdits: false,
          error: result.message,
        });
        return;
      }
      args.setCanonicalImageMapScriptState({
        status: "ready",
        text: result.text,
        source: result.source,
        includesUnsavedLocalEdits: result.includesUnsavedLocalEdits,
        error: null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    args.selectedImageMapEntry?.id,
    args.setCanonicalImageMapScriptState,
    args.workpieceId,
  ]);
}
