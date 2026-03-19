export type BellowsBrand<T, TName extends string> = T & {
  readonly __brand: TName;
};

export type WorkspaceId = BellowsBrand<string, "WorkspaceId">;
export type SessionId = BellowsBrand<string, "SessionId">;
export type UserId = BellowsBrand<string, "UserId">;
export type ParticipantId = BellowsBrand<string, "ParticipantId">;
export type InviteTokenId = BellowsBrand<string, "InviteTokenId">;
export type BroadcastTargetId = BellowsBrand<string, "BroadcastTargetId">;
export type TrackId = BellowsBrand<string, "TrackId">;
export type SegmentId = BellowsBrand<string, "SegmentId">;
export type ArtifactId = BellowsBrand<string, "ArtifactId">;
export type ScriptId = BellowsBrand<string, "ScriptId">;
export type ScriptRevisionId = BellowsBrand<string, "ScriptRevisionId">;
export type SessionEventId = BellowsBrand<string, "SessionEventId">;
export type PromptId = BellowsBrand<string, "PromptId">;
export type SyncMarkerId = BellowsBrand<string, "SyncMarkerId">;
export type BellowsCredentialRef = BellowsBrand<string, "BellowsCredentialRef">;
