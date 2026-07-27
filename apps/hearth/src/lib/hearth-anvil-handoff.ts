import { isBulletOutlineScript } from "./hearth-spoken-beats";

const BULLET_SCRIPT_STEP_MODE_HINT = "This draft is structured as a bullet script. It'll probably read best in Step mode in Anvil.";

export function getHearthAnvilStepModeHint(args: {
  scriptText: string;
}): string | null {
  if (!isBulletOutlineScript(args.scriptText)) return null;
  return BULLET_SCRIPT_STEP_MODE_HINT;
}
