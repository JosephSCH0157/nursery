import type { HenryAILane, HenryContext } from "@forge/shared/henry";

const USER_METERED_PATTERNS: RegExp[] = [
  /\bwrite\s+(me|a|the)?\s*(full\s+)?script\b/i,
  /\brewrite\s+(the|this)\s+script\b/i,
  /\bgenerate\s+\d+\s+(title|titles|options)\b/i,
  /\bgenerate\b.*\b(thumbnail|thumbnails|asset|assets|image|images)\b/i,
  /\bcreate\b.*\b(thumbnail|thumbnails|image|images)\b/i,
  /\b(full|complete)\s+(draft|outline|script)\b/i,
  /\bbulk\b.*\b(rewrite|generate|transform)\b/i,
];

const FREE_HELP_PATTERNS: RegExp[] = [
  /\bwhat does\b.*\b(do|mean)\b/i,
  /\bwhy\b.*\b(disabled|failing|broken|blocked)\b/i,
  /\bwhere\b.*\b(recording|save|saved|go|goes)\b/i,
  /\bhow do i\b/i,
  /\bhow to\b/i,
  /\bwhat file\b/i,
  /\bwhat test\b/i,
  /\bwhat broke\b/i,
  /\bwhat should i do next\b/i,
  /\bnext step\b/i,
  /\bworkflow\b/i,
  /\bdebug\b/i,
  /\bexplain\b/i,
];

export function classifyHenryAiLane(question: string, context: HenryContext): HenryAILane {
  const text = question.trim();
  if (!text) return "none";

  for (const pattern of USER_METERED_PATTERNS) {
    if (pattern.test(text)) return "user_metered";
  }
  for (const pattern of FREE_HELP_PATTERNS) {
    if (pattern.test(text)) return "free_help";
  }

  // Default explicit Henry chat to help mode for guidance-oriented conversation.
  if (context.surface === "hearth") return "free_help";
  return "none";
}

export function buildHenryUserMeteredBoundaryReply(): string {
  return "I can help pressure-test or clarify direction here. For full generation, use an explicit Hearth rewrite or generation action.";
}
