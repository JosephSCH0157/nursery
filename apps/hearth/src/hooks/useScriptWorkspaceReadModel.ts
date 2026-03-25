import { useMemo } from "react";
import type { Draft } from "../domain/draft";
import type { ComposeSetup, ScriptCompletionBadge } from "../domain/compose";
import { getScriptReadiness } from "../lib/hearth-script-readiness";
import { validateComposeContent } from "../lib/compose-content-validation";
import type { ScriptValidationResult } from "@forge/shared/script-tags";

type HearthScriptState = {
  rawText: string;
  normalizedText: string;
  validation: ScriptValidationResult;
  lastValidatedAt: string | null;
  isDirty: boolean;
};

type UseScriptWorkspaceReadModelArgs = {
  activeDraft: Draft | null;
  draftSnapshotBody: string | null;
  evaluateScriptValidation: (rawText: string) => {
    normalizedText: string;
    validation: ScriptValidationResult;
  };
};

export function useScriptWorkspaceReadModel(args: UseScriptWorkspaceReadModelArgs): {
  hearthScriptState: HearthScriptState | null;
  effectiveComposeSetup: ComposeSetup | null;
  composeContentValidation: {
    ok: boolean;
    badge: ScriptCompletionBadge;
    reasons: string[];
  };
  scriptReadiness: ReturnType<typeof getScriptReadiness>;
  approvalBlocked: boolean;
  handoffBlocked: boolean;
} {
  const hearthScriptState = useMemo<HearthScriptState | null>(() => {
    if (!args.activeDraft) return null;
    const rawText = args.activeDraft.body ?? "";
    const { normalizedText, validation } = args.evaluateScriptValidation(rawText);
    return {
      rawText,
      normalizedText,
      validation,
      lastValidatedAt: new Date().toISOString(),
      isDirty: args.draftSnapshotBody !== rawText,
    };
  }, [args.activeDraft, args.draftSnapshotBody, args.evaluateScriptValidation]);

  const effectiveComposeSetup = useMemo<ComposeSetup | null>(() => {
    const meta = args.activeDraft?.scriptAuthoringMeta;
    if (meta) {
      return {
        speakerCount: meta.speakerCount,
        speakers: meta.speakers,
        mode: meta.composeMode,
        targetSpeaker: meta.targetSpeaker,
        usesProductionDefault: !meta.isOverrideFromProductionDefault,
        isOverrideFromProductionDefault: meta.isOverrideFromProductionDefault,
      };
    }
    return null;
  }, [args.activeDraft?.scriptAuthoringMeta]);

  const composeContentValidation = useMemo(() => {
    if (!args.activeDraft || !hearthScriptState) {
      return {
        ok: false,
        badge: "outline_draft" as ScriptCompletionBadge,
        reasons: ["No draft selected."],
      };
    }
    return validateComposeContent({
      setup: effectiveComposeSetup,
      scriptText: hearthScriptState.normalizedText,
      tagValidation: hearthScriptState.validation,
    });
  }, [args.activeDraft, effectiveComposeSetup, hearthScriptState]);

  const scriptReadiness = useMemo(() => getScriptReadiness({
    hasScriptText: Boolean((args.activeDraft?.body ?? "").trim()),
    tagValidationOk: hearthScriptState?.validation.ok ?? false,
    composeSetup: effectiveComposeSetup,
    contentValidationOk: composeContentValidation.ok,
    completionBadge: composeContentValidation.badge,
  }), [
    args.activeDraft?.body,
    composeContentValidation.badge,
    composeContentValidation.ok,
    effectiveComposeSetup,
    hearthScriptState?.validation.ok,
  ]);

  const approvalBlocked = !scriptReadiness.ready;
  const handoffBlocked = !scriptReadiness.ready;

  return {
    hearthScriptState,
    effectiveComposeSetup,
    composeContentValidation,
    scriptReadiness,
    approvalBlocked,
    handoffBlocked,
  };
}

