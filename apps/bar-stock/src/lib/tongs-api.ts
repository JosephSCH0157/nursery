import { supabase } from "./supabase";

export type Workspace = {
  id: string;
  name: string;
};

export async function listMyWorkspaces(): Promise<Workspace[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .schema("tongs")
    .from("workspace_members")
    .select("workspace_id, role, workspaces!workspace_members_workspace_id_fkey(id, name)");

  if (error) {
    console.warn("[barstock] workspace list unavailable", error);
    return [];
  }

  const out: Workspace[] = [];
  for (const row of data ?? []) {
    const w = (row as any).workspaces;
    if (w?.id && w?.name) out.push({ id: w.id, name: w.name });
  }
  return out;
}
