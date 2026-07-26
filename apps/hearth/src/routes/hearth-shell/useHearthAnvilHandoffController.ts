import { useMemo } from "react";
import type { Draft } from "../../domain/draft";
import type { ComposeSetup } from "../../domain/compose";
import { useHearthAnvilOpenAction } from "../../hooks/useHearthAnvilOpenAction";
import { getHearthAnvilStepModeHint } from "../../lib/hearth-anvil-handoff";
import { buildHearthAnvilDestination } from "./hearth-anvil-destination";
import { deriveHearthAnvilHandoffEligibility } from "./buildHearthAnvilHandoffViewModel";
import type { HearthAnvilHandoffController } from "./hearth-anvil-handoff-contracts";

export function useHearthAnvilHandoffProjection(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  archived: boolean;
  composeSetup: ComposeSetup | null;
  scriptText: string;
}) {
  const destination = useMemo(
    () => buildHearthAnvilDestination(args),
    [args.archived, args.workspaceId, args.workpieceId],
  );
  const stepModeHint = useMemo(
    () => getHearthAnvilStepModeHint({
      composeSetup: args.composeSetup,
      hasScriptText: Boolean(args.scriptText.trim()),
    }),
    [args.composeSetup, args.scriptText],
  );
  return { destination, stepModeHint };
}

export const useHearthAnvilHandoffOpenCommand = useHearthAnvilOpenAction;

export function buildHearthAnvilHandoffController(args: {
  activeDraft: Draft | null;
  workspaceId: string | null;
  workpieceId: string | null;
  archived: boolean;
  handoffBlocked: boolean;
  destination: string | null;
  stepModeHint: string | null;
  openInAnvil: () => Promise<void>;
}): HearthAnvilHandoffController {
  const eligibility = deriveHearthAnvilHandoffEligibility({
    workspaceId: args.workspaceId,
    workpieceId: args.workpieceId,
    archived: args.archived,
    draftId: args.activeDraft?.id ?? null,
    scriptText: args.activeDraft?.body ?? "",
    handoffBlocked: args.handoffBlocked,
    destination: args.destination,
  });
  const validateHandoff = async () => {};
  return {
    state: {
      selectedScript: args.activeDraft
        ? {
            draftId: args.activeDraft.id,
            content: args.activeDraft.body,
            updatedAt: args.activeDraft.updatedAt,
          }
        : null,
      eligibility,
      validation: {
        blocked: args.handoffBlocked,
        readOnly: true,
      },
      destination: args.destination,
    },
    commands: {
      validateHandoff,
      retryValidation: validateHandoff,
      openInAnvil: args.openInAnvil,
    },
    status: {
      readiness: eligibility.kind === "ready" ? "ready" : "blocked",
      validation: args.handoffBlocked
        ? "invalid"
        : args.activeDraft?.body.trim()
          ? "valid"
          : "idle",
      opening: "idle",
    },
    surface: {
      openInAnvilHref: args.destination,
      handoffBlocked: args.handoffBlocked,
      onOpenInAnvil: args.openInAnvil,
      anvilStepModeHint: args.stepModeHint,
    },
  };
}
