import { ANVIL_WHISPER_ROUTE } from "../../server/anvil/create-anvil-whisper-handler";
import { createNetlifyAnvilFunction } from "./_anvil-handler";

export default createNetlifyAnvilFunction(ANVIL_WHISPER_ROUTE);
