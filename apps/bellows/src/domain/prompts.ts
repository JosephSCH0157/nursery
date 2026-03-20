import type { ParticipantId, PromptId } from "./ids.js";
import type { BellowsOffsetMs } from "./primitives.js";
import type { BellowsRoleCode } from "./roles.js";

export type BellowsPromptSource = "platform_chat" | "manual";

export type BellowsPromptVisibility =
  | "host_and_co_host"
  | "highlighted_only";

export interface BellowsPromptFeedSelection {
  readonly enabled: boolean;
  readonly source: BellowsPromptSource | null;
  readonly visibility: BellowsPromptVisibility;
}

export interface BellowsAudiencePrompt {
  readonly promptId: PromptId;
  readonly source: BellowsPromptSource;
  readonly text: string;
  readonly highlighted: boolean;
  readonly highlightedByParticipantId: ParticipantId | null;
  readonly highlightedAtOffsetMs: BellowsOffsetMs | null;
  readonly visibleToRoles: readonly BellowsRoleCode[];
}
