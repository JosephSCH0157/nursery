export type HearthSessionIntent = "new_idea" | "from_spark";

export type HearthSessionOrigin = {
  created_from?: "bar-stock" | "scratch" | "hearth";
  spark_id?: string | null;
};

export type HearthSessionDecision = {
  at: string;
  text: string;
};

export type HearthSessionLinks = {
  spark_id?: string | null;
  source_ids?: string[];
};

export type HearthTitleVariants = {
  A?: string;
  B?: string;
  C?: string;
};

export type HearthPlanningSession = {
  schema: "forge.hearth.session.v1";
  workpiece_id?: string | null;
  workspace_id?: string | null;
  created_at: string;
  updated_at: string;
  origin?: HearthSessionOrigin | null;
  intent?: HearthSessionIntent | null;
  title?: string | null;
  title_variants?: HearthTitleVariants | null;
  goals?: string[];
  outline?: string[];
  audience?: string | null;
  tone_preset?: string | null;
  links?: HearthSessionLinks | null;
  decisions?: HearthSessionDecision[];
};

export const HEARTH_SESSION_SCHEMA = "forge.hearth.session.v1";
export const HEARTH_SESSION_PATH = "script/session.json";
