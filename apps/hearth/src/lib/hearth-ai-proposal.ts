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
  let lastBodyIndex = -1;
  for (let index = 0; index < ops.length; index += 1) {
    if (ops[index]?.op === "set_body") {
      lastBodyIndex = index;
    }
  }

  const normalizedOps: HearthOp[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index];
    if (op.op !== "set_body") {
      normalizedOps.push(op);
      continue;
    }
    if (index !== lastBodyIndex) continue;
    const normalized = normalizeHearthAiScriptIngress(op.value);
    normalizedOps.push({
      ...op,
      value: normalized.text,
    });
  }
  return normalizedOps;
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
