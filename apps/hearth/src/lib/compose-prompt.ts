import type { CanonicalSpeakerId, ComposeScriptRequest, ComposeSetup } from "../domain/compose";
import { HEARTH_RECORDING_READY_SCRIPT_INSTRUCTION } from "./hearth-recording-ready-script";

function formatSpeakerBlockShape(speaker: CanonicalSpeakerId, mode: ComposeSetup["mode"], targetSpeaker: CanonicalSpeakerId | null): string {
  if (mode === "outline_by_speaker") {
    return `[${speaker}]\n- Bullet point\n- Bullet point\n[/${speaker}]`;
  }
  if (mode === "full_script_single_speaker" && targetSpeaker !== speaker) {
    return `[${speaker}]\n- Placeholder / bullets allowed\n[/${speaker}]`;
  }
  return `[${speaker}]\nSpoken prose lines.\n[/${speaker}]`;
}

export function buildComposePrompt(request: ComposeScriptRequest): string {
  const { setup } = request;
  const modeLine = setup.mode === "outline_by_speaker"
    ? "outline by speaker"
    : setup.mode === "full_script_single_speaker"
      ? `full script for one speaker (${setup.targetSpeaker ?? "missing"})`
      : "full script for all speakers";

  const requiredShape = setup.speakers
    .map((speaker) => formatSpeakerBlockShape(speaker, setup.mode, setup.targetSpeaker))
    .join("\n\n");

  return [
    "Compose script using canonical Anvil tags only.",
    `Mode: ${modeLine}.`,
    `Active speakers: ${setup.speakers.join(", ")}.`,
    "Hard rules:",
    "- Use only [s1], [s2], [g1], [g2], [note], [pause], [beat], [reflective pause].",
    "- Speaker tags must be on their own lines.",
    "- Keep all spoken text inside speaker blocks.",
    "- Do not invent unsupported tags.",
    `- ${HEARTH_RECORDING_READY_SCRIPT_INSTRUCTION}`,
    "",
    "Required output structure:",
    requiredShape,
    "",
    "Source material:",
    request.sourceText,
    "",
    request.existingDraftText
      ? `Existing draft context:\n${request.existingDraftText}`
      : "",
  ].filter(Boolean).join("\n");
}
