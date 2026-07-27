import { useState } from "react";
import type { HearthAiLane } from "../../lib/hearth-chat-api";
import type { ChatAttachmentUi } from "./hearth-shell-contracts";
import type { HearthConversationController } from "./hearth-conversation-contracts";

export {
  useChatWorkspaceState as useHearthConversationState,
  useChatWorkspaceHistory as useHearthConversationHistory,
  useChatWorkspaceRuntime as useHearthConversationRuntime,
  useChatWorkspaceStt as useHearthConversationStt,
  useChatWorkspaceProposal as useHearthConversationProposal,
  useChatWorkspace as useHearthConversationSurface,
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
  return {
    state: { tokenBalance, billingMode },
    bindings: { setTokenBalance, setBillingMode },
  };
}

export function useHearthConversationController(
  controller: HearthConversationController,
): HearthConversationController {
  return controller;
}
