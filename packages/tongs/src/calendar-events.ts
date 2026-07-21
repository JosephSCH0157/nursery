import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./db.types.js";

type TongsCalendarSupabaseClient =
  | SupabaseClient<Database>
  | SupabaseClient<Database, "tongs", "tongs">;

export type CalendarEventRow = Database["tongs"]["Tables"]["calendar_events"]["Row"];
export type CalendarEventInsert = Database["tongs"]["Tables"]["calendar_events"]["Insert"];
export type CalendarEventUpdate = Database["tongs"]["Tables"]["calendar_events"]["Update"];
export type CalendarEventAssignmentRow =
  Database["tongs"]["Tables"]["calendar_event_assignments"]["Row"];
export type CalendarEventAssignmentInsert =
  Database["tongs"]["Tables"]["calendar_event_assignments"]["Insert"];

export type CalendarEventRange = {
  startAt?: string;
  endAt?: string;
  limit?: number;
};

export async function listCalendarEvents(
  supabase: TongsCalendarSupabaseClient,
  workspaceId: string,
  range?: CalendarEventRange,
): Promise<CalendarEventRow[]> {
  let query = supabase
    .schema("tongs")
    .from("calendar_events")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (range?.startAt) query = query.gte("start_at", range.startAt);
  if (range?.endAt) query = query.lte("start_at", range.endAt);
  if (range?.limit) query = query.limit(range.limit);

  const { data, error } = await query.order("start_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCalendarEvent(
  supabase: TongsCalendarSupabaseClient,
  workspaceId: string,
  payload: Omit<CalendarEventInsert, "workspace_id">,
): Promise<CalendarEventRow> {
  const { data, error } = await supabase
    .schema("tongs")
    .from("calendar_events")
    .insert({
      ...payload,
      workspace_id: workspaceId,
    })
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("calendar_events insert: missing row");
  return data;
}

export async function updateCalendarEvent(
  supabase: TongsCalendarSupabaseClient,
  a: string,
  b: string | CalendarEventUpdate,
  c?: CalendarEventUpdate,
): Promise<CalendarEventRow> {
  const has4Args = typeof c !== "undefined";
  const workspaceId = has4Args ? a : null;
  const id = has4Args ? (b as string) : a;
  const patch = has4Args ? c! : (b as CalendarEventUpdate);

  let query = supabase
    .schema("tongs")
    .from("calendar_events")
    .update(patch);

  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  query = query.eq("id", id);

  const { data, error } = await query.select("*").single();

  if (error) throw error;
  if (!data) throw new Error("calendar_events update: missing row");
  return data;
}

export async function deleteCalendarEvent(
  supabase: TongsCalendarSupabaseClient,
  workspaceId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .schema("tongs")
    .from("calendar_events")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);

  if (error) throw error;
}

export async function listCalendarEventAssignments(
  supabase: TongsCalendarSupabaseClient,
  workspaceId: string,
  eventIds?: string[],
): Promise<CalendarEventAssignmentRow[]> {
  let query = supabase
    .schema("tongs")
    .from("calendar_event_assignments")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (eventIds && eventIds.length > 0) {
    query = query.in("event_id", eventIds);
  }

  const { data, error } = await query
    .order("event_id", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function replaceCalendarEventAssignments(
  supabase: TongsCalendarSupabaseClient,
  workspaceId: string,
  eventId: string,
  assignmentIds: string[],
): Promise<CalendarEventAssignmentRow[]> {
  const uniqueAssignmentIds = Array.from(
    new Set(
      assignmentIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  const { error: deleteError } = await supabase
    .schema("tongs")
    .from("calendar_event_assignments")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId);
  if (deleteError) throw deleteError;

  if (uniqueAssignmentIds.length === 0) {
    return [];
  }

  const payload: CalendarEventAssignmentInsert[] = uniqueAssignmentIds.map((assignmentId) => ({
    workspace_id: workspaceId,
    event_id: eventId,
    assignment_id: assignmentId,
  }));

  const { data, error } = await supabase
    .schema("tongs")
    .from("calendar_event_assignments")
    .insert(payload)
    .select("*");

  if (error) throw error;
  return data ?? [];
}
