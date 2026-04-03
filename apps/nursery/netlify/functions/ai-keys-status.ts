import { HEARTH_AI_ROUTES } from "../../../hearth/src/lib/hearth-ai-runtime-contract";
import { createNetlifyHearthFunction } from "./_hearth-handler";

export default createNetlifyHearthFunction(HEARTH_AI_ROUTES.aiKeysStatus);
