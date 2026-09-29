import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BarStockOwnerRuntimeConfig } from "../bar-stock/bar-stock-owner-runtime-config";
import { extractUrlToResearchSource, classifyResearchSourceAuthority } from "./hearth-research-runtime";
import type { HearthRuntimeConfig } from "./hearth-runtime-config";

type Json = Record<string, unknown>;
type TopicDiscoveryRuntimeConfig = HearthRuntimeConfig & Partial<BarStockOwnerRuntimeConfig>;
const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";
const LEASE_HEADER = "x-forge-discovery-lease";

function json(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function bearer(request: Request): string | null { const value = request.headers.get("authorization") ?? ""; return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : null; }
function hash(value: string): string { return crypto.createHash("sha256").update(value).digest("hex"); }
function canonicalUrl(value: string): string {
  const url = new URL(value); url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}
function userClient(config: TopicDiscoveryRuntimeConfig, token: string): SupabaseClient {
  return createClient(config.supabaseUrl!, config.supabaseRpcKey!, { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${token}` } } });
}
function serviceClient(config: TopicDiscoveryRuntimeConfig): SupabaseClient {
  return createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!, { auth: { persistSession: false } });
}
async function actor(config: TopicDiscoveryRuntimeConfig, token: string): Promise<string | null> {
  const { data, error } = await serviceClient(config).auth.getUser(token); return error ? null : data.user?.id ?? null;
}
async function stillAuthorized(client: SupabaseClient, workspaceId: string, userId: string, revision: number): Promise<boolean> {
  void userId;
  const scope=client.schema("tongs");
  const [{ data: context },{ data: role }]=await Promise.all([scope.rpc("get_my_barstock_discovery_context",{p_workspace_id:workspaceId}),scope.rpc("get_my_workspace_role", { _workspace_id: workspaceId })]);
  return Boolean(context?.preference?.enabled && Number(context.preference.revision) === revision && ["editor", "admin", "owner"].includes(String(role)));
}

export function buildDiscoveryQueries(preference: Json): string[] {
  const genre = text(preference.genre) ?? "";
  const interests = Array.isArray(preference.topic_interests) ? preference.topic_interests.map(text).filter(Boolean).slice(0, 4).join(" ") : "";
  const scope = text(preference.editorial_scope) ?? "";
  const region = text(preference.region) ?? "";
  const language = text(preference.language) ?? "";
  return [
    `${genre} ${interests} latest news ${region}`,
    `${genre} ${scope} recent report announcement ${language}`,
    `${genre} ${interests} new research release`,
  ].map((query) => query.replace(/\s+/g, " ").trim()).filter((value, index, all) => value.length > 3 && all.indexOf(value) === index).slice(0, 3);
}

async function runDiscovery(args: { config: TopicDiscoveryRuntimeConfig; token: string; workspaceId: string; revision: number; runId: string; lease: string; preference: Json }): Promise<Json[]> {
  const service = serviceClient(args.config).schema("tongs");
  const user = userClient(args.config, args.token);
  const discoveryQueries = buildDiscoveryQueries(args.preference);
  const discoveryBrief = {
    schema: "forge.hearth.research-brief.v1" as const,
    workspaceId: args.workspaceId,
    workpieceId: `topic-discovery:${args.runId}`,
    briefFingerprint: hash(JSON.stringify({ workspace_id: args.workspaceId, run_id: args.runId, queries: discoveryQueries })),
    creatorRequest: "Discover timely, well-sourced podcast topics for the configured editorial preferences.",
    episodeTitle: "Topic discovery",
    goals: discoveryQueries,
    queries: discoveryQueries,
    sourcePriorities: ["Primary records", "Independent reporting", "Scholarly or technical sources"],
  };
  const candidates = new Map<string, { title: string; url: string; description: string; publishedAt: string | null }>();
  for (const [index, query] of discoveryQueries.entries()) {
    if (!(await stillAuthorized(user, args.workspaceId, String(args.preference.user_id), args.revision))) throw new Error("authorization_revoked");
    const requestKey = `search:${index}:${hash(query)}`;
    const recorded = await service.rpc("record_barstock_discovery_provider_call", { p_run_id: args.runId, p_lease_token_hash: hash(args.lease), p_provider: "brave", p_request_key: requestKey });
    if (recorded.data?.outcome !== "recorded") throw new Error(String(recorded.data?.outcome ?? "lease_lost"));
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(`${BRAVE_URL}?q=${encodeURIComponent(query)}&count=10&result_filter=web&freshness=pw`, { headers: { accept: "application/json", "x-subscription-token": args.config.researchApiKey! }, signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!response.ok) throw new Error(response.status === 429 ? "provider_rate_limited" : "provider_failed");
    const payload = await response.json() as Json;
    const results = (payload.web as Json | undefined)?.results;
    if (!Array.isArray(results)) continue;
    for (const raw of results) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Json; const url = text(row.url); if (!url?.startsWith("http")) continue;
      const key = canonicalUrl(url); if (!candidates.has(key)) candidates.set(key, { title: text(row.title) ?? new URL(url).hostname, url, description: text(row.description) ?? "", publishedAt: text(row.age) });
    }
  }
  const selected = [...candidates.values()].slice(0, 8);
  const extracted = [];
  for (const [index, item] of selected.entries()) {
    if (!(await stillAuthorized(user, args.workspaceId, String(args.preference.user_id), args.revision))) throw new Error("authorization_revoked");
    if(index>0&&index%3===0){const renewed=await service.rpc("renew_barstock_discovery_lease",{p_run_id:args.runId,p_lease_token_hash:hash(args.lease)});if(renewed.data?.outcome!=="renewed")throw new Error("lease_lost");}
    const source = await extractUrlToResearchSource({ url: item.url, sourceId: `topic-${index + 1}`, brief: discoveryBrief });
    extracted.push({ item, source });
  }
  const stories: Json[] = [];
  for (const { item, source } of extracted) {
    if (stories.length >= 5) break;
    const headline = source.title || item.title;
    const summary = (source.extractedText || item.description).replace(/\s+/g, " ").trim().slice(0, 420);
    if (!headline || summary.length < 40) continue;
    const url = source.canonicalUrl || source.resolvedUrl || source.url;
    stories.push({
      fingerprint: hash(`${headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${new URL(url).hostname}`),
      headline, summary, suggested_angle: `What does ${headline.replace(/[?.!]$/, "")} mean for this audience?`,
      timeliness_reason: source.publishedAt ? `Published ${source.publishedAt}.` : "Recently indexed coverage; publication time was not verified.",
      event_at: null,
      evidence_class: ["primary_government", "primary_institutional", "scholarly_technical"].includes(classifyResearchSourceAuthority(source)) ? "single_authoritative" : "limited",
      contradiction_state: "none",
      sources: [{ original_url: item.url, canonical_url: url, title: headline, publisher: source.publisher || source.domain, author: source.author, published_at: source.publishedAt, event_at: null, retrieved_at: source.retrievedAt, supporting_excerpt: summary.slice(0, 280), excerpt_hash: hash(summary.slice(0, 280)), extraction_status: source.extractionStatus, authority_class: classifyResearchSourceAuthority(source), syndication_cluster: hash(new URL(url).hostname + headline.toLowerCase()) }],
    });
  }
  return stories;
}

export function createHearthTopicDiscoveryHandler(config: TopicDiscoveryRuntimeConfig) {
  return async (request: Request): Promise<Response> => {
    if (!config.supabaseUrl || !config.supabaseRpcKey || !config.supabaseServiceRoleKey) return json(503, { ok: false, error: "Discovery persistence is not configured." });
    const token = bearer(request); if (!token) return json(401, { ok: false, error: "Sign in required." });
    const userId = await actor(config, token); if (!userId) return json(401, { ok: false, error: "Invalid session." });
    const url = new URL(request.url); const body = request.method === "GET" ? {} : await request.json().catch(() => ({})) as Json;
    const workspaceId = text(url.searchParams.get("workspace_id")) ?? text(body.workspace_id); if (!workspaceId) return json(400, { ok: false, error: "workspace_id required" });
    const client = userClient(config, token).schema("tongs");
    if (request.method === "GET") { const result = await client.rpc("get_my_barstock_discovery_context", { p_workspace_id: workspaceId }); return json(result.error ? 500 : 200, { ok: !result.error, data: result.data, error: result.error?.message }); }
    const action = text(body.action);
    if (action === "preferences") { const result = await client.rpc("set_my_barstock_discovery_preferences", { p_workspace_id: workspaceId, p_expected_revision: Number(body.expected_revision ?? 0), p_genre: text(body.genre), p_topic_interests: Array.isArray(body.topic_interests) ? body.topic_interests : [], p_editorial_scope: text(body.editorial_scope), p_language: text(body.language), p_region: text(body.region), p_enabled: body.enabled !== false, p_auto_refresh_authorized: body.auto_refresh_authorized === true }); if(result.error||result.data?.outcome!=="saved")return json(409,{ok:false,data:result.data,error:result.error?.message??result.data?.outcome});const latest=await client.rpc("get_my_barstock_discovery_context",{p_workspace_id:workspaceId});return json(200,{ok:true,data:latest.data}); }
    if (action === "dismiss") { const result = await client.rpc("dismiss_barstock_discovery_story", { p_workspace_id: workspaceId, p_story_id: text(body.story_id) }); if(result.error||result.data?.outcome!=="dismissed")return json(400,{ok:false,data:result.data,error:result.error?.message??result.data?.outcome});const latest=await client.rpc("get_my_barstock_discovery_context",{p_workspace_id:workspaceId});return json(200,{ok:true,data:latest.data}); }
    if (action === "accept") { const result = await client.rpc("accept_barstock_discovery_story", { p_workspace_id: workspaceId, p_story_revision_id: text(body.story_revision_id), p_operation_key: text(body.operation_key) }); return json(result.error ? 400 : 200, { ok: !result.error, data: result.data, error: result.error?.message }); }
    if (action !== "refresh") return json(400, { ok: false, error: "Unsupported action." });
    if (!config.researchApiKey) return json(503, { ok: false, error: "Live research is unavailable." });
    const revision = Number(body.preference_revision); const lease = crypto.randomUUID();
    const claim = await client.rpc("claim_barstock_discovery_refresh", { p_workspace_id: workspaceId, p_preference_revision: revision, p_trigger: body.trigger === "manual" ? "manual" : "automatic", p_operation_key: text(body.operation_key) ?? crypto.randomUUID(), p_lease_token_hash: hash(lease) });
    if (claim.error || claim.data?.outcome !== "claimed") return json(409, { ok: false, data: claim.data, error: claim.error?.message ?? claim.data?.outcome });
    const context = await client.rpc("get_my_barstock_discovery_context", { p_workspace_id: workspaceId }); const preference = context.data?.preference as Json | undefined;
    try {
      const stories = await runDiscovery({ config, token, workspaceId, revision, runId: claim.data.run_id, lease, preference: { ...preference, user_id: userId } });
      const complete = await serviceClient(config).schema("tongs").rpc("complete_barstock_discovery_refresh", { p_run_id: claim.data.run_id, p_lease_token_hash: hash(lease), p_stories: stories, p_usage: { provider: "brave", customer_credit_debit: false } });
      if (complete.data?.outcome !== "completed") throw new Error(String(complete.data?.outcome ?? "completion_failed"));
      const latest = await client.rpc("get_my_barstock_discovery_context", { p_workspace_id: workspaceId }); return json(200, { ok: true, data: latest.data });
    } catch (error) {
      await serviceClient(config).schema("tongs").rpc("fail_barstock_discovery_refresh", { p_run_id: claim.data.run_id, p_lease_token_hash: hash(lease), p_reason: error instanceof Error ? error.message : "discovery_failed" });
      return json(503, { ok: false, error: error instanceof Error ? error.message : "Discovery failed." });
    }
  };
}

export { LEASE_HEADER };
