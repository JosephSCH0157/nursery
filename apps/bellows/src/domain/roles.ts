import type { BellowsAuthorityTier } from "./authority.js";
import type { ParticipantId } from "./ids.js";

export type BellowsRoleCode = "S1" | "S2" | "G1" | "G2";

export interface BellowsRoleAssignment {
  readonly participantId: ParticipantId;
  readonly roleCode: BellowsRoleCode;
  readonly authorityTier: BellowsAuthorityTier;
}
