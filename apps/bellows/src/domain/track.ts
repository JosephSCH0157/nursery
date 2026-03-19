import type { ArtifactId, ParticipantId, SegmentId, TrackId } from "./ids.js";
import type {
  BellowsAudioFormat,
  BellowsDurationMs,
  BellowsFrameRate,
  BellowsResolution,
} from "./primitives.js";
import type { BellowsContinuityFlag } from "./segment.js";

export type BellowsTrackKind = "video" | "audio";

export interface BellowsTrack {
  readonly trackId: TrackId;
  readonly artifactId: ArtifactId | null;
  readonly participantId: ParticipantId;
  readonly kind: BellowsTrackKind;
  readonly codec: string;
  readonly resolution: BellowsResolution | null;
  readonly frameRate: BellowsFrameRate | null;
  readonly audioFormat: BellowsAudioFormat | null;
  readonly durationMs: BellowsDurationMs | null;
  readonly continuityFlag: BellowsContinuityFlag;
  readonly segmentIds: readonly SegmentId[];
}
