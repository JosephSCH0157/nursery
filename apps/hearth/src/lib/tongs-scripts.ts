import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScriptDraft } from "./models";

export async function upsertScriptDraftV1(
  supabase: SupabaseClient,
  draft: ScriptDraft,
) {
  const payload = {
    p_script_id: draft.scriptId,
    p_origin_spark_id: draft.originSparkId ?? null,
    p_title_working: draft.titleWorking ?? null,
    p_body_anvil: draft.bodyAnvil ?? "",
    p_base_state: draft.baseState ?? "warming",
    p_relevance: draft.relevance ?? "other",
    p_revision: draft.revision ?? 0,
  };

  const { data, error } = await supabase.rpc("upsert_script_draft_v1", payload);
  if (error) throw error;

  const row = data?.[0] as { script_id?: string; revision?: number; updated_at?: string } | undefined;
  if (!row?.script_id) {
    throw new Error("upsert_script_draft_v1: missing return row");
  }

  return {
    scriptId: row.script_id,
    revision: row.revision ?? draft.revision,
    updatedAt: row.updated_at ?? null,
  };
}
