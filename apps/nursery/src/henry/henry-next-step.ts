import type { HearthHenrySignal, HenryContext } from "@forge/shared/henry";
import { deriveHenryMode } from "./henry-mode";

export function getHenryNextStep(context: HenryContext, signal: HearthHenrySignal | null): string | null {
  if (context.surface !== "hearth" || !signal) return null;

  const mode = deriveHenryMode({ context, hearthSignal: signal });
  if (!mode) return null;

  if (mode === "idle") {
    return "Start with one spark line in Hearth. Once the core claim is on the page, shape it into a rough draft.";
  }
  if (mode === "warming") {
    return "Turn the spark into a rough draft first. Keep it loose, then tighten structure in the next pass.";
  }
  if (mode === "blocked") {
    return "Fix speaker tags first so Anvil can parse the script cleanly. Keep tags on standalone lines with no overlap.";
  }
  if (mode === "structuring") {
    return "Do one read-aloud shaping pass next: shorten dense lines, add spacing, and place pacing cues where points land.";
  }
  if (mode === "recording_ready") {
    return "Run one quick read-through, then move this script to Anvil for recording.";
  }
  if (mode === "reviewing") {
    return "If this version reads cleanly out loud, approve and replace the script, then hand off to Anvil.";
  }

  return "Keep this draft in progress and take the smallest next step toward a recordable script.";
}
