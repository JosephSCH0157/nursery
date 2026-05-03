import type { HearthOp } from "./hearth-ai-ops";
import { normalizeHearthAiScriptIngress } from "./hearth-script-tag-policy";

export function cloneHearthProposalOps(ops: HearthOp[]): HearthOp[] {
  return ops.map((op) => {
    switch (op.op) {
      case "add_source":
        return {
          op: "add_source",
          source: { ...op.source },
        };
      case "update_source":
        return {
          op: "update_source",
          id: op.id,
          patch: { ...op.patch },
        };
      default:
        return { ...op };
    }
  });
}

export function normalizeHearthProposalOpsForScriptIngress(ops: HearthOp[]): HearthOp[] {
  return ops.map((op) => {
    if (op.op !== "set_body") return op;
    const normalized = normalizeHearthAiScriptIngress(op.value);
    return {
      ...op,
      value: normalized.text,
    };
  });
}

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

export function isHearthProposalBodyOpDirty(
  ops: HearthOp[],
  originalOps: HearthOp[],
  index: number,
): boolean {
  const current = ops[index];
  const original = originalOps[index];
  return current?.op === "set_body"
    && original?.op === "set_body"
    && current.value !== original.value;
}

export function resetHearthProposalBodyOp(
  ops: HearthOp[],
  originalOps: HearthOp[],
  index: number,
): HearthOp[] {
  const original = originalOps[index];
  if (original?.op !== "set_body") return ops;
  return updateHearthProposalBodyOp(ops, index, original.value);
}
