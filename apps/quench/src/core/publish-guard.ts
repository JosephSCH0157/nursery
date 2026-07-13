export type QuenchPublishAuthorityVerdict = {
  status: "ready" | "needs_review" | "blocked";
  ready?: boolean;
  ready_for_quench?: boolean;
};

/** Publish authority is fail-closed: status and the applicable readiness flag must agree. */
export function canExecuteQuenchPublish(verdict: QuenchPublishAuthorityVerdict | null | undefined): boolean {
  if (!verdict || verdict.status !== "ready") return false;
  const flags = [verdict.ready, verdict.ready_for_quench]
    .filter((value): value is boolean => typeof value === "boolean");
  return flags.length > 0 && flags.every(Boolean);
}

export async function executeQuenchPublishIfReady<T>(
  verdict: QuenchPublishAuthorityVerdict | null | undefined,
  execute: () => Promise<T>,
): Promise<{ executed: false } | { executed: true; value: T }> {
  if (!canExecuteQuenchPublish(verdict)) return { executed: false };
  return { executed: true, value: await execute() };
}
