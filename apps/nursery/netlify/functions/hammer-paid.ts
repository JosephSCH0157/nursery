import { createNetlifyHammerFunction } from "./_hammer-handler";

export default createNetlifyHammerFunction();

export const config = {
  path: [
    "/api/hammer/editorial/transcript-cleanup",
    "/api/hammer/shorts/discover",
    "/api/hammer/prep/transcript",
  ],
};
