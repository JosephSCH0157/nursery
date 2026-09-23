import { useEffect, useState } from "react";
import {
  recoverUnifiedVisualPlanOperation,
  readLatestUnifiedVisualPlanOperation,
} from "../../lib/hearth-unified-visual-plan-authority";

type RecoveryDependencies = {
  readLatest: typeof readLatestUnifiedVisualPlanOperation;
  resume: typeof recoverUnifiedVisualPlanOperation;
};

const defaultDependencies: RecoveryDependencies = {
  readLatest: readLatestUnifiedVisualPlanOperation,
  resume: recoverUnifiedVisualPlanOperation,
};

const attemptedRecoveryOperations = new Set<string>();

export function useUnifiedVisualPlanRecovery(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  hasApprovedScript: boolean;
  setBusy: (busy: boolean) => void;
  setSaveState: (state: "saved" | "saving" | "error") => void;
  setMessage: (message: string) => void;
  setError: (message: string) => void;
  setOperationState?: (state: string | null) => void;
  refresh: () => Promise<void>;
  dependencies?: RecoveryDependencies;
}): { retryBlocked: boolean } {
  const dependencies = args.dependencies ?? defaultDependencies;
  const [retryBlocked, setRetryBlocked] = useState(false);

  useEffect(() => { setRetryBlocked(false); }, [args.workpieceId]);

  useEffect(() => {
    if (!args.workspaceId || !args.workpieceId || !args.hasApprovedScript) return;
    let cancelled = false;
    let ownsBusy = false;
    void (async () => {
      try {
        const latest = await dependencies.readLatest(args.workspaceId!, args.workpieceId!);
        if (cancelled || !latest.ok) return;
        args.setOperationState?.(latest.data ? String(latest.data.state ?? "") || null : null);
        if (!latest.data || latest.data.state === "verified" || latest.data.state === "failed") return;
        const operationId = String(latest.data.operation_id ?? "");
        if (!operationId) return;
        if (latest.data.state === "submission_unknown") {
          setRetryBlocked(true);
          args.setSaveState("error");
          args.setMessage("Visual Plan submission outcome is unknown. Forge will not submit this request again.");
          args.setError("OpenAI may have received the request. Use recovery readback or API / Ledger while reconciliation is pending.");
          return;
        }
        if (attemptedRecoveryOperations.has(operationId)) return;
        attemptedRecoveryOperations.add(operationId);
        ownsBusy = true;
        args.setBusy(true);
        args.setSaveState("saving");
        args.setMessage(`Reading back canonical Visual Plan recovery from ${String(latest.data.state ?? "the last committed stage").replaceAll("_", " ")}…`);
        const resumed = await dependencies.resume({ workspaceId: args.workspaceId!, workpieceId: args.workpieceId! });
        if (cancelled) return;
        if (!resumed.ok) {
          const unknown = resumed.code === "paid_submission_unknown" || resumed.stage === "submission_unknown";
          if (unknown) args.setOperationState?.("submission_unknown");
          setRetryBlocked(unknown || resumed.code === "unified_visual_plan_recovery_required");
          args.setSaveState("error");
          args.setMessage(unknown
            ? "Visual Plan submission outcome is unknown. Forge will not submit this request again."
            : "Visual Plan recovery did not authorize another provider submission.");
          args.setError(`${resumed.stage ? `${resumed.stage}: ` : ""}${resumed.error}`);
        } else {
          await args.refresh();
          if (!cancelled) {
            args.setOperationState?.("verified");
            setRetryBlocked(false);
            args.setSaveState("saved");
            args.setMessage("Recovered and verified the canonical Visual Plan without another provider request.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          args.setSaveState("error");
          args.setError(error instanceof Error ? error.message : "Visual Plan recovery failed.");
        }
      } finally {
        if (ownsBusy) args.setBusy(false);
      }
    })();
    return () => { cancelled = true; if (ownsBusy) args.setBusy(false); };
  }, [
    args.hasApprovedScript,
    args.refresh,
    args.setBusy,
    args.setError,
    args.setMessage,
    args.setOperationState,
    args.setSaveState,
    args.workspaceId,
    args.workpieceId,
    dependencies,
  ]);
  return { retryBlocked };
}
