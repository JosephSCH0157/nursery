export function shouldKeepHearthOutlineInChatOnly(args: {
  productionAction: boolean;
  autosaveReasonCode: string | null;
  ops: Array<{ op: string }>;
}): boolean {
  if (args.productionAction) return false;
  if (args.autosaveReasonCode !== "ai_outline") return false;
  return !args.ops.some((op) => op.op === "set_body");
}
