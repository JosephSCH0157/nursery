import { useEffect, useRef } from "react";
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
  previewFailures: Record<string, true>;
  previewUrls: Record<string, string>;
};

function resolveSourceDeskPreviewDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const runtime = window as unknown as Record<string, unknown>;
    return runtime.__forgeHammerDebugImagePreviews__ === true;
  } catch {
    return false;
  }
}

export function useHammerWorkspaceShellSourceDeskPreviews(args: UseHammerWorkspaceShellSourceDeskPreviewsArgs): void {
  const latestArgsRef = useRef(args);
  const previewUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    latestArgsRef.current = args;
  }, [args]);

  useEffect(() => {
    const currentArgs = latestArgsRef.current;

    if (currentArgs.paused) {
      return () => {
        // keep existing previews mounted while paused; do not start new fetches.
      };
    }

    let active = true;
    const nextUrls: Record<string, string> = {};
    const nextFailures: Record<string, true> = {};
    const previewPaths = currentArgs.previewPaths.filter((path) => (
      !currentArgs.previewUrls[path] && !currentArgs.previewFailures[path]
    ));
    const debugEnabled = resolveSourceDeskPreviewDebugEnabled();
    const startedAt = typeof performance !== "undefined" ? performance.now() : null;

    if (previewPaths.length === 0) {
      return () => {
        active = false;
      };
    }

    if (debugEnabled && currentArgs.requestedPreviewPathCount > currentArgs.maxItems) {
      console.info("Hammer Source Desk preview load capped", {
        workpieceId: currentArgs.workpieceId,
        requested: currentArgs.requestedPreviewPathCount,
        loaded: previewPaths.length,
      });
    }
    if (debugEnabled) {
      // eslint-disable-next-line no-console
      console.info("[Hammer][SourceDeskPreview] start", {
        workpieceId: currentArgs.workpieceId,
        requested: currentArgs.requestedPreviewPathCount,
        loaded: previewPaths.length,
        concurrency: currentArgs.concurrency,
        maxItems: currentArgs.maxItems,
      });
    }

    async function loadPreviewBatch(paths: string[]): Promise<void> {
      await Promise.all(paths.map(async (path) => {
        try {
          if (debugEnabled) {
            // eslint-disable-next-line no-console
            console.debug("[Hammer][SourceDeskPreview] fetching", { workpieceId: currentArgs.workpieceId, path });
          }
          const url = await currentArgs.loadWorkpieceMediaPreviewUrl({
            workpieceId: currentArgs.workpieceId,
            path,
            surface: "source_desk_preview",
          });
          nextUrls[path] = url;
          if (debugEnabled) {
            // eslint-disable-next-line no-console
            console.debug("[Hammer][SourceDeskPreview] ok", { workpieceId: currentArgs.workpieceId, path });
          }
        } catch (error) {
          nextFailures[path] = true;
          const diagnostics = currentArgs.readHammerMediaPreviewErrorDiagnostics(error);
          console.warn("Hammer Source Desk preview unavailable", {
            workpieceId: currentArgs.workpieceId,
            originalPath: diagnostics?.originalPath ?? path,
            normalizedPath: diagnostics?.normalizedPath
              ?? currentArgs.normalizeWorkpieceRelativePath(currentArgs.workpieceId, path),
            status: diagnostics?.status ?? null,
            error,
          });
        }
      }));
    }

    void (async () => {
      for (let index = 0; index < previewPaths.length; index += currentArgs.concurrency) {
        if (!active) break;
        const batch = previewPaths.slice(index, index + currentArgs.concurrency);
        if (debugEnabled) {
          // eslint-disable-next-line no-console
          console.info("[Hammer][SourceDeskPreview] batch", {
            workpieceId: currentArgs.workpieceId,
            from: index,
            to: Math.min(previewPaths.length, index + currentArgs.concurrency),
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
      if (debugEnabled) {
        // eslint-disable-next-line no-console
        console.info("[Hammer][SourceDeskPreview] done", {
          workpieceId: currentArgs.workpieceId,
          ok: Object.keys(nextUrls).length,
          failed: Object.keys(nextFailures).length,
          elapsed_ms: elapsedMs,
        });
      }
      currentArgs.setPreviewUrls((previous) => {
        const nextKeys = Object.keys(nextUrls);
        const unchanged = nextKeys.every((key) => previous[key] === nextUrls[key]);
        if (unchanged) return previous;
        const merged = { ...previous };
        for (const key of nextKeys) {
          if (merged[key] && merged[key] !== nextUrls[key]) {
            URL.revokeObjectURL(merged[key]);
          }
          merged[key] = nextUrls[key];
        }
        return merged;
      });
      currentArgs.setPreviewFailures((previous) => {
        const nextKeys = Object.keys(nextFailures);
        const unchanged = nextKeys.every((key) => previous[key] === nextFailures[key]);
        return unchanged ? previous : { ...previous, ...nextFailures };
      });
    })();

    return () => {
      active = false;
    };
  }, [args.workpieceId, args.fetchKey]);

  useEffect(() => {
    previewUrlsRef.current = args.previewUrls;
  }, [args.previewUrls]);

  useEffect(() => () => {
    for (const url of Object.values(previewUrlsRef.current)) {
      URL.revokeObjectURL(url);
    }
  }, []);
}
