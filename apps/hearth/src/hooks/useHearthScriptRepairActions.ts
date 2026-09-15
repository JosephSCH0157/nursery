import { useCallback } from "react";
import type { Draft } from "../domain/draft";
import type { EpisodeContext, HearthOp } from "../lib/hearth-ai-ops";
import type { HearthAiLane, HearthChatMessage, HearthOwnerChatCapability } from "../lib/hearth-chat-api";
import { evaluateHearthScriptValidation } from "../lib/hearth-script-tag-policy";
import type { HearthOperationAuthority } from "../lib/hearth-operation-authority";
import { normalizeScriptTags, repairScriptTags, type ScriptValidationResult } from "@forge/shared/script-tags";

type ScriptValidationState = {
  source: "save_gate" | "save_notice" | "ai_repair";
  result: ScriptValidationResult;
} | null;

type PersistDraft = (args: {
  draft: Draft;
  updatedAt: number;
  createRevision: { kind: "autosave" | "manual" | "milestone"; note?: string } | null;
  syncSources?: boolean;
  syncSession?: boolean;
  saveReason?: string;
}) => Promise<boolean>;

type ChatReplyResult =
  | {
      ok: true;
      ops: HearthOp[];
      scriptText?: string | null;
      assistantText?: string | null;
      creditsWarning?: string | null;
      runtime: {
        billingMode: HearthAiLane;
        tokenBalance: number | null;
      };
    }
  | {
      ok: false;
      cancelled?: boolean;
      error?: string;
      runtime: {
        billingMode: HearthAiLane;
        tokenBalance: number | null;
      };
    };

type RefreshCreditsResult = {
  ok: boolean;
  runtime: {
    billingMode: HearthAiLane;
    tokenBalance: number | null;
  };
};

type UseHearthScriptRepairActionsArgs = {
  operationAuthority: HearthOperationAuthority;
  activeDraft: Draft | null;
  isRepairingScript: boolean;
  isAiProcessing: boolean;
  aiTokenBalance: number | null;
  ownerChatCapability: HearthOwnerChatCapability;
  chatHistoryMaxMessages: number;
  aiRequestControllerRef: { current: AbortController | null };
  draftEditVersionRef: { current: number };
  activeDraftRef: { current: Draft | null };
  buildActiveEpisodeContext: () => EpisodeContext | null;
  persistDraft: PersistDraft;
  dedupeDraftListById: (drafts: Draft[]) => Draft[];
  queueAiAutosave: (args: { draft: Draft; previousBody: string; reasonCode: "ai_repair" }) => void;
  requestHearthChatReply: (
    messages: Array<{ role: "user"; content: string }>,
    episodeContext: EpisodeContext,
    options: { signal: AbortSignal },
  ) => Promise<ChatReplyResult>;
  refreshMyAiCredits: () => Promise<RefreshCreditsResult>;
  resolveAiLaneFromStorage: () => HearthAiLane;
  buildValidationReport: (validation: ScriptValidationResult) => string;
  setAiBillingMode: (next: HearthAiLane) => void;
  setAiTokenBalance: (next: number | null) => void;
  setIsRepairingScript: (next: boolean) => void;
  setIsAiProcessing: (next: boolean) => void;
  setChatError: (next: string | null) => void;
  setAiRuntimeWarning: (next: string | null) => void;
  setScriptValidation: (next: ScriptValidationState) => void;
  setError: (next: string | null) => void;
  setActiveDraft: (next: Draft | ((prev: Draft | null) => Draft | null)) => void;
  setDrafts: (next: Draft[] | ((prev: Draft[]) => Draft[])) => void;
  setChatMessages: (next: HearthChatMessage[] | ((prev: HearthChatMessage[]) => HearthChatMessage[])) => void;
};

