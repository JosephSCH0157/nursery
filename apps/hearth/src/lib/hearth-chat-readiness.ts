import type { HearthWritingFormat } from "./hearth-writing-format";

export type HearthChatHydrationStatus = "idle" | "loading" | "ready" | "error";

export function resolveHearthChatPanelMeta(
  status: HearthChatHydrationStatus,
  messageCount: number,
): string {
  if (status === "error") return "Unavailable";
  if (status === "loading") return "Loading";
  if (status === "idle") return "Select Episode";
  return messageCount > 0
    ? `${messageCount} message${messageCount === 1 ? "" : "s"}`
    : "Ready";
}

export function resolveHearthChatComposerPlaceholder(args: {
  status: HearthChatHydrationStatus;
  writingFormat: HearthWritingFormat;
}): string {
  if (args.status === "loading") return "Loading this Episode's canonical conversation...";
  if (args.status === "error") return "Conversation unavailable. Retry before continuing.";
  if (args.status === "idle") return "Select an Episode or Spark to start.";
  if (args.writingFormat === "explore_expand") {
    return "Talk it through... paste links... explore and expand the content...";
  }
  if (args.writingFormat === "full_script") {
    return "Talk it through... paste links... ask for a full script...";
  }
  return "Talk it through... paste links... keep it to bullet points...";
}
