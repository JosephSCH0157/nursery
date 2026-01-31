export type ScriptBaseState = "warming" | "ready";

export type ScriptRelevance =
  | "hot_topic"
  | "current_events"
  | "evergreen"
  | "series"
  | "other";

export type ScriptDraft = {
  scriptId: string;
  originSparkId?: string | null;
  titleWorking?: string | null;
  bodyAnvil: string;
  baseState: ScriptBaseState;
  relevance: ScriptRelevance;
  revision: number;
};
