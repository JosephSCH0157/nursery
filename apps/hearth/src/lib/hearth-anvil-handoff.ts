import type { ComposeSetup } from "../domain/compose";

const BULLET_SCRIPT_STEP_MODE_HINT = "This draft is structured as a bullet script. It'll probably read best in Step mode in Anvil.";

export function getHearthAnvilStepModeHint(args: {
  composeSetup: ComposeSetup | null;
  hasScriptText: boolean;
}): string | null {
  if (!args.hasScriptText) return null;
  if (args.composeSetup?.mode !== "outline_by_speaker") return null;
  return BULLET_SCRIPT_STEP_MODE_HINT;
}
