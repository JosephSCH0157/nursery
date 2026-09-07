import type { HearthChatMessage } from "./hearth-chat-api";

export type HearthExportMessage = Readonly<{
  role: "user" | "assistant";
  content: string;
}>;

const URL_RE = /https?:\/\/[^\s<>"'`]+/g;

function exportableContent(message: HearthChatMessage): string {
  const content = message.content.replace(/\r\n?/g, "\n");
  if (message.role !== "assistant" || !content.startsWith("Spark selected:")) return content;
  return content
    .split("\n")
    .filter((line) => !/^Spark ID:\s*/i.test(line))
    .join("\n");
}

export function selectHearthExportMessages(messages: readonly HearthChatMessage[]): HearthExportMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const content = exportableContent(message);
    return content ? [{ role: message.role, content }] : [];
  });
}

export function serializeHearthConversation(
  episodeTitle: string,
  messages: readonly HearthChatMessage[],
): string {
  const title = episodeTitle.trim() || "Untitled Episode";
  const sections = selectHearthExportMessages(messages).map((message) => (
    `${message.role === "assistant" ? "Hearth" : "You"}\n${message.content}`
  ));
  return [title, ...sections].join("\n\n");
}

export function linkifyHearthText(text: string): Array<{ text: string; href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: text.slice(cursor, index) });
    const raw = match[0];
    const href = raw.replace(/[),.;:!?]+$/g, "");
    parts.push({ text: href, href });
    if (href.length < raw.length) parts.push({ text: raw.slice(href.length) });
    cursor = index + raw.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts.length ? parts : [{ text }];
}
