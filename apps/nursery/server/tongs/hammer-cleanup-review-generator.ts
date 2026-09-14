import { buildCleanupCandidateQueue } from "../../../hammer/src/editor/hammerCleanupCandidateQueue";
import type {
  FillerCleanupOptions,
  RetakeCleanupOptions,
} from "../../../hammer/src/editor/hammerCleanupTools";
import type { CleanupGenerator } from "../../../../packages/tongs/src/hammer-cleanup-review-contract";

/** Both browser and server run the same pure generator; never trust submitted cards. */
export const generateCanonicalCleanupCandidates: CleanupGenerator = (
  kind,
  segments,
  options,
) =>
  buildCleanupCandidateQueue({
    kind,
    segments,
    handledCandidateIds: new Set(),
    fillerOptions:
      kind === "fillers"
        ? (options as FillerCleanupOptions)
        : { aggressiveness: "medium", protectIntentionalPhrasing: true },
    retakeOptions:
      kind === "retakes"
        ? (options as RetakeCleanupOptions)
        : {
            detection: "normal",
            preferLaterCleanerTake: true,
            honorExplicitRetakePhrases: true,
            sameSpeakerOnly: true,
          },
  }).cards;
