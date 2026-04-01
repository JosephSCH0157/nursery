import {
  ALL_CANONICAL_TAGS,
  SPEAKER_CLOSE_TAGS,
  SPEAKER_OPEN_TAGS,
  normalizeScriptTags,
  repairScriptTags,
  validateScriptTags,
  type ScriptValidationResult,
} from "@forge/shared/script-tags";
import type { ComposeSetup } from "../domain/compose";
import { validateComposeContent, type ComposeContentValidationResult } from "./compose-content-validation";

export type HearthScriptTagMode = "absent" | "present";

const SCRIPT_TAG_TOKEN_PATTERN = /\[[^\]\n]+\]/g;
const CANONICAL_SPEAKER_TAGS = new Set<string>([...SPEAKER_OPEN_TAGS, ...SPEAKER_CLOSE_TAGS]);
const CANONICAL_NON_SPEAKER_TAGS = new Set<string>(
  ALL_CANONICAL_TAGS.filter((tag) => !CANONICAL_SPEAKER_TAGS.has(tag)),
);
const SPEAKERISH_TAG_PATTERN = /^\[\/?(?:s\d+|g\d+|speaker\d*|guest\d*|host|narrator)\]$/i;
const BRACKET_TAG_PATTERN = /\[[^\]\n]+\]/g;

function extractBracketTokens(input: string): string[] {
  const matches = input.match(SCRIPT_TAG_TOKEN_PATTERN) ?? [];
  return matches.map((token) => token.trim().toLowerCase());
}

export function detectHearthScriptTagMode(input: string): HearthScriptTagMode {
  const tokens = extractBracketTokens(input);
  if (tokens.length === 0) return "absent";
  if (tokens.some((token) => CANONICAL_SPEAKER_TAGS.has(token))) return "present";
  if (tokens.some((token) => SPEAKERISH_TAG_PATTERN.test(token))) return "present";
  if (tokens.some((token) => CANONICAL_NON_SPEAKER_TAGS.has(token))) return "absent";
  return "absent";
}

export function evaluateHearthScriptValidation(rawText: string): {
  normalizedText: string;
  validation: ScriptValidationResult;
  tagMode: HearthScriptTagMode;
} {
  const normalizedText = normalizeScriptTags(rawText);
  const tagMode = detectHearthScriptTagMode(normalizedText);
  if (tagMode === "absent") {
    return {
      normalizedText,
      tagMode,
      validation: {
        ok: true,
        issues: [],
        normalizedText,
      },
    };
  }
  return {
    normalizedText,
    tagMode,
    validation: validateScriptTags(normalizedText),
  };
}

export function normalizeHearthAiScriptIngress(rawText: string): {
  text: string;
  validation: ScriptValidationResult;
  fallbackApplied: boolean;
} {
  const normalized = normalizeScriptTags(rawText);
  const repaired = repairScriptTags(normalized);
  const repairedResult = evaluateHearthScriptValidation(repaired.text);
  if (repairedResult.validation.ok || repairedResult.tagMode === "absent") {
    return {
      text: repaired.text,
      validation: repairedResult.validation,
      fallbackApplied: false,
    };
  }

  const plainText = repaired.text.replace(BRACKET_TAG_PATTERN, " ").replace(/\s+/g, " ").trim();
  const wrapped = `[s1]\n${plainText || "Pending script line."}\n[/s1]`;
  const wrappedRepaired = repairScriptTags(normalizeScriptTags(wrapped));
  const wrappedResult = evaluateHearthScriptValidation(wrappedRepaired.text);
  return {
    text: wrappedRepaired.text,
    validation: wrappedResult.validation,
    fallbackApplied: true,
  };
}

export function resolveHearthComposeContentValidation(args: {
  setup: ComposeSetup | null;
  scriptText: string;
  tagValidation: ScriptValidationResult;
  tagMode: HearthScriptTagMode;
}): ComposeContentValidationResult {
  if (args.tagMode === "absent") {
    const hasText = Boolean(args.scriptText.trim());
    return {
      ok: true,
      badge: hasText ? "approval_ready" : "outline_draft",
      reasons: [],
    };
  }
  return validateComposeContent({
    setup: args.setup,
    scriptText: args.scriptText,
    tagValidation: args.tagValidation,
  });
}
