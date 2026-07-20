import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { expect, test } from "playwright/test";

type Revision = {
  id: string;
  asset_id: string;
  workspace_id: string;
  role: string;
  state: string;
  storage_bucket: string;
  storage_key: string;
  operation_id: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  has_audio: boolean | null;
};
type Fixture = {
  admin: SupabaseClient;
  user: SupabaseClient;
  session: Session;
  ownerId: string;
  orgId: string;
  workspaceId: string;
  primaryProfileId: string;
  isolationProfileId: string;
  storageKeys: string[];
};
let fixture: Fixture;

const stable = (input: unknown): string =>
  Array.isArray(input)
    ? `[${input.map(stable).join(",")}]`
    : input && typeof input === "object"
      ? `{${Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${JSON.stringify(key)}:${stable(value)}`)
          .join(",")}}`
      : JSON.stringify(input);
const sha = (input: Uint8Array | string) =>
  createHash("sha256").update(input).digest("hex");

async function env() {
  const text = await readFile(
    new URL("../.env.local", import.meta.url),
    "utf8",
  );
  const values = Object.fromEntries(
    text.split(/\r?\n/).flatMap((line) => {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      return match
        ? [[match[1], match[2]!.trim().replace(/^(['"])(.*)\1$/, "$2")]]
        : [];
    }),
  );
  return {
    url: values.TONGS_SUPABASE_URL || values.VITE_SUPABASE_URL,
    anon: values.VITE_SUPABASE_ANON_KEY,
    service: values.TONGS_SERVICE_ROLE_KEY,
  };
}
const rules = (name: string) => ({
  public_identity: {
    program_name: name,
    tagline: "Live canonical verification",
  },
  palette: { primary: "#111827", secondary: "#F8FAFC", accent: "#F97316" },
  typography: {
    heading_family: "Inter",
    body_family: "Inter",
    heading_weight: 700,
    body_weight: 400,
  },
  logo: { placement: "bottom_right", watermark_opacity: 0.7 },
  audio: { music_volume: 0.2, ducking: 0.35 },
  asset_revision_ids: {},
});
async function rpc<T>(name: string, args: Record<string, unknown>) {
  const result = (await fixture.user
    .schema("tongs")
    .rpc(name as never, args as never)) as unknown as {
    data: T;
    error: { message: string } | null;
  };
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function reserve(
  profileId: string,
  role: string,
  name: string,
  mime: string,
  bytes: Uint8Array,
) {
  const operationId = randomUUID();
  const fingerprint = sha(
    stable({
      profileId,
      assetId: null,
      role,
      name,
      type: mime,
      bytes: bytes.length,
      hash: sha(bytes),
    }),
  );
  return rpc<Revision>("reserve_brand_asset_revision", {
    p_workspace_id: fixture.workspaceId,
    p_profile_id: profileId,
    p_asset_id: null,
    p_role: role,
    p_internal_label: name,
    p_filename: name,
    p_mime_type: mime,
    p_operation_id: operationId,
    p_operation_fingerprint: fingerprint,
  });
}
async function upload(revision: Revision, bytes: Uint8Array, mime: string) {
  const result = await fixture.user.storage
    .from(revision.storage_bucket)
    .upload(revision.storage_key, bytes, { contentType: mime, upsert: false });
  if (result.error) throw result.error;
  fixture.storageKeys.push(revision.storage_key);
}
async function inspect(revision: Revision) {
  return fixture.user.functions.invoke("inspect-brand-media", {
    body: { revision_id: revision.id },
  });
}

test.beforeAll(async () => {
  const config = await env();
  if (!config.url || !config.anon || !config.service)
    throw new Error("Live Supabase credentials unavailable");
  const admin = createClient(config.url, config.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `brand-media-live-${randomUUID()}@example.invalid`;
  const password = `${randomUUID()}Aa1!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const ownerId = created.data.user.id;
  const orgId = randomUUID(),
    workspaceId = randomUUID();
  const tongs = admin.schema("tongs");
  for (const [table, row] of [
    [
      "orgs",
      { id: orgId, name: "Brand media live verification", created_by: ownerId },
    ],
    [
      "org_members",
      {
        org_id: orgId,
        user_id: ownerId,
        org_role: "owner",
        created_by: ownerId,
      },
    ],
    [
      "workspaces",
      {
        id: workspaceId,
        org_id: orgId,
        name: "Brand media live verification",
        created_by: ownerId,
      },
    ],
  ] as const) {
    const result = await tongs.from(table).insert(row);
    if (result.error) throw result.error;
  }
  const user = createClient(config.url, config.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await user.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session)
    throw signed.error ?? new Error("No session");
  fixture = {
    admin,
    user,
    session: signed.data.session,
    ownerId,
    orgId,
    workspaceId,
    primaryProfileId: "",
    isolationProfileId: "",
    storageKeys: [],
  };
  const first = await rpc<{ profile_id: string }>("create_brand_profile", {
    p_workspace_id: workspaceId,
    p_internal_label: "A Live Media Brand",
    p_rules: rules("Live Media Brand"),
    p_operation_id: randomUUID(),
  });
  const second = await rpc<{ profile_id: string }>("create_brand_profile", {
    p_workspace_id: workspaceId,
    p_internal_label: "B Isolation Brand",
    p_rules: rules("Isolation Brand"),
    p_operation_id: randomUUID(),
  });
  fixture.primaryProfileId = first.profile_id;
  fixture.isolationProfileId = second.profile_id;
});

