import type { EpisodeContext } from "../../../hearth/src/lib/hearth-ai-ops";
import type { HearthChatMessage } from "../../../hearth/src/lib/hearth-ai-runtime-contract";

type ChatMessage = HearthChatMessage;

const MAX_TOTAL_CONTENT_BYTES = 1_500;
const MAX_CONTEXT_BYTES = 620;
const MAX_HISTORY_MESSAGE_BYTES = 190;
const MAX_HISTORY_MESSAGES = 4;

const EXPLICIT_TOPIC_RESET_RE = /\b(?:new topic|start over|start fresh|switch topics?|ignore (?:the )?(?:previous|earlier) (?:topic|discussion|context))\b/i;

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function clipUtf8(value: string, maximumBytes: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (utf8Bytes(normalized) <= maximumBytes) return normalized;
  let low = 0;
  let high = normalized.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (utf8Bytes(normalized.slice(0, middle)) <= Math.max(0, maximumBytes - 3)) low = middle;
    else high = middle - 1;
  }
  return `${normalized.slice(0, low).trimEnd()}...`;
}

function buildActiveEpisodeCapsule(context: EpisodeContext): string {
  const sourceSummary = context.sources
    .slice(0, 6)
    .map((source) => {
      const identity = source.title.trim() || source.url.trim();
      const note = source.note.trim();
      return clipUtf8(note ? `${identity} — ${note}` : identity, 105);
    })
    .filter(Boolean)
    .join("; ");
  const sparkSummary = context.sparks
    .slice(0, 2)
    .map((spark) => clipUtf8(spark.text, 120))
    .filter(Boolean)
    .join("; ");
  const sections = [
    `Episode ${context.episodeId}.`,
    context.title.trim() ? `Topic/title: ${clipUtf8(context.title, 150)}.` : "",
    sourceSummary ? `Retained sources: ${sourceSummary}.` : "",
    context.outline.trim() ? `Outline: ${clipUtf8(context.outline, 180)}.` : "",
    context.body.trim() ? `Current draft: ${clipUtf8(context.body, 220)}.` : "",
    context.tonePreset?.trim() ? `Tone: ${clipUtf8(context.tonePreset, 60)}.` : "",
    sparkSummary ? `Episode spark: ${sparkSummary}.` : "",
  ].filter(Boolean);
  return clipUtf8(sections.join(" "), MAX_CONTEXT_BYTES);
}

function selectRecentDistinctHistory(messages: ChatMessage[], latestUserMessage: ChatMessage): ChatMessage[] {
  const selected: ChatMessage[] = [];
  const seen = new Set([latestUserMessage.content.replace(/\s+/g, " ").trim().toLowerCase()]);
  const latestIndex = messages.lastIndexOf(latestUserMessage);
  const end = latestIndex >= 0 ? latestIndex : messages.length;
  for (let index = end - 1; index >= 0 && selected.length < MAX_HISTORY_MESSAGES; index -= 1) {
    const message = messages[index];
    if (!message || (message.role !== "user" && message.role !== "assistant")) continue;
    const content = message.content.replace(/\s+/g, " ").trim();
    const identity = content.toLowerCase();
    if (!content || seen.has(identity)) continue;
    seen.add(identity);
    selected.push({ role: message.role, content: clipUtf8(content, MAX_HISTORY_MESSAGE_BYTES) });
  }
  return selected.reverse();
}

export function buildPaidHearthConversationMessages(args: {
  episodeContext: EpisodeContext;
  messages: ChatMessage[];
  latestUserMessage: ChatMessage;
}): ChatMessage[] {
  const explicitReset = EXPLICIT_TOPIC_RESET_RE.test(args.latestUserMessage.content);
  const core = [
    "You are Hearth, a concise podcast writing collaborator.",
    "Do not behave as if each message is a new conversation unless the user clearly resets topic.",
    "Never ask for episode information already present in the active-episode context or recent turns.",
    "When asked whether the creator is ready to begin a script, assess the current episode, summarize what is established, and ask at most one genuinely missing decision.",
    "Do not invent facts.",
    "This is conversation only: do not browse, research, generate or edit a script, or return operations.",
    "Return valid Hearth JSON with assistantText, ops:[], script_text:null, and tag_audit:null.",
  ].join(" ");
  const resetInstruction = explicitReset
    ? "The creator explicitly reset the topic; answer the latest request fresh and do not reuse prior episode facts unless asked."
    : "";
  const context = explicitReset ? "" : ` Active episode: ${buildActiveEpisodeCapsule(args.episodeContext)}`;
  let systemContent = `${core}${resetInstruction ? ` ${resetInstruction}` : ""}${context}`;
  const latestContentBytes = utf8Bytes(args.latestUserMessage.content);
  const maximumSystemBytes = Math.max(utf8Bytes(core), MAX_TOTAL_CONTENT_BYTES - latestContentBytes);
  systemContent = clipUtf8(systemContent, maximumSystemBytes);

  const result: ChatMessage[] = [{ role: "system", content: systemContent }];
  if (!explicitReset) {
    for (const message of selectRecentDistinctHistory(args.messages, args.latestUserMessage)) {
      if (utf8Bytes(result.map((item) => item.content).join("")) + utf8Bytes(message.content) + latestContentBytes
        > MAX_TOTAL_CONTENT_BYTES) continue;
      result.push(message);
    }
  }
  result.push(args.latestUserMessage);
  return result;
}
