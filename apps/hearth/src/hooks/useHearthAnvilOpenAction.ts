import { useCallback } from "react";
import type { Draft } from "../domain/draft";
import { resolveTongsRequestApiToken } from "../lib/tongs-fetch";
import type { ScriptValidationResult } from "@forge/shared/script-tags";
import type { RevisionKind } from "../domain/revision";

type UseHearthAnvilOpenActionArgs = {
  activeDraft: Draft | null;
  activeWorkpieceIsArchived: boolean;
  workspaceId: string | null;
  workpieceId: string | null;
  validatorVersion: string;
  setError: (next: string | null) => void;
  setScriptValidation: (next: {
    source: "save_gate" | "save_notice" | "ai_repair";
    result: ScriptValidationResult;
  } | null) => void;
  evaluateScriptValidation: (rawText: string) => {
    normalizedText: string;
    validation: ScriptValidationResult;
  };
  buildValidationReport: (validation: ScriptValidationResult) => string;
  buildPersistedValidationMeta: (validation: ScriptValidationResult) => Draft["scriptValidationMeta"];
  buildOpenInAnvilHref: (workspace: string, episodeId: string) => string | null;
  persistDraft: (args: {
    draft: Draft;
    updatedAt: number;
    createRevision: { kind: RevisionKind; note?: string } | null;
    syncSources?: boolean;
    syncSession?: boolean;
    showSavingState?: boolean;
    validateForAnvil?: boolean;
    quietFailure?: boolean;
    saveReason?: string;
  }) => Promise<boolean>;
  publishPrimaryScript: (args: {
    episodeId: string;
    scriptText: string;
    validatorVersion: string;
  }) => Promise<{ ok: boolean; status?: number }>;
  flushChatHistoryNow: (args?: { draftId?: string | null }) => void;
};

export function useHearthAnvilOpenAction(args: UseHearthAnvilOpenActionArgs) {
  return useCallback(async () => {
    const workspace = args.workspaceId?.trim() ?? "";
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!workspace || !episodeId) {
      args.setError("Start Recording needs a valid workspace and episode.");
      return;
    }
    if (args.activeWorkpieceIsArchived) {
      args.setError("This episode is archived. Restore it in Hearth before recording.");
      return;
    }
    const href = args.buildOpenInAnvilHref(workspace, episodeId);
    if (!href) {
      args.setError("Start Recording is unavailable until episode context finishes loading.");
      return;
    }
    args.setError(null);
    if (!args.activeDraft) {
      window.location.assign(href);
      return;
    }

    if (!args.activeDraft.body.trim()) {
      args.setError("No script yet. Write a script before opening in Anvil.");
      return;
    }

    const { normalizedText, validation } = args.evaluateScriptValidation(args.activeDraft.body);
    if (!validation.ok) {
      args.setScriptValidation({
        source: "save_gate",
        result: validation,
      });
      args.setError(`Script tags must be valid before approval.\nFix the issues below to continue.\n\n${args.buildValidationReport(validation)}`);
      return;
    }

    const now = Date.now();
    const saved = await args.persistDraft({
      draft: {
        ...args.activeDraft,
        body: normalizedText,
        updatedAt: now,
        scriptValidationMeta: args.buildPersistedValidationMeta(validation),
      },
      updatedAt: now,
      createRevision: null,
      syncSources: false,
      syncSession: false,
      validateForAnvil: true,
    });
    if (!saved) return;

    const published = await args.publishPrimaryScript({
      episodeId,
      scriptText: normalizedText,
      validatorVersion: args.validatorVersion,
    });
    if (!published.ok) {
      const statusText = published.status ? ` (${published.status})` : "";
      args.setError(`Failed to publish script for Anvil${statusText}. Try again.`);
      return;
    }

    // Bridge token for Anvil static runtime so /tongs calls stay authorized after redirect.
    try {
      const token = resolveTongsRequestApiToken();
      if (token) {
        window.localStorage.setItem("forge_tongs_api_token_v1", token);
      }
    } catch {
      // ignore token bridge failures
    }

    args.flushChatHistoryNow({ draftId: args.activeDraft.id });
    window.location.assign(href);
  }, [args]);
}
