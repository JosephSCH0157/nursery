import type { Draft } from "../../domain/draft";

export type HearthAnvilHandoffEligibility =
  | { kind: "no_workspace" }
  | { kind: "no_workpiece" }
  | { kind: "archived" }
  | { kind: "no_draft" }
  | { kind: "no_script" }
  | { kind: "invalid"; reason: string }
  | { kind: "destination_unavailable" }
  | { kind: "ready" };

export type HearthAnvilHandoffController = {
  state: {
    selectedScript: {
      draftId: string;
      content: string;
      updatedAt: number;
    } | null;
    eligibility: HearthAnvilHandoffEligibility;
    validation: {
      blocked: boolean;
      readOnly: true;
    };
    destination: string | null;
  };
  commands: {
    validateHandoff: () => Promise<void>;
    retryValidation: () => Promise<void>;
    openInAnvil: () => Promise<void>;
  };
  status: {
    readiness: "blocked" | "ready";
    validation: "idle" | "invalid" | "valid";
    opening: "idle";
  };
  surface: {
    openInAnvilHref: string | null;
    handoffBlocked: boolean;
    onOpenInAnvil: () => Promise<void>;
    anvilStepModeHint: string | null;
  };
};

export type HearthAnvilSelectedDraft = Pick<Draft, "id" | "body" | "updatedAt">;
