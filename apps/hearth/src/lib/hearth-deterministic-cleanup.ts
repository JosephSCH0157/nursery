import { shapeHearthScriptForRecording } from "./hearth-recording-ready-script";

export const HEARTH_DETERMINISTIC_ACTIONS = [
  "format_only",
  "punctuation_cleanup",
  "grammar_cleanup",
  "deduplicate",
  "rambling_cleanup",
  "structural_cleanup",
] as const;

export type HearthDeterministicAction = (typeof HEARTH_DETERMINISTIC_ACTIONS)[number];

export type HearthDeterministicCleanupResult = {
  action: HearthDeterministicAction;
  source: string;
  result: string;
  changed: boolean;
};

const EXACT_COMMANDS: Readonly<Record<string, HearthDeterministicAction>> = {
  "/format-only": "format_only",
  "format only": "format_only",
  "format-only": "format_only",
  "/punctuation-cleanup": "punctuation_cleanup",
  "punctuation cleanup": "punctuation_cleanup",
  "fix punctuation only": "punctuation_cleanup",
  "/grammar-cleanup": "grammar_cleanup",
  "grammar cleanup": "grammar_cleanup",
  "fix grammar only": "grammar_cleanup",
  "/deduplicate": "deduplicate",
  "deduplicate": "deduplicate",
  "remove exact duplicates": "deduplicate",
  "/rambling-cleanup": "rambling_cleanup",
  "rambling cleanup": "rambling_cleanup",
  "fix rambling sentences": "rambling_cleanup",
  "/structural-cleanup": "structural_cleanup",
  "structural cleanup": "structural_cleanup",
};

const ACTION_LABELS: Record<HearthDeterministicAction, string> = {
  format_only: "Format-only",
  punctuation_cleanup: "Punctuation cleanup",
  grammar_cleanup: "Grammar cleanup",
  deduplicate: "Exact-duplicate cleanup",
  rambling_cleanup: "Rambling-sentence layout cleanup",
  structural_cleanup: "Structural cleanup",
};

function normalizeCommand(value: string): string {
  return value.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

export function isHearthDeterministicAction(value: unknown): value is HearthDeterministicAction {
  return typeof value === "string"
    && (HEARTH_DETERMINISTIC_ACTIONS as readonly string[]).includes(value);
}

/**
 * Only exact, whole-message commands qualify. Conversational text is deliberately
 * not interpreted here; semantic or ambiguous requests stay on the AI path.
 */
export function parseHearthDeterministicCommand(value: string): HearthDeterministicAction | null {
  return EXACT_COMMANDS[normalizeCommand(value)] ?? null;
}

export function getHearthDeterministicActionLabel(action: HearthDeterministicAction): string {
  return ACTION_LABELS[action];
}

function mapOutsideTags(value: string, transform: (segment: string) => string): string {
  return value
    .split(/(\[[^\]\r\n]+\])/g)
    .map((segment) => (/^\[[^\]\r\n]+\]$/.test(segment) ? segment : transform(segment)))
    .join("");
}

function cleanupPunctuationSpacing(value: string): string {
  return mapOutsideTags(value, (segment) => segment
    .replace(/[\t ]+([,.;:!?])/g, "$1")
    .replace(/([,;:!?])[\t ]{2,}/g, "$1 "));
}

function cleanupBoundedGrammar(value: string): string {
  return mapOutsideTags(value, (segment) => segment
    .replace(/\bi(?=\b|['’](?:m|d|ll|ve|re)\b)/gi, (match) => (match === "i" ? "I" : match))
    .replace(/[\t ]{2,}/g, " "));
}

function deduplicateAdjacentLines(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let priorContentKey: string | null = null;
  for (const line of lines) {
    const key = line.trim().replace(/[\t ]+/g, " ");
    if (key && key === priorContentKey) continue;
    output.push(line);
    priorContentKey = key || null;
  }
  return output.join("\n");
}

export function applyHearthDeterministicCleanup(
  action: HearthDeterministicAction,
  source: string,
): HearthDeterministicCleanupResult {
  let result: string;
  switch (action) {
    case "punctuation_cleanup":
      result = cleanupPunctuationSpacing(source);
      break;
    case "grammar_cleanup":
      result = cleanupBoundedGrammar(source);
      break;
    case "deduplicate":
      result = deduplicateAdjacentLines(source);
      break;
    case "format_only":
    case "rambling_cleanup":
    case "structural_cleanup":
      result = shapeHearthScriptForRecording(source);
      break;
  }
  return { action, source, result, changed: result !== source };
}

export function buildHearthDeterministicAssistantMessage(result: HearthDeterministicCleanupResult): string {
  const label = getHearthDeterministicActionLabel(result.action);
  return result.changed
    ? `${label} is ready to review. No AI or provider was used.`
    : `${label} found no mechanical changes to make. No AI or provider was used.`;
}
