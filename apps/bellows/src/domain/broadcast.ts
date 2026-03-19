import type { BellowsCredentialRef, BroadcastTargetId } from "./ids.js";

export type BellowsPlatform = "youtube" | "rumble" | "custom_rtmp";

export type BellowsBroadcastState =
  | "not_broadcasting"
  | "starting"
  | "live"
  | "degraded"
  | "disconnected"
  | "ended";

export type BellowsBroadcastIntent =
  | "none"
  | "single_platform"
  | "multi_platform";

export interface BellowsBroadcastTarget {
  readonly broadcastTargetId: BroadcastTargetId;
  readonly platform: BellowsPlatform;
  readonly enabled: boolean;
  readonly credentialRef: BellowsCredentialRef | null;
  readonly displayLabel: string;
}
