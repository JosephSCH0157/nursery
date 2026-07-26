import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { HearthPlanningSession } from "../domain/hearth-session";
import {
  isHearthPlanningSessionKey,
  readHearthPlanningSessionCache,
  writeHearthPlanningSessionCache,
} from "../lib/hearth-session-registry";
import { readHearthSession } from "../lib/hearth-session-repo";
import { tongsFetch } from "../lib/tongs-fetch";

type UseHearthWorkspaceSessionLifecycleArgs = {
  incomingBarStockIntakeRoute: boolean;
  workpieceId: string | null;
  workspaceId: string | null;
  planningSession: HearthPlanningSession | null;
  normalizeUuid: (value: string | null | undefined) => string | null;
  setPlanningSession: Dispatch<SetStateAction<HearthPlanningSession | null>>;
  setSessionTouched: Dispatch<SetStateAction<boolean>>;
  setWorkspaceId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  clearPresence: () => void;
  setWorkpieceId: Dispatch<SetStateAction<string | null>>;
  sessionCommitRef: MutableRefObject<string | null>;
  buildSessionFingerprint: (session: HearthPlanningSession) => string;
  updatePlanningSession: (
    updater: (prev: HearthPlanningSession) => HearthPlanningSession,
    options?: { touched?: boolean },
  ) => void;
};

export function useHearthWorkspaceSessionLifecycle(args: UseHearthWorkspaceSessionLifecycleArgs) {
  useEffect(() => {
    if (args.incomingBarStockIntakeRoute && !args.workpieceId) {
      args.setPlanningSession(null);
      args.setSessionTouched(false);
      return;
    }

    if (typeof window === "undefined") return;
    const refreshSession = () => {
      const cached = readHearthPlanningSessionCache(args.workpieceId, args.workspaceId);
      if (cached) {
        const normalizedCached: HearthPlanningSession = {
          ...cached,
          workpiece_id: args.normalizeUuid(cached.workpiece_id),
          workspace_id: args.normalizeUuid(cached.workspace_id),
        };
        args.setPlanningSession(normalizedCached);
      }
    };
    refreshSession();
    const onStorage = (event: StorageEvent) => {
      if (!isHearthPlanningSessionKey(event.key)) return;
      refreshSession();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [
    args.incomingBarStockIntakeRoute,
    args.normalizeUuid,
    args.setPlanningSession,
    args.setSessionTouched,
    args.workpieceId,
    args.workspaceId,
  ]);

  useEffect(() => {
    const normalizedWorkpieceId = args.normalizeUuid(args.workpieceId);
    if (!normalizedWorkpieceId) return;
    let cancelled = false;
    readHearthSession(normalizedWorkpieceId)
      .then((session) => {
        if (cancelled || !session) return;
        const normalizedSession: HearthPlanningSession = {
          ...session,
          workpiece_id: args.normalizeUuid(session.workpiece_id),
          workspace_id: args.normalizeUuid(session.workspace_id),
        };
        args.setPlanningSession(normalizedSession);
        args.setSessionTouched(false);
        args.sessionCommitRef.current = args.buildSessionFingerprint(normalizedSession);
        writeHearthPlanningSessionCache(
          normalizedSession,
          normalizedWorkpieceId,
          args.workspaceId ?? normalizedSession.workspace_id ?? null,
        );
        if (!args.workspaceId && normalizedSession.workspace_id) {
          args.setWorkspaceId(normalizedSession.workspace_id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    args.buildSessionFingerprint,
    args.normalizeUuid,
    args.sessionCommitRef,
    args.setPlanningSession,
    args.setSessionTouched,
    args.setWorkspaceId,
    args.workpieceId,
    args.workspaceId,
  ]);

  useEffect(() => {
    const workspace = args.normalizeUuid(args.workspaceId);
    const workpiece = args.normalizeUuid(args.workpieceId);
    if (!workspace || !workpiece) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await tongsFetch(
          `/tongs/workpieces/${encodeURIComponent(workpiece)}/read-file?path=${encodeURIComponent("metadata.json")}`,
          { method: "GET" },
        );
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (!cancelled) {
              args.setError("You no longer have access to this workpiece in the active workspace.");
              args.setWorkpieceId(null);
            }
          }
          return;
        }
        const body = await response.json() as { data?: { workspace_id?: unknown } };
        const workspaceField = body?.data?.workspace_id;
        const workpieceWorkspaceId = args.normalizeUuid(typeof workspaceField === "string" ? workspaceField : null);
        if (!cancelled && workpieceWorkspaceId && workpieceWorkspaceId !== workspace) {
          args.setError("This workpiece belongs to another workspace. Switch workspace to open it.");
          args.setPlanningSession(null);
          args.clearPresence();
          args.setWorkpieceId(null);
        }
      } catch {
        // ignore metadata workspace checks when the network is unavailable
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    args.normalizeUuid,
    args.setError,
    args.setPlanningSession,
    args.setWorkpieceId,
    args.workpieceId,
    args.workspaceId,
  ]);

  useEffect(() => {
    if (!args.planningSession) return;
    const needsWorkspace = args.workspaceId && args.planningSession.workspace_id !== args.workspaceId;
    const needsWorkpiece = args.workpieceId && args.planningSession.workpiece_id !== args.workpieceId;
    if (!needsWorkspace && !needsWorkpiece) return;
    args.updatePlanningSession((prev) => ({
      ...prev,
      workspace_id: args.workspaceId ?? prev.workspace_id ?? null,
      workpiece_id: args.workpieceId ?? prev.workpiece_id ?? null,
    }), { touched: false });
  }, [args.planningSession, args.updatePlanningSession, args.workpieceId, args.workspaceId]);
}
