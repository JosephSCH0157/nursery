export type CanonicalSpeakerId = "s1" | "s2" | "g1" | "g2";

export type ComposeMode =
  | "outline_by_speaker"
  | "full_script_single_speaker"
  | "full_script_all_speakers";

export interface ProductionDefaults {
  defaultSpeakerCount: 1 | 2 | 3 | 4;
  defaultSpeakers: CanonicalSpeakerId[];
  defaultMode: ComposeMode;
  defaultTargetSpeaker: CanonicalSpeakerId | null;
  assumeStandardUnlessOverridden: boolean;
}

export interface ComposeSetup {
  speakerCount: 1 | 2 | 3 | 4;
  speakers: CanonicalSpeakerId[];
  mode: ComposeMode;
  targetSpeaker: CanonicalSpeakerId | null;
  usesProductionDefault: boolean;
  isOverrideFromProductionDefault: boolean;
}

export interface ComposeScriptRequest {
  setup: ComposeSetup;
  sourceText: string;
  existingDraftText?: string;
}

export type ScriptCompletionBadge =
  | "outline_draft"
  | "partial_script"
  | "approval_ready";
