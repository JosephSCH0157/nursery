import type { HearthOp } from "./hearth-ai-ops";

export function updateHearthProposalBodyOp(
  ops: HearthOp[],
  index: number,
  value: string,
): HearthOp[] {
  return ops.map((op, currentIndex) => (
    currentIndex === index && op.op === "set_body"
      ? { op: "set_body", value }
      : op
  ));
}
