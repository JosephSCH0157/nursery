import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  listHearthWorkpiecePresence,
  upsertHearthWorkpiecePresence,
  type HearthPresenceMode,
  type HearthWorkpiecePresence,
} from "../../lib/hearth-presence";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";
import {
  deriveHearthPresenceLoadStatus,
  orderHearthPresenceParticipants,
} from "./buildHearthPresenceViewModel";
import type {
  HearthPresenceConnection,
  HearthPresenceController,
} from "./hearth-presence-contracts";

export const HEARTH_PRESENCE_REFRESH_EVENT = "hearth:presence-refresh";

export function useHearthPresenceState() {
  const [participants, setParticipants] = useState<HearthWorkpiecePresence[]>([]);
  const [connection, setConnection] = useState<HearthPresenceConnection>("idle");
  return { participants, setParticipants, connection, setConnection };
}

export function useHearthPresenceProjection(args: {
  participants: HearthWorkpiecePresence[];
  currentUserId: string | null;
}) {
  const peers = useMemo(
    () => args.participants.filter((row) => !args.currentUserId || row.userId !== args.currentUserId),
    [args.currentUserId, args.participants],
  );
  const editingParticipants = useMemo(
    () => orderHearthPresenceParticipants(peers.filter((row) => row.mode === "editing")),
    [peers],
  );
  const viewingParticipants = useMemo(
    () => orderHearthPresenceParticipants(peers.filter((row) => row.mode === "viewing")),
    [peers],
  );
  const activeEditorName = editingParticipants[0]?.displayName?.trim() || "A teammate";
  const activeViewerName = viewingParticipants[0]?.displayName?.trim() || "A teammate";
  return {
    peers,
    editingParticipants,
    viewingParticipants,
    activeEditorName,
    activeViewerName,
  };
}

