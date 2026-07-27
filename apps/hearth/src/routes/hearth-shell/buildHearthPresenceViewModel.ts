import type { HearthWorkpiecePresence } from "../../lib/hearth-presence";
import type { HearthPresenceConnection } from "./hearth-presence-contracts";

export function deriveHearthPresenceLoadStatus(
  connection: HearthPresenceConnection,
  participants: HearthWorkpiecePresence[],
) {
  if (connection === "failed" || connection === "unavailable") return "failed" as const;
  if (connection === "loading") return "loading" as const;
  if (connection === "idle") return "idle" as const;
  return participants.length === 0 ? "empty" as const : "loaded" as const;
}

export function orderHearthPresenceParticipants(
  participants: HearthWorkpiecePresence[],
): HearthWorkpiecePresence[] {
  return [...participants];
}