export function useHearthScriptRepairActions(args: UseHearthScriptRepairActionsArgs) {
  const onFixScriptFormattingNoAi = useCallback(async () => {
    if (!args.activeDraft) return;
    const operation = args.operationAuthority.begin("script.format");
    const normalized = normalizeScriptTags(args.activeDraft.body);
    const repaired = repairScriptTags(normalized);
    const { validation } = evaluateHearthScriptValidation(repaired.text);
    if (!validation.ok) {
      args.setScriptValidation({
        source: "save_gate",
        result: validation,
      });
      args.setError(
        `Script tags must be valid before approval.\nFix the issues below to continue.\n\n${args.buildValidationReport(validation)}`,
      );
    }

    const now = Date.now();
    const saved = await args.persistDraft({
      draft: { ...args.activeDraft, body: repaired.text, updatedAt: now },
      updatedAt: now,
      createRevision: null,
      syncSources: false,
      syncSession: false,
      saveReason: "repair:deterministic",
    });
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved) return;

    const fixedCount = repaired.repairedIssues.length;
    const remainingCount = validation.issues.length;
    if (remainingCount > 0) {
      args.setError(`${fixedCount} issues fixed automatically. ${remainingCount} issues remain and need manual correction.`);
    } else {
      args.setError(`${fixedCount} issues fixed automatically.`);
    }
    args.setScriptValidation(validation.ok ? null : {
      source: "save_notice",
      result: validation,
    });
  }, [args]);

  const onAskAiRepairScript = useCallback(async () => {
    if (args.isRepairingScript || args.isAiProcessing) return;
    if (!args.activeDraft) return;
    if (args.ownerChatCapability.status === "checking") {
      args.setChatError("Hearth is checking private owner AI availability.");
      return;
    }
    if (args.ownerChatCapability.status === "unavailable") {
      args.setChatError("Private owner AI is unavailable in this runtime. Saved Hearth content and non-AI tools remain available.");
      return;
    }
    if (args.ownerChatCapability.status === "unknown") {
      args.setChatError("Hearth couldn’t verify private owner AI availability. Saved content and non-AI tools remain available.");
      return;
    }

    const episodeContext = args.buildActiveEpisodeContext();
    if (!episodeContext) {
      args.setChatError("Select an Episode or Spark to start.");
      return;
    }
    const operation = args.operationAuthority.begin("script.repair.ai");

    const lane = args.resolveAiLaneFromStorage();
    args.setAiBillingMode(lane);
    if (lane === "forge" && args.aiTokenBalance != null && args.aiTokenBalance <= 0) {
      args.setChatError("No AI credits remaining.");
      return;
    }

    args.setChatError(null);
    args.setAiRuntimeWarning(null);
    args.setIsRepairingScript(true);

    const repairMessage = [
      "Repair this script to satisfy the canonical Anvil tag contract.",
      "Do NOT rewrite meaning, style, or wording except where required to fix markup.",
      "Return a set_body op with the repaired script.",
      "Also include script_text and tag_audit.",
      "",
      "SCRIPT TO REPAIR:",
      args.activeDraft.body,
    ].join("\n");

    const controller = new AbortController();
    args.aiRequestControllerRef.current = controller;
    args.setIsAiProcessing(true);

    try {
      const result = await args.requestHearthChatReply(
        [{ role: "user", content: repairMessage }],
        episodeContext,
        { signal: controller.signal },
      );
      if (!args.operationAuthority.isCurrent(operation)) return;

      args.setAiBillingMode(result.runtime.billingMode);
      if (result.runtime.billingMode === "byo") {
        args.setAiTokenBalance(null);
      }

      if (!result.ok) {
        if (!result.cancelled) {
          args.setChatError(result.error ?? "Unable to repair script with AI right now.");
        }
        return;
      }

      const opBody = result.ops.find((op) => op.op === "set_body");
      const aiText = result.scriptText ?? (opBody && opBody.op === "set_body" ? opBody.value : "");
      const normalized = normalizeScriptTags(aiText);
      const repaired = repairScriptTags(normalized);
      const repairedBody = repaired.text;
      const { validation } = evaluateHearthScriptValidation(repairedBody);
      if (!validation.ok) {
        args.setScriptValidation({
          source: "ai_repair",
          result: validation,
        });
        args.setError(`Script tags must be valid before approval.\nFix the issues below to continue.\n\n${args.buildValidationReport(validation)}`);
        return;
      }

      const previousBody = args.activeDraft.body;
      const bodyChanged = repairedBody !== previousBody;
      if (bodyChanged) {
        const now = Date.now();
        const nextDraft: Draft = { ...args.activeDraft, body: repairedBody, updatedAt: now };
        args.draftEditVersionRef.current += 1;
        args.activeDraftRef.current = nextDraft;
        args.setActiveDraft((prev) => (prev && prev.id === nextDraft.id ? nextDraft : prev));
        args.setDrafts((prev) => {
          const exists = prev.some((draft) => draft.id === nextDraft.id);
          const next = exists
            ? prev.map((draft) => (draft.id === nextDraft.id ? nextDraft : draft))
            : [nextDraft, ...prev];
          return args.dedupeDraftListById(next);
        });
        args.queueAiAutosave({
          draft: nextDraft,
          previousBody,
          reasonCode: "ai_repair",
        });
      }
      args.setScriptValidation(null);

      const assistantMessage: HearthChatMessage = {
        role: "assistant",
        content: result.assistantText || "I cleaned up the script tags and left the wording alone.",
      };
      args.setChatMessages((prev) => [...prev, assistantMessage].slice(-args.chatHistoryMaxMessages));

      if (result.creditsWarning) {
        args.setAiRuntimeWarning(result.creditsWarning);
      }

      const refreshedCredits = await args.refreshMyAiCredits();
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (refreshedCredits.ok) {
        args.setAiBillingMode(refreshedCredits.runtime.billingMode);
        args.setAiTokenBalance(refreshedCredits.runtime.tokenBalance);
      }
    } finally {
      if (args.aiRequestControllerRef.current === controller) {
        args.aiRequestControllerRef.current = null;
        if (args.operationAuthority.isCurrent(operation)) {
          args.setIsAiProcessing(false);
        }
      }
      if (args.operationAuthority.isCurrent(operation)) {
        args.setIsRepairingScript(false);
      }
    }
  }, [args]);

  return {
    onFixScriptFormattingNoAi,
    onAskAiRepairScript,
  };
}
