/**
 * EpisodeWorkspaceContext — global episode identity layer.
 *
 * Lives above all tool shells. Provides the active episode UI continuity state
 * across navigation without owning canonical persistence (Tongs remains SSOT).
 *
 * Storage precedence:
 *   1. Loader-native read models
 *   2. Bootstrap payloads from route entry points
 *   3. sessionStorage fallback on remount
 */
/* eslint-disable react-refresh/only-export-components */

import type { EpisodeWorkspaceReadModel } from "@forge/shared/episode-workspace";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { EpisodePhase } from "./episodePhases";

const SESSION_STORAGE_KEY = "forge.activeEpisode";

type EpisodeWorkspaceSource = "session" | "bootstrap" | "loader";
export type EpisodeWorkspaceContextState = "none" | "loading" | "active" | "missing";
type EpisodeWorkspaceField = "title" | "seriesTitle" | "phase" | "displayStatus" | "sessionId";

const SOURCE_STRENGTH: Record<EpisodeWorkspaceSource, number> = {
  session: 0,
  bootstrap: 1,
  loader: 2,
};

type EpisodeFieldStrengths = Record<EpisodeWorkspaceField, number>;

const EMPTY_FIELD_STRENGTHS: EpisodeFieldStrengths = {
  title: -1,
  seriesTitle: -1,
  phase: -1,
  displayStatus: -1,
  sessionId: -1,
};

export interface EpisodeWorkspaceState {
  episodeId: string | null;
  title: string;
  phase?: EpisodePhase | null;
  displayStatus?: string | null;
  seriesTitle?: string | null;
  sessionId?: string | null;
  contextState: EpisodeWorkspaceContextState;
  source: EpisodeWorkspaceSource;
}

type EpisodeWorkspaceInternalState = {
  episode: EpisodeWorkspaceState;
  fieldStrengths: EpisodeFieldStrengths;
};

export const EMPTY_EPISODE_STATE: EpisodeWorkspaceState = {
  episodeId: null,
  title: "",
  phase: null,
  displayStatus: null,
  seriesTitle: null,
  sessionId: null,
  contextState: "none",
  source: "session",
};

export interface EpisodeWorkspaceContextValue {
  episode: EpisodeWorkspaceState;
  setActiveEpisode: (state: Partial<EpisodeWorkspaceState> & { episodeId: string }) => void;
  clearEpisode: () => void;
  hydrateEpisodeFromPayload: (payload: Partial<EpisodeWorkspaceState> & { episodeId: string }) => void;
  hydrateEpisodeFromReadModel: (readModel: EpisodeWorkspaceReadModel) => void;
  setEpisodeContextLoading: (episodeId: string | null) => void;
  setEpisodeContextMissing: (episodeId: string) => void;
}

const EpisodeWorkspaceContext = createContext<EpisodeWorkspaceContextValue | null>(null);

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function hasMeaningfulField(
  field: EpisodeWorkspaceField,
  value: unknown,
  source: EpisodeWorkspaceSource,
): boolean {
  if (field === "phase") return typeof value === "string" && value.length > 0;
  const text = readTrimmedString(value);
  if (!text) return false;
  if (field === "title" && source !== "loader" && text === "Episode") return false;
  return true;
}

function deriveContextState(state: EpisodeWorkspaceState): EpisodeWorkspaceContextState {
  if (!state.episodeId) return "none";
  if (
    hasMeaningfulField("title", state.title, "loader")
    || hasMeaningfulField("seriesTitle", state.seriesTitle, "loader")
    || hasMeaningfulField("displayStatus", state.displayStatus, "loader")
    || hasMeaningfulField("sessionId", state.sessionId, "loader")
    || hasMeaningfulField("phase", state.phase, "loader")
  ) {
    return "active";
  }
  return "loading";
}

function normalizeStoredState(value: unknown): EpisodeWorkspaceState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const episodeId = readTrimmedString(row.episodeId);
  if (!episodeId) return null;

  const normalized: EpisodeWorkspaceState = {
    episodeId,
    title: readTrimmedString(row.title) ?? "",
    phase: (readTrimmedString(row.phase) as EpisodePhase | null) ?? null,
    displayStatus: readTrimmedString(row.displayStatus) ?? readTrimmedString(row.status),
    seriesTitle: readTrimmedString(row.seriesTitle) ?? readTrimmedString(row.seriesId),
    sessionId: readTrimmedString(row.sessionId),
    contextState: "loading",
    source: row.source === "loader" || row.source === "bootstrap" ? row.source : "session",
  };

  return {
    ...normalized,
    contextState: deriveContextState(normalized),
  };
}

