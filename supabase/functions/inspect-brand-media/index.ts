import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json(405, { ok: false, error: { message: "POST required." } });
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { ok: false, error: { message: "Authentication required." } });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const probeUrl = (Deno.env.get("FORGE_FFMPEG_BASE_URL") ?? "").replace(/\/+$/, "");
  const probeServiceToken = Deno.env.get("FORGE_FFMPEG_SUPABASE_SERVICE_TOKEN_CURRENT")?.trim() ?? "";
  if (!supabaseUrl || !anonKey || !probeUrl || probeServiceToken.length < 32) return json(503, { ok: false, retryable: true, error: { message: "Canonical media inspection is temporarily unavailable." } });
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const body = await request.json().catch(() => null) as { revision_id?: unknown } | null;
  const revisionId = typeof body?.revision_id === "string" ? body.revision_id : "";
  if (!revisionId) return json(400, { ok: false, error: { message: "revision_id is required." } });
  const { data: revision, error: readError } = await client.schema("tongs").rpc("get_brand_asset_revision_for_inspection", { p_revision_id: revisionId });
  if (readError || !revision) return json(404, { ok: false, error: { message: "Brand asset revision is unavailable." } });
  if (revision.role !== "video_intro" && revision.role !== "video_outro") return json(409, { ok: false, error: { message: "Only canonical brand video assets require video inspection." } });
  if (revision.state === "ready") return json(200, { ok: true, disposition: "already_finalized", revision });
  if (revision.state !== "pending") return json(409, { ok: false, error: { message: "This brand asset is not awaiting inspection." } });
  const stored = await client.storage.from(revision.storage_bucket).download(revision.storage_key);
  if (stored.error) return json(503, { ok: false, retryable: true, error: { message: "The uploaded video is safe, but storage readback could not be completed." } });
  const bytes = await stored.data.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const probeResponse = await fetch(`${probeUrl}/probe/media`, { method: "POST", headers: { "authorization": `Bearer ${probeServiceToken}`, "content-type": "application/octet-stream", "x-file-name": revision.storage_key.split("/").at(-1) ?? "brand-video" }, body: bytes });
  const probe = await probeResponse.json().catch(() => null) as { ok?: boolean; inspection?: { width?: unknown; height?: unknown; duration_ms?: unknown; has_audio?: unknown; implementation?: unknown }; error?: { message?: unknown } } | null;
  if (!probeResponse.ok || probe?.ok !== true) return json(503, { ok: false, retryable: true, error: { message: "Video inspection could not be completed." }, details: { probe_implementation: "forge-ffprobe-json-v1" } });
  const width = Number(probe.inspection?.width); const height = Number(probe.inspection?.height); const duration = Number(probe.inspection?.duration_ms); const hasAudio = probe.inspection?.has_audio;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0 || !Number.isInteger(duration) || duration < 0 || typeof hasAudio !== "boolean") return json(502, { ok: false, retryable: true, error: { message: "Video inspection returned incomplete canonical metadata." } });
  const finalized = await client.schema("tongs").rpc("finalize_brand_asset_revision", { p_workspace_id: revision.workspace_id, p_revision_id: revision.id, p_operation_id: revision.operation_id, p_content_hash: hex(digest), p_bytes: bytes.byteLength, p_width: width, p_height: height, p_duration_ms: duration, p_has_audio: hasAudio });
  if (finalized.error) {
    console.error("brand media finalization failed", { revision_id: revision.id, error: finalized.error.message });
    return json(409, { ok: false, retryable: true, error: { message: "The video was inspected, but its canonical revision could not be finalized. Retry inspection." } });
  }
  return json(200, { ok: true, disposition: "inspected_and_finalized", revision: finalized.data, inspection: { implementation: probe.inspection?.implementation ?? "forge-ffprobe-json-v1", storage_revision_id: revision.id } });
});
