import type { ParticipantId } from "./ids.js";

export type BellowsAuthorityTier = "host" | "co_host" | "guest" | "engine";

export type BellowsActingAuthorityState =
  | "host_present"
  | "co_host_promoted"
  | "engine_stewardship";

export interface BellowsAuthorityState {
  readonly actingAuthorityState: BellowsActingAuthorityState;
  readonly hostParticipantId: ParticipantId | null;
  readonly actingHostParticipantId: ParticipantId | null;
  readonly coHostParticipantIds: readonly ParticipantId[];
}
