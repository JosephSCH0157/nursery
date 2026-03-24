export interface HammerTranscriptSegment {
  segment_id: string;
  start_sec: number;
  end_sec: number;
  speaker: string;
  text: string;
  is_disabled?: boolean;
  gain_db?: number;
}

export interface HammerTranscript {
  media_id: string;
  segments: HammerTranscriptSegment[];
}
