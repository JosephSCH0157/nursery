import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

export type UseHammerWorkspaceShellSourceDeskPreviewsArgs = {
  workpieceId: string;
  previewPaths: string[];
  requestedPreviewPathCount: number;
  fetchKey: string;
  maxItems: number;
  concurrency: number;

  loadWorkpieceMediaPreviewUrl: (args: { workpieceId: string; path: string; surface: any }) => Promise<string>;
  readHammerMediaPreviewErrorDiagnostics: (error: unknown) => null | {
    originalPath?: string | null;
    normalizedPath?: string | null;
    status?: number | null;
  };
  normalizeWorkpieceRelativePath: (workpieceId: string, path: string) => string;

  setPreviewUrls: Dispatch<SetStateAction<Record<string, string>>>;
  setPreviewFailures: Dispatch<SetStateAction<Record<string, true>>>;
  previewUrls: Record<string, string>;
};

export function useHammerWorkspaceShellSourceDeskPreviews(args: UseHammerWorkspaceShellSourceDeskPreviewsArgs): void {
  useEffect(() => {
    let active = true;
    const nextUrls: Record<string, string> = {};
    const nextFailures: Record<string, true> = {};
    const previewPaths = args.previewPaths;

    if (args.requestedPreviewPathCount > args.maxItems) {
      console.info("Hammer Source Desk preview load capped", {
        workpieceId: args.workpieceId,
        requested: args.requestedPreviewPathCount,
        loaded: previewPaths.length,
      });
    }

    async function loadPreviewBatch(paths: string[]): Promise<void> {
      await Promise.all(paths.map(async (path) => {
        try {
          const url = await args.loadWorkpieceMediaPreviewUrl({
            workpieceId: args.workpieceId,
            path,
            surface: "source_desk_preview",
          });
          nextUrls[path] = url;
        } catch (error) {
          nextFailures[path] = true;
          const diagnostics = args.readHammerMediaPreviewErrorDiagnostics(error);
          console.warn("Hammer Source Desk preview unavailable", {
            workpieceId: args.workpieceId,
            originalPath: diagnostics?.originalPath ?? path,
            normalizedPath: diagnostics?.normalizedPath
              ?? args.normalizeWorkpieceRelativePath(args.workpieceId, path),
            status: diagnostics?.status ?? null,
            error,
          });
        }
      }));
    }

    void (async () => {
      for (let index = 0; index < previewPaths.length; index += args.concurrency) {
        if (!active) break;
        const batch = previewPaths.slice(index, index + args.concurrency);
        await loadPreviewBatch(batch);
      }

      if (!active) {
        for (const url of Object.values(nextUrls)) URL.revokeObjectURL(url);
        return;
      }
      args.setPreviewUrls((previous) => {
        const previousKeys = Object.keys(previous);
        const nextKeys = Object.keys(nextUrls);
        const unchanged = previousKeys.length === nextKeys.length
          && nextKeys.every((key) => previous[key] === nextUrls[key]);
        if (unchanged) return previous;
        for (const url of Object.values(previous)) URL.revokeObjectURL(url);
        return nextUrls;
      });
      args.setPreviewFailures((previous) => {
        const previousKeys = Object.keys(previous);
        const nextKeys = Object.keys(nextFailures);
        const unchanged = previousKeys.length === nextKeys.length
          && nextKeys.every((key) => previous[key] === nextFailures[key]);
        return unchanged ? previous : nextFailures;
      });
    })();

    return () => {
      active = false;
    };
  }, [args.workpieceId, args.fetchKey]);

  useEffect(() => () => {
    for (const url of Object.values(args.previewUrls)) URL.revokeObjectURL(url);
  }, [args.previewUrls]);
}
