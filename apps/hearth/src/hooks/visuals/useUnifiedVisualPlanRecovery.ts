import { useEffect } from "react";
import {
  generateOrResumeUnifiedVisualPlan,
  readLatestUnifiedVisualPlanOperation,
} from "../../lib/hearth-unified-visual-plan-authority";

type RecoveryDependencies = {
  readLatest: typeof readLatestUnifiedVisualPlanOperation;
  resume: typeof generateOrResumeUnifiedVisualPlan;
};

const defaultDependencies: RecoveryDependencies = {
  readLatest: readLatestUnifiedVisualPlanOperation,
  resume: generateOrResumeUnifiedVisualPlan,
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
  refresh: () => Promise<void>;
  dependencies?: RecoveryDependencies;
}) {
  const dependencies = args.dependencies ?? defaultDependencies;

  useEffect(() => {
    if (!args.workspaceId || !args.workpieceId || !args.hasApprovedScript) return;
    let cancelled = false;
    void (async () => {
      const latest = await dependencies.readLatest(args.workspaceId!, args.workpieceId!);
      if (cancelled || !latest.ok || !latest.data || latest.data.state === "verified") return;
      const operationId = String(latest.data.operation_id ?? "");
      if (!operationId || attemptedRecoveryOperations.has(operationId)) return;
      attemptedRecoveryOperations.add(operationId);
      args.setBusy(true);
      args.setSaveState("saving");
      args.setMessage(`Resuming canonical Visual Plan from ${String(latest.data.state ?? "the last committed stage").replaceAll("_", " ")}…`);
      const resumed = await dependencies.resume({ workspaceId: args.workspaceId!, workpieceId: args.workpieceId! });
      if (cancelled) return;
      if (!resumed.ok) {
        args.setSaveState("error");
        args.setError(`${resumed.stage ? `${resumed.stage}: ` : ""}${resumed.error}`);
      } else {
        await args.refresh();
        if (!cancelled) {
          args.setSaveState("saved");
          args.setMessage("Recovered and verified the canonical Visual Plan without another provider request.");
        }
      }
      if (!cancelled) args.setBusy(false);
    })();
    return () => { cancelled = true; };
  }, [
    args.hasApprovedScript,
    args.refresh,
    args.setBusy,
    args.setError,
    args.setMessage,
    args.setSaveState,
    args.workspaceId,
    args.workpieceId,
    dependencies,
  ]);
}