test.afterAll(async () => {
  if (!fixture) return;
  if (fixture.storageKeys.length)
    await fixture.admin.storage
      .from("forge-workpieces")
      .remove(fixture.storageKeys);
  const tongs = fixture.admin.schema("tongs");
  await tongs.from("workspaces").delete().eq("id", fixture.workspaceId);
  await tongs.from("org_members").delete().eq("org_id", fixture.orgId);
  await tongs.from("orgs").delete().eq("id", fixture.orgId);
  await fixture.admin.auth.admin.deleteUser(fixture.ownerId);
});

test("canonical inspection, retry, invalid media, isolation, recovery, and authority", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const audioVideo = new Uint8Array(
    await readFile(
      new URL("../../../.tmp-brand-probe/with-audio.mp4", import.meta.url),
    ),
  );
  const silentVideo = new Uint8Array(
    await readFile(
      new URL("../../../.tmp-brand-probe/silent.mp4", import.meta.url),
    ),
  );
  const audioOnly = new Uint8Array(
    await readFile(
      new URL("../../../.tmp-brand-probe/audio-only.wav", import.meta.url),
    ),
  );
  const invalid = new TextEncoder().encode("not media");
  const intro = await reserve(
    fixture.primaryProfileId,
    "video_intro",
    "with-audio.mp4",
    "video/mp4",
    audioVideo,
  );
  const missing = await inspect(intro);
  expect(missing.error).toBeTruthy();
  let row = (
    await fixture.admin
      .schema("tongs")
      .from("brand_asset_revisions")
      .select("*")
      .eq("id", intro.id)
      .single()
  ).data as Revision;
  expect(row.state).toBe("pending");
  expect(row.has_audio).toBeNull();
  await upload(intro, audioVideo, "video/mp4");
  const introResult = await inspect(intro);
  expect(introResult.error).toBeNull();
  expect(introResult.data.revision).toMatchObject({
    id: intro.id,
    asset_id: intro.asset_id,
    state: "ready",
    width: 320,
    height: 180,
    duration_ms: 1000,
    has_audio: true,
  });
  const outro = await reserve(
    fixture.primaryProfileId,
    "video_outro",
    "silent.mp4",
    "video/mp4",
    silentVideo,
  );
  await upload(outro, silentVideo, "video/mp4");
  const outroResult = await inspect(outro);
  expect(outroResult.error).toBeNull();
  expect(outroResult.data.revision).toMatchObject({
    id: outro.id,
    state: "ready",
    has_audio: false,
  });
  const audio = await reserve(
    fixture.primaryProfileId,
    "audio_intro",
    "audio-only.wav",
    "audio/wav",
    audioOnly,
  );
  await upload(audio, audioOnly, "audio/wav");
  const finalized = await rpc<Revision>("finalize_brand_asset_revision", {
    p_workspace_id: fixture.workspaceId,
    p_revision_id: audio.id,
    p_operation_id: audio.operation_id,
    p_content_hash: sha(audioOnly),
    p_bytes: audioOnly.length,
    p_width: null,
    p_height: null,
    p_duration_ms: null,
    p_has_audio: null,
  });
  expect(finalized).toMatchObject({
    id: audio.id,
    state: "ready",
    has_audio: null,
  });
  await page.addInitScript(
    ({ session, workspaceId }) => {
      localStorage.setItem("forge-auth", JSON.stringify(session));
      localStorage.setItem("forge-auth-tongs", JSON.stringify(session));
      localStorage.setItem("forge_workspace_id_v1", workspaceId);
    },
    { session: fixture.session, workspaceId: fixture.workspaceId },
  );
  await page.goto(
    `/app/tongs?workspace_id=${fixture.workspaceId}&mode=branding`,
  );
  await expect(
    page.getByRole("heading", { name: "Brand Library" }),
  ).toBeVisible();
  const primary = page
    .locator("article.brand-library-card")
    .filter({ hasText: "Live Media Brand" });
  await primary.getByRole("button", { name: "Open brand" }).click();
  const readiness = page.locator(".brand-readiness");
  await expect(
    readiness.getByText("Audio-only branding").locator(".."),
  ).toContainText("Intro ready");
  await expect(
    readiness.getByText("Video branding").locator(".."),
  ).toContainText("Intro ready");
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await expect(page.getByText("Video + audio", { exact: false })).toBeVisible();
  await expect(page.getByText("Video only", { exact: false })).toBeVisible();
  const introPreview = page
    .locator("article.brand-asset-card")
    .filter({ hasText: "Video intro" })
    .locator("video");
  await expect(introPreview).toBeVisible();
  await introPreview.evaluate(async (video) => {
    await (video as HTMLVideoElement).play();
  });
  await expect
    .poll(() =>
      introPreview.evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: "test-results/brand-media-live-assets.png",
    fullPage: true,
  });
  const isolation = page
    .locator("article.brand-library-card")
    .filter({ hasText: "Isolation Brand" });
  await isolation.getByRole("button", { name: "Open brand" }).click();
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await expect(page.getByText("Video + audio", { exact: false })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Brand Library" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/brand-media-live-reload.png",
    fullPage: true,
  });
  const bad = await reserve(
    fixture.primaryProfileId,
    "video_outro",
    "invalid.mp4",
    "video/mp4",
    invalid,
  );
  await upload(bad, invalid, "video/mp4");
  const badResult = await inspect(bad);
  expect(badResult.error).toBeTruthy();
  row = (
    await fixture.admin
      .schema("tongs")
      .from("brand_asset_revisions")
      .select("*")
      .eq("id", bad.id)
      .single()
  ).data as Revision;
  expect(row).toMatchObject({
    state: "pending",
    width: null,
    height: null,
    duration_ms: null,
    has_audio: null,
  });
  const assets = await fixture.admin
    .schema("tongs")
    .from("brand_assets")
    .select("id,profile_id,role")
    .eq("workspace_id", fixture.workspaceId);
  const revisions = await fixture.admin
    .schema("tongs")
    .from("brand_asset_revisions")
    .select("id,asset_id,role,state")
    .eq("workspace_id", fixture.workspaceId);
  expect(assets.data).toHaveLength(4);
  expect(revisions.data).toHaveLength(4);
  expect(
    assets.data?.filter((entry) => entry.role === "audio_intro"),
  ).toHaveLength(1);
  expect(assets.data?.some((entry) => entry.role === "audio_outro")).toBe(
    false,
  );
  expect(
    assets.data?.filter(
      (entry) => entry.profile_id === fixture.isolationProfileId,
    ),
  ).toHaveLength(0);
  const downstreamEpisodes = await fixture.admin
    .schema("tongs")
    .from("episodes")
    .select("id")
    .eq("workspace_id", fixture.workspaceId);
  expect(downstreamEpisodes.data).toHaveLength(0);
});
