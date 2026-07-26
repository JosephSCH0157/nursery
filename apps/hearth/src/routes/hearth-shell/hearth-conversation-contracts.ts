import type { HearthChatMessage, HearthAiLane } from "../../lib/hearth-chat-api";
import type {
  ChatAttachmentUi,
  PendingAiProposal,
} from "./hearth-shell-contracts";
import type { ChatSurfaceProps } from "../../views/surfaces/ChatSurface";

export type HearthConversationController = {
  state: {
    messages: HearthChatMessage[];
    compose: {
      text: string;
      modalOpen: boolean;
    };
    attachments: ChatAttachmentUi[];
    transcription: {
      lane: "browser" | "ai";
      target: "chat" | "script";
      state: string;
      preview: string | null;
    };
    proposal: PendingAiProposal | null;
    runtime: {
      billingMode: HearthAiLane;
      tokenBalance: number | null;
      aiEnabled: boolean;
    };
  };
  commands: {
    updateCompose: (value: string) => void;
    submitMessage: () => Promise<void>;
    retryMessage: () => Promise<void>;
    attachFile: (files: FileList | null) => Promise<void>;
    removeAttachment: (id: string) => void;
    startTranscription: (target: "chat" | "script") => Promise<void>;
    stopTranscription: () => void;
    requestProposal: () => Promise<void>;
    applyProposal: () => Promise<void>;
    rejectProposal: () => void;
    confirmAiCreditUse: () => boolean;
  };
  status: {
    history: "idle" | "loading" | "loaded" | "empty" | "failed";
    send: "idle" | "sending" | "failed";
    attachments: "idle" | "loading" | "failed";
    transcription: string;
    ai: "disabled" | "idle" | "working" | "depleted";
  };
  surface: {
    chatSurfaceProps: ChatSurfaceProps;
  };
};
