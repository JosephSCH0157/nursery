import { useState } from "react";
import type { HearthAiLane, HearthOwnerChatCapability, HearthOwnerFundingStatus } from "../../lib/hearth-chat-api";
import type { ChatAttachmentUi } from "./hearth-shell-contracts";
import type { HearthConversationController } from "./hearth-conversation-contracts";

export {
  useChatWorkspaceState as useHearthConversationState,
  useChatWorkspaceHistory as useHearthConversationHistory,
  useChatWorkspaceRuntime as useHearthConversationRuntime,
  useChatWorkspaceStt as useHearthConversationStt,
  useChatWorkspaceProposal as useHearthConversationProposal,
  useChatWorkspace as useHearthConversationSurface,
  isChatContextHydrated,
} from "../../hooks/useChatWorkspace";

export {
  listHearthAttachments as listHearthConversationAttachments,
  uploadHearthAttachment as uploadHearthConversationAttachment,
  updateHearthAttachmentExtractedText as updateHearthConversationAttachmentText,
} from "../../lib/hearth-attachments-api";

export function useHearthConversationAttachmentState() {
  const [attachments, setAttachments] = useState<ChatAttachmentUi[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    state: { attachments, isLoading, error },
    bindings: { setAttachments, setIsLoading, setError },
  };
}

export function useHearthConversationRuntimeState(initialLane: HearthAiLane) {
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [billingMode, setBillingMode] = useState<HearthAiLane>(initialLane);
  const [ownerChatCapability, setOwnerChatCapability] = useState<HearthOwnerChatCapability>({
    status: "checking",
    reasonCode: null,
  });
  const [ownerFundingStatus, setOwnerFundingStatus] = useState<HearthOwnerFundingStatus>("unknown");
  return {
    state: { tokenBalance, billingMode, ownerChatCapability, ownerFundingStatus },
    bindings: { setTokenBalance, setBillingMode, setOwnerChatCapability, setOwnerFundingStatus },
  };
}

export function useHearthConversationController(
  controller: HearthConversationController,
): HearthConversationController {
  return controller;
}
