import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

export type UseHammerWorkspaceShellSourceDeskPreviewsArgs = {
  workpieceId: string;
  previewPaths: string[];
  requestedPreviewPathCount: number;
  fetchKey: string;
  maxItems: number;
  concurrency: number;
  paused?: boolean;

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

function resolveSourceDeskPreviewDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Boolean((import.meta as any)?.env?.DEV)) return true;
  } catch {
    // ignore
  }
  try {
    const runtime = window as unknown as Record<string, unknown>;
    return runtime.__forgeHammerDebugImagePreviews__ === true;
  } catch {
    return false;
  }
}

export function useHammerWorkspaceShellSourceDeskPreviews(args: UseHammerWorkspaceShellSourceDeskPreviewsArgs): void {
  useEffect(() => {
    if (args.paused) {
      return () => {
        // keep existing previews mounted while paused; do not start new fetches.
      };
    }

    let active = true;
    const nextUrls: Record<string, string> = {};
    const nextFailures: Record<string, true> = {};
    const previewPaths = args.previewPaths;
    const debugEnabled = resolveSourceDeskPreviewDebugEnabled();
    const startedAt = typeof performance !== "undefined" ? performance.now() : null;

    if (args.requestedPreviewPathCount > args.maxItems) {
      console.info("Hammer Source Desk preview load capped", {
        workpieceId: args.workpieceId,
        requested: args.requestedPreviewPathCount,
        loaded: previewPaths.length,
      });
    }
    // eslint-disable-next-line no-console
    console.info("[Hammer][SourceDeskPreview] start", {
      workpieceId: args.workpieceId,
      requested: args.requestedPreviewPathCount,
      loaded: previewPaths.length,
      concurrency: args.concurrency,
      maxItems: args.maxItems,
    });

    async function loadPreviewBatch(paths: string[]): Promise<void> {
      await Promise.all(paths.map(async (path) => {
        try {
          if (debugEnabled) {
            // eslint-disable-next-line no-console
            console.debug("[Hammer][SourceDeskPreview] fetching", { workpieceId: args.workpieceId, path });
          }
          const url = await args.loadWorkpieceMediaPreviewUrl({
            workpieceId: args.workpieceId,
            path,
            surface: "source_desk_preview",
          });
          nextUrls[path] = url;
          if (debugEnabled) {
            // eslint-disable-next-line no-console
            console.debug("[Hammer][SourceDeskPreview] ok", { workpieceId: args.workpieceId, path });
          }
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
        if (debugEnabled) {
          // eslint-disable-next-line no-console
          console.info("[Hammer][SourceDeskPreview] batch", {
            workpieceId: args.workpieceId,
            from: index,
            to: Math.min(previewPaths.length, index + args.concurrency),
            total: previewPaths.length,
          });
        }
        await loadPreviewBatch(batch);
      }

      if (!active) {
        for (const url of Object.values(nextUrls)) URL.revokeObjectURL(url);
        return;
      }
      const finishedAt = typeof performance !== "undefined" ? performance.now() : null;
      const elapsedMs = (startedAt != null && finishedAt != null) ? Math.round(finishedAt - startedAt) : null;
      // eslint-disable-next-line no-console
      console.info("[Hammer][SourceDeskPreview] done", {
        workpieceId: args.workpieceId,
        ok: Object.keys(nextUrls).length,
        failed: Object.keys(nextFailures).length,
        elapsed_ms: elapsedMs,
      });
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
  }, [args.workpieceId, args.fetchKey, args.paused]);

  useEffect(() => () => {
    for (const url of Object.values(args.previewUrls)) URL.revokeObjectURL(url);
  }, [args.previewUrls]);
}