function buildStoredFieldStrengths(state: EpisodeWorkspaceState): EpisodeFieldStrengths {
  const source = state.source ?? "session";
  const strength = SOURCE_STRENGTH[source];
  return {
    title: hasMeaningfulField("title", state.title, source) ? strength : -1,
    seriesTitle: hasMeaningfulField("seriesTitle", state.seriesTitle, source) ? strength : -1,
    phase: hasMeaningfulField("phase", state.phase, source) ? strength : -1,
    displayStatus: hasMeaningfulField("displayStatus", state.displayStatus, source) ? strength : -1,
    sessionId: hasMeaningfulField("sessionId", state.sessionId, source) ? strength : -1,
  };
}

function readStoredState(): EpisodeWorkspaceInternalState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const episode = normalizeStoredState(JSON.parse(raw) as unknown);
    if (!episode) return null;
    return {
      episode,
      fieldStrengths: buildStoredFieldStrengths(episode),
    };
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
    // Ignore storage failures — in-memory state stays live.
  }
}

function mergeEpisodeState(
  prev: EpisodeWorkspaceInternalState,
  episodeId: string,
  patch: Partial<EpisodeWorkspaceState>,
  source: EpisodeWorkspaceSource,
): EpisodeWorkspaceInternalState {
  const replacingEpisode = prev.episode.episodeId !== episodeId;
  const nextEpisode: EpisodeWorkspaceState = replacingEpisode
    ? {
      ...EMPTY_EPISODE_STATE,
      episodeId,
      contextState: "loading",
      source,
    }
    : { ...prev.episode, episodeId, source: prev.episode.source === "loader" ? prev.episode.source : source };
  const nextFieldStrengths = replacingEpisode ? { ...EMPTY_FIELD_STRENGTHS } : { ...prev.fieldStrengths };
  const strength = SOURCE_STRENGTH[source];

  const applyField = <K extends EpisodeWorkspaceField>(field: K) => {
    const value = patch[field];
    if (!hasMeaningfulField(field, value, source)) return;
    if (strength < nextFieldStrengths[field]) return;
    nextEpisode[field] = value as EpisodeWorkspaceState[K];
    nextFieldStrengths[field] = strength;
  };

  applyField("title");
  applyField("seriesTitle");
  applyField("phase");
  applyField("displayStatus");
  applyField("sessionId");

  nextEpisode.contextState = deriveContextState(nextEpisode);
  return {
    episode: nextEpisode,
    fieldStrengths: nextFieldStrengths,
  };
}

function isEpisodeStateEqual(a: EpisodeWorkspaceState, b: EpisodeWorkspaceState): boolean {
  return a.episodeId === b.episodeId
    && a.title === b.title
    && a.phase === b.phase
    && a.displayStatus === b.displayStatus
    && a.seriesTitle === b.seriesTitle
    && a.sessionId === b.sessionId
    && a.contextState === b.contextState
    && a.source === b.source;
}

function isFieldStrengthsEqual(a: EpisodeFieldStrengths, b: EpisodeFieldStrengths): boolean {
  return a.title === b.title
    && a.seriesTitle === b.seriesTitle
    && a.phase === b.phase
    && a.displayStatus === b.displayStatus
    && a.sessionId === b.sessionId;
}

