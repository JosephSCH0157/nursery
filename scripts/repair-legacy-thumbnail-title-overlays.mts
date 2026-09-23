import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config as loadDotEnv } from "dotenv";

import { isLegacyDerivedHearthThumbnailOverlayText } from "../apps/hearth/src/lib/hearth-thumbnail-title-contract";

type JsonObject = Record<string, unknown>;

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
loadDotEnv({ path: path.join(repoRoot, "apps", "nursery", ".env.local"), override: false });
loadDotEnv({ path: path.join(repoRoot, ".env.local"), override: false });
loadDotEnv({ path: path.join(repoRoot, ".env"), override: false });

if (!process.argv.includes("--execute")) {
  throw new Error("Pass --execute to commit the exact-match legacy thumbnail title repair.");
}

const WORKSPACE_ID = "cc5478ff-37be-403e-824c-467fa7da061e";
const WORKPIECE_ID = "21d16d6a-905b-491e-8761-028789612ae5";
const EXPECTED_TITLES = [
  "Why Is Gasoline So Expensive in the United States?",
  "How Global Crises End Up Raising Your Gas Bill",
  "The Global Chain Behind America’s Gas Prices",
] as const;

function required(name: string, ...fallbacks: string[]): string {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  throw new Error(`${name} is required`);
}

function record(value: unknown): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "Expected an object");
  return value as JsonObject;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const supabaseUrl = required("TONGS_SUPABASE_URL", "VITE_SUPABASE_URL");
const serviceRoleKey = required("TONGS_SERVICE_ROLE_KEY");
const publishableKey = required("VITE_SUPABASE_ANON_KEY", "TONGS_SUPABASE_ANON_KEY");
const tongsApiToken = required("TONGS_API_TOKEN");
const baseUrl = process.env.TONGS_REPAIR_BASE_URL?.trim() || "http://127.0.0.1:5173";
const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

const workspaceResult = await service.schema("tongs").from("workspaces")
  .select("created_by").eq("id", WORKSPACE_ID).single();
if (workspaceResult.error || !string(workspaceResult.data?.created_by)) {
  throw workspaceResult.error ?? new Error("Workspace creator authority is unavailable");
}
const userId = string(workspaceResult.data?.created_by)!;
const userResult = await service.auth.admin.getUserById(userId);
if (userResult.error || !userResult.data.user?.email) {
  throw userResult.error ?? new Error("Workspace creator email is unavailable");
}
const linkResult = await service.auth.admin.generateLink({ type: "magiclink", email: userResult.data.user.email });
if (linkResult.error || !linkResult.data.properties?.hashed_token) {
  throw linkResult.error ?? new Error("Could not create a non-delivered customer authentication token");
}
const customer = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const verified = await customer.auth.verifyOtp({ token_hash: linkResult.data.properties.hashed_token, type: "magiclink" });
if (verified.error || verified.data.user?.id !== userId || !verified.data.session?.access_token) {
  throw verified.error ?? new Error("Customer-scoped authentication failed");
}

const headers = {
  authorization: `Bearer ${tongsApiToken}`,
  "x-forge-user-authorization": `Bearer ${verified.data.session.access_token}`,
};

async function readMetadata(): Promise<{ metadata: JsonObject; updatedAt: string | null }> {
  const url = new URL(`/tongs/workpieces/${WORKPIECE_ID}/read-file`, baseUrl);
  url.searchParams.set("path", "metadata.json");
  url.searchParams.set("encoding", "json");
  const response = await fetch(url, { headers });
  const body = record(await response.json());
  assert.equal(response.ok, true, `Canonical metadata read failed (${response.status})`);
  assert.equal(body.ok, true, "Canonical metadata read was not acknowledged");
  const fileRow = body.file_row && typeof body.file_row === "object" ? body.file_row as JsonObject : {};
  return { metadata: record(body.data), updatedAt: string(fileRow.updated_at) };
}

function readTitles(metadata: JsonObject): JsonObject[] {
  const episode = record(metadata.episode);
  const seo = record(episode.seo);
  assert.ok(Array.isArray(seo.titles), "Canonical SEO titles are unavailable");
  return seo.titles.map(record);
}

