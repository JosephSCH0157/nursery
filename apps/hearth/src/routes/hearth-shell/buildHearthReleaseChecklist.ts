import type { EpisodeMediaMapStatus } from "../../lib/episode-package-v2";
import type { HearthReleaseChecklistItem } from "./hearth-release-preparation-contracts";

export function buildHearthReleaseChecklist(input: {
  scriptAuthorityAvailable: boolean;
  hasApprovedScript: boolean;
  mediaAuthorityAvailable: boolean;
  mediaMapStatus: EpisodeMediaMapStatus | null;
  metadataAuthorityAvailable: boolean;
  metadataComplete: boolean;
  thumbnailAuthorityAvailable: boolean;
  thumbnailsSelected: boolean;
}): ReadonlyArray<HearthReleaseChecklistItem> {
  const mediaPlanComplete = input.mediaMapStatus === "activated"
    || input.mediaMapStatus === "fulfilling"
    || input.mediaMapStatus === "fulfilled";
  const item = (
    id: HearthReleaseChecklistItem["id"],
    label: string,
    available: boolean,
    complete: boolean,
    reason: string,
  ): HearthReleaseChecklistItem => Object.freeze({
    id,
    label,
    state: !available ? "unavailable" : complete ? "complete" : "incomplete",
    reason: !available ? `${label} authority unavailable.` : complete ? null : reason,
  });
  return Object.freeze([
    item("script", "Script approved", input.scriptAuthorityAvailable, input.hasApprovedScript, "Approved script required."),
    item("media_plan", "Media plan activated", input.mediaAuthorityAvailable, mediaPlanComplete, "Activate the media plan."),
    item("metadata", "Framing complete", input.metadataAuthorityAvailable, input.metadataComplete, "Complete canonical Metadata."),
    item("thumbnail", "Thumbnails selected", input.thumbnailAuthorityAvailable, input.thumbnailsSelected, "Select a canonical thumbnail."),
  ]);
}