export function EpisodeWorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EpisodeWorkspaceInternalState>(
    () => readStoredState() ?? { episode: EMPTY_EPISODE_STATE, fieldStrengths: { ...EMPTY_FIELD_STRENGTHS } },
  );

  const setActiveEpisode = useCallback((input: Partial<EpisodeWorkspaceState> & { episodeId: string }) => {
    const next = mergeEpisodeState(
      { episode: EMPTY_EPISODE_STATE, fieldStrengths: { ...EMPTY_FIELD_STRENGTHS } },
      input.episodeId,
      input,
      "loader",
    );
    setState(next);
    writeStoredState(next.episode);
  }, []);

  const clearEpisode = useCallback(() => {
    const next = { episode: EMPTY_EPISODE_STATE, fieldStrengths: { ...EMPTY_FIELD_STRENGTHS } };
    setState(next);
    writeStoredState(null);
  }, []);

  const hydrateEpisodeFromPayload = useCallback((payload: Partial<EpisodeWorkspaceState> & { episodeId: string }) => {
    setState((prev) => {
      const next = mergeEpisodeState(prev, payload.episodeId, payload, "bootstrap");
      if (isEpisodeStateEqual(prev.episode, next.episode) && isFieldStrengthsEqual(prev.fieldStrengths, next.fieldStrengths)) {
        return prev;
      }
      writeStoredState(next.episode);
      return next;
    });
  }, []);

  const hydrateEpisodeFromReadModel = useCallback((readModel: EpisodeWorkspaceReadModel) => {
    setState((prev) => {
      const next = mergeEpisodeState(
        prev,
        readModel.episodeId,
        {
          title: readModel.title,
          phase: readModel.phase as EpisodePhase,
          displayStatus: readModel.displayStatus,
          sessionId: readModel.sessionId ?? null,
          seriesTitle: readModel.seriesTitle ?? null,
        },
        "loader",
      );
      if (isEpisodeStateEqual(prev.episode, next.episode) && isFieldStrengthsEqual(prev.fieldStrengths, next.fieldStrengths)) {
        return prev;
      }
      writeStoredState(next.episode);
      return next;
    });
  }, []);

  const setEpisodeContextLoading = useCallback((episodeId: string | null) => {
    setState((prev) => {
      if (!episodeId) {
        if (prev.episode.contextState === "none") return prev;
        const cleared = { episode: EMPTY_EPISODE_STATE, fieldStrengths: { ...EMPTY_FIELD_STRENGTHS } };
        writeStoredState(null);
        return cleared;
      }

      if (prev.episode.episodeId === episodeId) {
        if (prev.episode.contextState === "active" || prev.episode.contextState === "missing") return prev;
        const nextEpisode: EpisodeWorkspaceState = {
          ...prev.episode,
          episodeId,
          contextState: deriveContextState(prev.episode) === "active" ? "active" : "loading",
        };
        const next = { ...prev, episode: nextEpisode };
        writeStoredState(nextEpisode);
        return next;
      }

      const nextEpisode: EpisodeWorkspaceState = {
        ...EMPTY_EPISODE_STATE,
        episodeId,
        contextState: "loading",
        source: "bootstrap",
      };
      const next = { episode: nextEpisode, fieldStrengths: { ...EMPTY_FIELD_STRENGTHS } };
      writeStoredState(nextEpisode);
      return next;
    });
  }, []);

  const setEpisodeContextMissing = useCallback((episodeId: string) => {
    setState((prev) => {
      // Only transition if this is the same episode and it's currently loading.
      // Never downgrade from active or overwrite a different episode.
      if (prev.episode.contextState === "missing") return prev;
      if (prev.episode.contextState === "active") return prev;
      if (prev.episode.episodeId !== episodeId) return prev;
      const nextEpisode: EpisodeWorkspaceState = {
        ...prev.episode,
        contextState: "missing",
      };
      const next = { ...prev, episode: nextEpisode };
      writeStoredState(nextEpisode);
      return next;
    });
  }, []);

  const value = useMemo<EpisodeWorkspaceContextValue>(
    () => ({
      episode: state.episode,
      setActiveEpisode,
      clearEpisode,
      hydrateEpisodeFromPayload,
      hydrateEpisodeFromReadModel,
      setEpisodeContextLoading,
      setEpisodeContextMissing,
    }),
    [state.episode, setActiveEpisode, clearEpisode, hydrateEpisodeFromPayload, hydrateEpisodeFromReadModel, setEpisodeContextLoading, setEpisodeContextMissing],
  );

  return (
    <EpisodeWorkspaceContext.Provider value={value}>
      {children}
    </EpisodeWorkspaceContext.Provider>
  );
}

export function useEpisodeWorkspace(): EpisodeWorkspaceContextValue {
  const ctx = useContext(EpisodeWorkspaceContext);
  if (!ctx) {
    throw new Error("useEpisodeWorkspace must be used inside EpisodeWorkspaceProvider");
  }
  return ctx;
}

export function useOptionalEpisodeWorkspace(): EpisodeWorkspaceContextValue | null {
  return useContext(EpisodeWorkspaceContext);
}
