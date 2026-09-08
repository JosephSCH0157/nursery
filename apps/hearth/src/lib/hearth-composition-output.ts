import type { HearthOp } from "./hearth-ai-ops";
import {
  isExplicitHearthFullScriptRequest,
  isExplicitHearthOutlineRequest,
} from "./hearth-writing-format";

export type HearthCompositionRequestKind = "outline" | "script" | "compose";

export type HearthCompositionArtifactValidation = {
  ok: boolean;
  kind: HearthCompositionRequestKind | null;
  error: string | null;
};

const COMPOSE_REQUEST_RE = /^\s*compose script using canonical anvil tags only\./i;
const OUTLINE_ITEM_RE = /^\s*(?:[-*•]\s+|\d+[.)]\s+)\S+/m;
const OUTLINE_SECTION_RE = /^\s*(?:#{1,6}\s+\S+|(?:hook|opening|intro|section|beat|point|close|closing|ending|act)\b[^:\n]{0,40}:\s*\S+)/im;
const ARTIFACT_ANNOUNCEMENT_ONLY_RE = /^(?:(?:here(?:'s| is)|below is)\s+(?:a|an|the|your)\s+|i(?:'ve| have)\s+(?:created|drafted|prepared|put together)\s+(?:a|an|the|your)\s+)?(?:clean\s+|loose\s+|first[- ]draft\s+|complete\s+|full\s+)*(?:bullet(?: point)?(?: set| outline)?|outline|script|draft)(?:\s+(?:for you|based on that))?[\s.!:…-]*$/i;

function compactArtifactText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function countWords(value: string): number {
  return value.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu)?.length ?? 0;
}

function stripScriptControlTokens(value: string): string {
  return value
    .replace(/^\s*\[\/?(?:s\d+|g\d+|note)\]\s*$/gim, "")
    .replace(/\[(?:pause|beat|reflective pause)\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readLatestOpValue(ops: readonly HearthOp[], operation: "set_outline" | "set_body"): string | null {
  for (let index = ops.length - 1; index >= 0; index -= 1) {
    const op = ops[index];
    if (op?.op !== operation) continue;
    const value = op.value.trim();
    return value || null;
  }
  return null;
}

export function detectHearthCompositionRequest(text: string): HearthCompositionRequestKind | null {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return null;
  if (COMPOSE_REQUEST_RE.test(normalized)) return "compose";
  if (isExplicitHearthOutlineRequest(normalized)) return "outline";
  if (isExplicitHearthFullScriptRequest(normalized)) return "script";
  return null;
}

export function hasSubstantiveHearthOutline(value: string): boolean {
  const normalized = compactArtifactText(value);
  if (!normalized || ARTIFACT_ANNOUNCEMENT_ONLY_RE.test(normalized)) return false;
  return OUTLINE_ITEM_RE.test(normalized) || OUTLINE_SECTION_RE.test(normalized);
}

export function hasSubstantiveHearthScript(value: string): boolean {
  const normalized = compactArtifactText(value);
  if (!normalized) return false;
  const spokenText = stripScriptControlTokens(normalized);
  if (!spokenText || ARTIFACT_ANNOUNCEMENT_ONLY_RE.test(spokenText)) return false;
  if (OUTLINE_ITEM_RE.test(normalized) && countWords(spokenText) >= 2) return true;
  return spokenText.length >= 24 && countWords(spokenText) >= 5;
}

export function readLatestSubstantiveOutlineFromOps(ops: readonly HearthOp[]): string | null {
  const value = readLatestOpValue(ops, "set_outline");
  return value && hasSubstantiveHearthOutline(value) ? value : null;
}

export function readLatestSubstantiveScriptFromOps(ops: readonly HearthOp[]): string | null {
  const value = readLatestOpValue(ops, "set_body");
  return value && hasSubstantiveHearthScript(value) ? value : null;
}

export function validateHearthCompositionArtifact(args: {
  requestText?: string;
  requestKind?: HearthCompositionRequestKind | null;
  assistantText: string;
  ops: readonly HearthOp[];
}): HearthCompositionArtifactValidation {
  const kind = args.requestKind ?? detectHearthCompositionRequest(args.requestText ?? "");
  if (!kind) return { ok: true, kind: null, error: null };

  if (kind === "outline") {
    const outline = readLatestSubstantiveOutlineFromOps(args.ops);
    if (outline || hasSubstantiveHearthOutline(args.assistantText)) {
      return { ok: true, kind, error: null };
    }
    return {
      ok: false,
      kind,
      error: "Hearth did not return a usable bullet outline. No outline was created.",
    };
  }

  if (readLatestSubstantiveScriptFromOps(args.ops)) {
    return { ok: true, kind, error: null };
  }
  return {
    ok: false,
    kind,
    error: kind === "compose"
      ? "Hearth did not return usable composed script content. No script changes were created."
      : "Hearth did not return a usable script. No script changes were created.",
  };
}
