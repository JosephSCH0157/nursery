import type { EpisodeContext } from "../../../hearth/src/lib/hearth-ai-ops";

type ChatMessage = { role: string; content: string };

const MAX_TOTAL_CONTENT_BYTES = 24_000;
const MAX_BODY_BYTES = 6_000;
const MAX_OUTLINE_BYTES = 3_000;
const MAX_RESEARCH_BYTES = 7_500;
const MAX_HISTORY_MESSAGE_BYTES = 700;
const MAX_HISTORY_MESSAGES = 8;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

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

function canonicalResearchSummary(rows: unknown[]): string {
  const summaries: string[] = [];
  for (const raw of rows.slice(0, 3)) {
    const row = asRecord(raw);
    const result = asRecord(row.result_json);
    const research = asRecord(result.research_result);
    const synthesis = asRecord(research.synthesis);
    const keyPoints = Array.isArray(synthesis.keyPoints)
      ? synthesis.keyPoints.map(text).filter(Boolean).slice(0, 5)
      : [];
    const uncertainties = Array.isArray(synthesis.uncertainties)
      ? synthesis.uncertainties.map(text).filter(Boolean).slice(0, 3)
      : [];
    const sources = Array.isArray(research.sources)
      ? research.sources.map((source) => {
          const item = asRecord(source);
          const title = text(item.title);
          const url = text(item.canonicalUrl) || text(item.resolvedUrl) || text(item.url);
          const snippet = text(item.snippet);
          const status = text(item.extractionStatus);
          return clipUtf8([
            title,
            url ? `(${url})` : "",
            status ? `[${status}]` : "",
            snippet ? `— ${snippet}` : "",
          ].filter(Boolean).join(" "), 520);
        }).filter(Boolean).slice(0, 8)
      : [];
    const assistantConclusion = text(result.assistant_text);
    const section = [
      assistantConclusion ? `Conclusion: ${clipUtf8(assistantConclusion, 1_000)}` : "",
      keyPoints.length ? `Key points: ${keyPoints.map((point) => clipUtf8(point, 600)).join(" | ")}` : "",
      sources.length ? `Retained sources: ${sources.join(" | ")}` : "",
      uncertainties.length ? `Evidence limits: ${uncertainties.map((item) => clipUtf8(item, 400)).join(" | ")}` : "",
    ].filter(Boolean).join("\n");
    if (section) summaries.push(section);
  }
  return clipUtf8(summaries.join("\n\n"), MAX_RESEARCH_BYTES);
}

function recentEditorialTurns(messages: ChatMessage[], latestUserMessage: ChatMessage): ChatMessage[] {
  const latestIndex = messages.lastIndexOf(latestUserMessage);
  const end = latestIndex >= 0 ? latestIndex : messages.length;
  const selected: ChatMessage[] = [];
  for (let index = end - 1; index >= 0 && selected.length < MAX_HISTORY_MESSAGES; index -= 1) {
    const message = messages[index];
    if (!message || (message.role !== "user" && message.role !== "assistant")) continue;
    const content = clipUtf8(message.content, MAX_HISTORY_MESSAGE_BYTES);
    if (!content) continue;
    selected.push({ role: message.role, content });
  }
  return selected.reverse();
}

export function buildPaidHearthScriptGenerationMessages(args: {
  episodeContext: EpisodeContext;
  messages: ChatMessage[];
  latestUserMessage: ChatMessage;
  canonicalResearchRows: unknown[];
}): ChatMessage[] {
  const system = [
    "You are Hearth, a podcast script collaborator generating one immutable script proposal for the current active episode.",
    "Use only the bounded active-episode context, retained research conclusions and sources, and final editorial decisions provided below.",
    "Do not browse, retrieve, call tools, purchase anything, or claim that the proposal was applied to the canonical draft.",
    "Return ONLY valid JSON: {\"assistantText\":string,\"ops\":[{\"op\":\"set_body\",\"value\":string}],\"script_text\":string,\"tag_audit\":object,\"research_artifact\":null}.",
    "Produce a substantive first draft for one presenter. Because target length is unresolved for this canary, choose a useful substantive draft that fits the accepted output ceiling; do not ask the creator to choose a permanent default.",
    "script_text and the set_body value must match. Wrap all spoken prose in [s1] and [/s1], each on its own line.",
    "Allowed pacing tokens are [pause], [beat], and [reflective pause]. Do not use Markdown speaker labels or any other control markup.",
    "Keep blocks teleprompter-readable, close every tag, and include tag_audit confirming valid closure, standalone tags, and no unrecognized markup.",
    "The output is a proposal only. Applying it to the canonical draft requires a later, separate creator action.",
  ].join(" ");

  const sourceLines = args.episodeContext.sources.slice(0, 12).map((source) => {
    const title = clipUtf8(source.title || source.url, 240);
    const note = clipUtf8(source.note, 320);
    return `- ${title}${source.url ? ` (${source.url})` : ""}${note ? ` — ${note}` : ""}`;
  }).filter(Boolean);
  const episode = [
    `Episode ID: ${args.episodeContext.episodeId}`,
    `Title/topic: ${clipUtf8(args.episodeContext.title, 500) || "Unresolved"}`,
    args.episodeContext.outline.trim() ? `Current outline:\n${clipUtf8(args.episodeContext.outline, MAX_OUTLINE_BYTES)}` : "Current outline: none retained.",
    args.episodeContext.body.trim() ? `Current draft fragment:\n${clipUtf8(args.episodeContext.body, MAX_BODY_BYTES)}` : "Current draft fragment: none retained.",
    args.episodeContext.tonePreset?.trim() ? `Tone: ${clipUtf8(args.episodeContext.tonePreset, 200)}` : "",
    sourceLines.length ? `Workspace sources:\n${sourceLines.join("\n")}` : "Workspace sources: none retained.",
    args.episodeContext.sparks.length
      ? `Episode sparks:\n${args.episodeContext.sparks.slice(0, 5).map((spark) => `- ${clipUtf8(spark.text, 500)}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");
  const research = canonicalResearchSummary(args.canonicalResearchRows);
  const contextMessage = clipUtf8([
    "ACTIVE EPISODE CONTEXT",
    episode,
    research ? `CANONICAL RETAINED RESEARCH\n${research}` : "CANONICAL RETAINED RESEARCH\nNo retained research result was available.",
  ].join("\n\n"), MAX_TOTAL_CONTENT_BYTES - utf8Bytes(system) - utf8Bytes(args.latestUserMessage.content) - 1_500);

  const result: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: contextMessage },
  ];
  for (const message of recentEditorialTurns(args.messages, args.latestUserMessage)) {
    const projected = result.reduce((sum, item) => sum + utf8Bytes(item.content), 0)
      + utf8Bytes(message.content) + utf8Bytes(args.latestUserMessage.content);
    if (projected <= MAX_TOTAL_CONTENT_BYTES) result.push(message);
  }
  result.push(args.latestUserMessage);
  return result;
}
