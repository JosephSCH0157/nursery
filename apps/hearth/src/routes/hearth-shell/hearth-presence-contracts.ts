import type {
  HearthPresenceMode,
  HearthWorkpiecePresence,
} from "../../lib/hearth-presence";

export type HearthPresenceConnection =
  | "idle"
  | "loading"
  | "available"
  | "unavailable"
  | "failed";

export type HearthPresenceController = {
  state: {
    participants: HearthWorkpiecePresence[];
    localPresence: {
      userId: string | null;
      displayName: string;
      mode: HearthPresenceMode;
    };
    connection: HearthPresenceConnection;
  };
  commands: {
    refreshPresence: () => void;
    publishPresence: () => void;
    updateActivity: (mode: HearthPresenceMode) => void;
    retryPresence: () => void;
    clearPresence: () => void;
  };
  status: {
    load: "idle" | "loading" | "empty" | "loaded" | "failed";
    publish: "idle" | "publishing" | "published" | "failed";
    connection: HearthPresenceConnection;
  };
  surface: {
    editingParticipants: HearthWorkpiecePresence[];
    viewingParticipants: HearthWorkpiecePresence[];
    resolveWorkpiecePresenceBadge: (workpieceId: string) => string;
    resolveWorkpiecePresenceClass: (workpieceId: string) => string;
  };
};
