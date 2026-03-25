/**
 * EpisodeWorkspaceContext — global episode identity layer.
 *
 * Lives ABOVE all tool shells. Provides the active episode state across
 * navigation without owning canonical persistence (Tongs is SSOT).
 *
 * Storage strategy:
 *   1. In-memory (primary, instant)
 *   2. sessionStorage under `forge.activeEpisode` (fallback on remount)
 *   3. URL hydration via useWorkspaceBootstrap hook (per tool entry point)
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const SESSION_STORAGE_KEY = "forge.activeEpisode";

export type EpisodeWorkspaceStatus =
  | "draft"
  | "ready"
  | "scheduled"
  | "recorded"
  | "edited"
  | "released";

export interface EpisodeWorkspaceState {
  episodeId: string | null;
  /** Display title — can be empty while loading */
  title: string;
  seriesId?: string | null;
  status?: EpisodeWorkspaceStatus | null;
  sessionId?: string | null;
}

export const EMPTY_EPISODE_STATE: EpisodeWorkspaceState = {
  episodeId: null,
  title: "",
  seriesId: null,
  status: null,
  sessionId: null,
};

export interface EpisodeWorkspaceContextValue {
  episode: EpisodeWorkspaceState;
  setActiveEpisode: (state: EpisodeWorkspaceState) => void;
  clearEpisode: () => void;
  /**
   * Hydrates from a launch payload. Does NOT override an already-set episode
   * with a matching ID, so callers can call this idempotently without wiping
   * enriched state that loaded afterward.
   */
  hydrateEpisodeFromPayload: (
    payload: Partial<EpisodeWorkspaceState> & { episodeId: string },
  ) => void;
}

const EpisodeWorkspaceContext = createContext<EpisodeWorkspaceContextValue | null>(null);

// ---------------------------------------------------------------------------
// sessionStorage helpers
// ---------------------------------------------------------------------------

function readStoredState(): EpisodeWorkspaceState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as { episodeId?: unknown }).episodeId !== "string" ||
      !(parsed as { episodeId: string }).episodeId
    ) {
      return null;
    }
    return parsed as EpisodeWorkspaceState;
  } catch {
    return null;
  }
}

function writeStoredState(state: EpisodeWorkspaceState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!state?.episodeId) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Swallow storage quota / security errors — in-memory is still live
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EpisodeWorkspaceProvider({ children }: { children: ReactNode }) {
  const [episode, setEpisodeRaw] = useState<EpisodeWorkspaceState>(
    () => readStoredState() ?? EMPTY_EPISODE_STATE,
  );

  const setActiveEpisode = useCallback((state: EpisodeWorkspaceState) => {
    setEpisodeRaw(state);
    writeStoredState(state);
  }, []);

  const clearEpisode = useCallback(() => {
    setEpisodeRaw(EMPTY_EPISODE_STATE);
    writeStoredState(null);
  }, []);

  const hydrateEpisodeFromPayload = useCallback(
    (payload: Partial<EpisodeWorkspaceState> & { episodeId: string }) => {
      setEpisodeRaw((prev) => {
        // If the same episode is already set, only backfill missing fields
        if (prev.episodeId === payload.episodeId) {
          const enriched: EpisodeWorkspaceState = {
            ...prev,
            title: prev.title || payload.title || "",
            seriesId: prev.seriesId ?? payload.seriesId ?? null,
            status: prev.status ?? payload.status ?? null,
            sessionId: prev.sessionId ?? payload.sessionId ?? null,
          };
          const changed = JSON.stringify(enriched) !== JSON.stringify(prev);
          if (changed) writeStoredState(enriched);
          return changed ? enriched : prev;
        }
        const next: EpisodeWorkspaceState = {
          episodeId: payload.episodeId,
          title: payload.title ?? "",
          seriesId: payload.seriesId ?? null,
          status: payload.status ?? null,
          sessionId: payload.sessionId ?? null,
        };
        writeStoredState(next);
        return next;
      });
    },
    [],
  );

  const value = useMemo<EpisodeWorkspaceContextValue>(
    () => ({ episode, setActiveEpisode, clearEpisode, hydrateEpisodeFromPayload }),
    [episode, setActiveEpisode, clearEpisode, hydrateEpisodeFromPayload],
  );

  return (
    <EpisodeWorkspaceContext.Provider value={value}>
      {children}
    </EpisodeWorkspaceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hooks
// ---------------------------------------------------------------------------

/** Use inside any component that requires an active episode context. */
export function useEpisodeWorkspace(): EpisodeWorkspaceContextValue {
  const ctx = useContext(EpisodeWorkspaceContext);
  if (!ctx) {
    throw new Error("useEpisodeWorkspace must be used inside EpisodeWorkspaceProvider");
  }
  return ctx;
}

/**
 * Use inside components that may render without an episode context (e.g. tools
 * opened standalone without a workpiece). Returns null when no provider is present
 * or when no episode is active.
 */
export function useOptionalEpisodeWorkspace(): EpisodeWorkspaceContextValue | null {
  return useContext(EpisodeWorkspaceContext);
}