export function useHearthPresenceLifecycle(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  mode: HearthPresenceMode;
  displayName: string;
  heartbeatMs: number;
  operationAuthority: HearthOperationAuthority;
  normalizeUuid: (value: string) => string | null;
  setParticipants: Dispatch<SetStateAction<HearthWorkpiecePresence[]>>;
  setConnection: Dispatch<SetStateAction<HearthPresenceConnection>>;
  acceptUserId: (userId: string) => void;
}) {
  useEffect(() => {
    const normalizedWorkspaceId = args.normalizeUuid(args.workspaceId?.trim() ?? "");
    const normalizedWorkpieceId = args.normalizeUuid(args.workpieceId?.trim() ?? "");
    if (!normalizedWorkspaceId || !normalizedWorkpieceId) {
      args.setParticipants([]);
      args.setConnection("idle");
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    const operation = args.operationAuthority.begin("presence.sync");

    const syncPresence = async () => {
      if (!cancelled && args.operationAuthority.isCurrent(operation)) {
        args.setConnection((previous) => previous === "available" ? previous : "loading");
      }
      try {
        const ownPresence = await upsertHearthWorkpiecePresence({
          workspaceId: normalizedWorkspaceId,
          workpieceId: normalizedWorkpieceId,
          mode: args.mode,
          displayName: args.displayName,
        });
        if (cancelled || !args.operationAuthority.isCurrent(operation)) return;
        if (ownPresence.kind !== "success") {
          args.setParticipants([]);
          args.setConnection(ownPresence.kind);
          return;
        }
        if (ownPresence.value.userId) args.acceptUserId(ownPresence.value.userId);

        const result = await listHearthWorkpiecePresence(
          normalizedWorkspaceId,
          normalizedWorkpieceId,
        );
        if (cancelled || !args.operationAuthority.isCurrent(operation)) return;
        if (result.kind === "success") {
          args.setParticipants(result.value);
          args.setConnection("available");
        } else {
          args.setParticipants([]);
          args.setConnection(result.kind);
        }
      } catch {
        if (!cancelled && args.operationAuthority.isCurrent(operation)) {
          args.setParticipants([]);
          args.setConnection("failed");
        }
      }
    };

    void syncPresence();
    const onRefreshPresence = () => void syncPresence();
    window.addEventListener(HEARTH_PRESENCE_REFRESH_EVENT, onRefreshPresence);
    timer = window.setInterval(() => void syncPresence(), args.heartbeatMs);
    return () => {
      cancelled = true;
      window.removeEventListener(HEARTH_PRESENCE_REFRESH_EVENT, onRefreshPresence);
      if (timer) window.clearInterval(timer);
    };
  }, [
    args.displayName,
    args.heartbeatMs,
    args.mode,
    args.normalizeUuid,
    args.operationAuthority,
    args.setConnection,
    args.setParticipants,
    args.workpieceId,
    args.workspaceId,
  ]);
}

export function useHearthPresenceBadges(args: {
  activeWorkpieceId: string | null;
  connection: HearthPresenceConnection;
  editingParticipants: HearthWorkpiecePresence[];
  viewingParticipants: HearthWorkpiecePresence[];
}) {
  const editorName = args.editingParticipants[0]?.displayName?.trim() || "A teammate";
  const viewerName = args.viewingParticipants[0]?.displayName?.trim() || "A teammate";
  const resolveWorkpiecePresenceBadge = useCallback((targetWorkpieceId: string): string => {
    if (args.activeWorkpieceId !== targetWorkpieceId) return "Not checked";
    if (args.connection === "loading") return "Checking...";
    if (args.connection === "unavailable" || args.connection === "failed") return "Presence unavailable";
    if (args.editingParticipants.length > 0) return `${editorName} editing`;
    if (args.viewingParticipants.length > 0) return `${viewerName} viewing`;
    return "Idle";
  }, [
    args.activeWorkpieceId,
    args.connection,
    args.editingParticipants.length,
    args.viewingParticipants.length,
    editorName,
    viewerName,
  ]);
  const resolveWorkpiecePresenceClass = useCallback((targetWorkpieceId: string): string => {
    if (args.activeWorkpieceId !== targetWorkpieceId) return "is-idle";
    if (args.connection === "unavailable" || args.connection === "failed") return "is-unavailable";
    if (args.editingParticipants.length > 0) return "is-editing";
    if (args.viewingParticipants.length > 0) return "is-viewing";
    return "is-idle";
  }, [
    args.activeWorkpieceId,
    args.connection,
    args.editingParticipants.length,
    args.viewingParticipants.length,
  ]);
  return { resolveWorkpiecePresenceBadge, resolveWorkpiecePresenceClass };
}

export function buildHearthPresenceController(args: {
  participants: HearthWorkpiecePresence[];
  connection: HearthPresenceConnection;
  userId: string | null;
  displayName: string;
  mode: HearthPresenceMode;
  editingParticipants: HearthWorkpiecePresence[];
  viewingParticipants: HearthWorkpiecePresence[];
  clearPresence: () => void;
  refreshPresence: () => void;
  updateActivity: (mode: HearthPresenceMode) => void;
  resolveWorkpiecePresenceBadge: (workpieceId: string) => string;
  resolveWorkpiecePresenceClass: (workpieceId: string) => string;
}): HearthPresenceController {
  return {
    state: {
      participants: args.participants,
      localPresence: { userId: args.userId, displayName: args.displayName, mode: args.mode },
      connection: args.connection,
    },
    commands: {
      refreshPresence: args.refreshPresence,
      publishPresence: args.refreshPresence,
      updateActivity: args.updateActivity,
      retryPresence: args.refreshPresence,
      clearPresence: args.clearPresence,
    },
    status: {
      load: deriveHearthPresenceLoadStatus(args.connection, args.participants),
      publish: args.connection === "loading"
        ? "publishing"
        : args.connection === "available"
          ? "published"
          : args.connection === "failed" || args.connection === "unavailable"
            ? "failed"
            : "idle",
      connection: args.connection,
    },
    surface: {
      editingParticipants: args.editingParticipants,
      viewingParticipants: args.viewingParticipants,
      resolveWorkpiecePresenceBadge: args.resolveWorkpiecePresenceBadge,
      resolveWorkpiecePresenceClass: args.resolveWorkpiecePresenceClass,
    },
  };
}