const before = await readMetadata();
const beforeEpisode = record(before.metadata.episode);
const beforeThumbnail = JSON.stringify(beforeEpisode.thumbnail);
const beforeTitles = readTitles(before.metadata);
const beforeCoreTitles = ["A", "B", "C"].map((label) => {
  const title = beforeTitles.find((candidate) => string(candidate.label) === label);
  assert.ok(title, `Canonical title ${label} is unavailable`);
  return title;
});
assert.deepEqual(beforeCoreTitles.map((title) => string(title.text)), [...EXPECTED_TITLES]);

let cleared = 0;
const nextTitles = beforeTitles.map((title) => {
  const label = string(title.label);
  if (label !== "A" && label !== "B" && label !== "C") return title;
  const text = string(title.text)!;
  const thumbnailText = string(title.thumbnail_text);
  if (!thumbnailText) return { ...title, thumbnail_text: null };
  assert.equal(
    isLegacyDerivedHearthThumbnailOverlayText({ text, thumbnail_text: thumbnailText }),
    true,
    `Refusing to clear independently authored thumbnail copy for ${String(title.label)}`,
  );
  cleared += 1;
  return { ...title, thumbnail_text: null };
});

if (cleared > 0) {
  assert.equal(cleared, 3, "Refusing a partial legacy overlay repair");
  const nextMetadata = structuredClone(before.metadata);
  const nextEpisode = record(nextMetadata.episode);
  const nextSeo = record(nextEpisode.seo);
  nextSeo.titles = nextTitles;
  nextMetadata.updated_at = new Date().toISOString();
  assert.equal(JSON.stringify(nextEpisode.thumbnail), beforeThumbnail, "Thumbnail direction authority changed before commit");

  const response = await fetch(new URL(`/tongs/workpieces/${WORKPIECE_ID}/commit-file`, baseUrl), {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      path: "metadata.json",
      content_type: "application/json",
      json: nextMetadata,
      expected_previous_updated_at: before.updatedAt,
      written_by: { tool: "hearth", tool_version: "3", lane: "canonical" },
      event_name: "hearth.thumbnail.legacy-title-overlay-repaired.v1",
      event_payload: {
        workpiece_id: WORKPIECE_ID,
        repaired_labels: ["A", "B", "C"],
        rule: "exact_legacy_derivation_only",
      },
      correlation_id: randomUUID(),
    }),
  });
  const body = record(await response.json());
  assert.equal(response.ok, true, `Canonical metadata commit failed (${response.status})`);
  assert.equal(body.ok, true, "Canonical metadata commit was not acknowledged");
}

const after = await readMetadata();
const afterEpisode = record(after.metadata.episode);
const afterTitles = readTitles(after.metadata);
const afterCoreTitles = ["A", "B", "C"].map((label) => {
  const title = afterTitles.find((candidate) => string(candidate.label) === label);
  assert.ok(title, `Canonical title ${label} is unavailable after repair`);
  return title;
});
assert.deepEqual(afterCoreTitles.map((title) => string(title.text)), [...EXPECTED_TITLES]);
assert.deepEqual(afterCoreTitles.map((title) => title.thumbnail_text ?? null), [null, null, null]);
assert.deepEqual(
  afterTitles.filter((title) => !["A", "B", "C"].includes(string(title.label) ?? "")),
  beforeTitles.filter((title) => !["A", "B", "C"].includes(string(title.label) ?? "")),
  "Non-target title records changed during repair",
);
assert.equal(JSON.stringify(afterEpisode.thumbnail), beforeThumbnail, "Paid Thumbnail Directions authority changed during repair");

console.log(JSON.stringify({
  workspace_id: WORKSPACE_ID,
  workpiece_id: WORKPIECE_ID,
  disposition: cleared > 0 ? "committed" : "existing",
  cleared_legacy_thumbnail_text_count: cleared,
  titles: afterCoreTitles.map((title) => ({ label: title.label, text: title.text, thumbnail_text: title.thumbnail_text ?? null })),
  paid_thumbnail_direction_subtree_unchanged: true,
  metadata_updated_at: after.updatedAt,
}, null, 2));
