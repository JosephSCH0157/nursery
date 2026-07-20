import { resolveForgeUserAccessToken } from "./hearth-chat-api";
import { tongsFetch } from "./tongs-fetch";
import {
  DEFAULT_TITLE_STYLE,
  areEpisodeThumbnailTitleStylesEqual,
  getShadowCss,
  normalizeEpisodeThumbnailTitleStyle,
} from "./hearth-title-fonts";
import type {
  EpisodeThumbnailTitleStyle,
  NormalizedEpisodeThumbnailTitleStyle,
} from "./hearth-title-fonts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

type RpcFailure = {
  ok: false;
  status: number;
  error: string;
};

type RpcSuccess<T> = {
  ok: true;
  status: number;
  data: T;
};

type RpcErrorPayload = {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
  error?: unknown;
};

type ThumbnailBrandTemplateRpcRow = {
  template_id?: unknown;
  workspace_id?: unknown;
  slug?: unknown;
  name?: unknown;
  template_json?: unknown;
  is_default?: unknown;
  archived_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  updated_by?: unknown;
};

type SeedTemplatesRpcRow = {
  inserted_count?: unknown;
};

export type ThumbnailBrandTemplateTitlePosition = "top" | "center" | "bottom";
export type ThumbnailBrandTemplateAlignment = "left" | "center" | "right";

export type ThumbnailBrandTemplateLayout = {
  title_position: ThumbnailBrandTemplateTitlePosition;
  alignment: ThumbnailBrandTemplateAlignment;
  max_lines: number;
};

export type ThumbnailBrandTemplateBackgroundTreatment = {
  darken: number;
  blur: number;
};

export type ThumbnailBrandTemplateAccent = {
  border_color: string | null;
  border_width: number;
  corner_radius: number;
};

export type ThumbnailBrandTemplateLogoPlacement = "top_left" | "top_right" | "bottom_left" | "bottom_right";

export type ThumbnailBrandTemplateLogo = {
  workpiece_id: string | null;
  asset_path: string | null;
  mime_type: string | null;
  placement: ThumbnailBrandTemplateLogoPlacement;
  width_percent: number;
  opacity: number;
};

export type ThumbnailBrandTemplateConfig = {
  title_style: NormalizedEpisodeThumbnailTitleStyle;
  layout: ThumbnailBrandTemplateLayout;
  background_treatment: ThumbnailBrandTemplateBackgroundTreatment;
  accent: ThumbnailBrandTemplateAccent;
  logo: ThumbnailBrandTemplateLogo;
};

export type ThumbnailBrandTemplate = {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  templateJson: ThumbnailBrandTemplateConfig;
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ThumbnailBrandTemplateInput = {
  slug: string;
  name: string;
  templateJson: ThumbnailBrandTemplateConfig;
  isDefault?: boolean;
};

export type ResolvedThumbnailBrandRender = {
  title_style: NormalizedEpisodeThumbnailTitleStyle;
  layout: ThumbnailBrandTemplateLayout;
  background_treatment: ThumbnailBrandTemplateBackgroundTreatment;
  accent: ThumbnailBrandTemplateAccent;
  logo: ThumbnailBrandTemplateLogo;
  text_shadow_css: string;
};

export const LEGACY_THUMBNAIL_BRAND_RENDER: ThumbnailBrandTemplateConfig = {
  title_style: DEFAULT_TITLE_STYLE,
  layout: {
    title_position: "bottom",
    alignment: "left",
    max_lines: 3,
  },
  background_treatment: {
    darken: 0,
    blur: 0,
  },
  accent: {
    border_color: null,
    border_width: 0,
    corner_radius: 8,
  },
  logo: {
    workpiece_id: null,
    asset_path: null,
    mime_type: null,
    placement: "top_right",
    width_percent: 16,
    opacity: 1,
  },
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeUuid(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  return UUID_RE.test(text) ? text.toLowerCase() : null;
}

function readTokenString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readSupabaseConfig(): SupabaseConfig | null {
  const meta = import.meta as unknown as {
    env?: Record<string, string | undefined>;
  };
  const envUrl = readTokenString(meta.env?.VITE_SUPABASE_URL);
  const envAnonKey = readTokenString(meta.env?.VITE_SUPABASE_ANON_KEY);
  if (envUrl && envAnonKey) {
    return { url: envUrl, anonKey: envAnonKey };
  }

  if (typeof window === "undefined") return null;
  const runtimeWindow = window as Window & typeof globalThis & {
    __forgeSupabaseUrl?: unknown;
    __forgeSupabaseAnonKey?: unknown;
    __tpSupabaseUrl?: unknown;
    __tpSupabaseAnonKey?: unknown;
    __forge_supabase_client__?: {
      supabaseUrl?: unknown;
      supabaseKey?: unknown;
    };
  };

  const globalUrl = readTokenString(runtimeWindow.__forgeSupabaseUrl) ?? readTokenString(runtimeWindow.__tpSupabaseUrl);
  const globalAnon = readTokenString(runtimeWindow.__forgeSupabaseAnonKey)
    ?? readTokenString(runtimeWindow.__tpSupabaseAnonKey);
  if (globalUrl && globalAnon) {
    return { url: globalUrl, anonKey: globalAnon };
  }

  const clientUrl = readTokenString(runtimeWindow.__forge_supabase_client__?.supabaseUrl);
  const clientKey = readTokenString(runtimeWindow.__forge_supabase_client__?.supabaseKey);
  if (clientUrl && clientKey) {
    return { url: clientUrl, anonKey: clientKey };
  }

  return null;
}

function readRpcError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as RpcErrorPayload;
  const message = readString(row.message) ?? readString(row.error);
  const code = readString(row.code);
  const details = readString(row.details);
  const hint = readString(row.hint);
  const parts = [message, code, details, hint].filter(Boolean) as string[];
  return parts.length ? parts.join(" | ") : fallback;
}

async function callTongsRpc<T>(
  fn: string,
  params: Record<string, unknown>,
): Promise<RpcSuccess<T> | RpcFailure> {
  const config = readSupabaseConfig();
  if (!config) {
    return {
      ok: false,
      status: 500,
      error: "Supabase config missing.",
    };
  }

  const accessToken = await resolveForgeUserAccessToken();
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required.",
    };
  }

  const headers = new Headers();
  headers.set("apikey", config.anonKey);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("accept-profile", "tongs");
  headers.set("content-profile", "tongs");
  headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${encodeURIComponent(fn)}`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Network error",
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readRpcError(payload, `RPC ${fn} failed (${response.status})`),
    };
  }

  return {
    ok: true,
    status: response.status,
    data: payload as T,
  };
}

function normalizeTemplateSlug(value: unknown): string | null {
  const raw = readString(value)?.toLowerCase() ?? null;
  if (!raw) return null;
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || null;
}

function normalizeTitlePosition(value: unknown): ThumbnailBrandTemplateTitlePosition {
  const position = readString(value)?.toLowerCase();
  if (position === "top" || position === "center" || position === "bottom") {
    return position;
  }
  return LEGACY_THUMBNAIL_BRAND_RENDER.layout.title_position;
}

function normalizeAlignment(value: unknown): ThumbnailBrandTemplateAlignment {
  const alignment = readString(value)?.toLowerCase();
  if (alignment === "left" || alignment === "center" || alignment === "right") {
    return alignment;
  }
  return LEGACY_THUMBNAIL_BRAND_RENDER.layout.alignment;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeMaxLines(value: unknown): number {
  return clamp(Math.floor(readNumber(value) ?? LEGACY_THUMBNAIL_BRAND_RENDER.layout.max_lines), 1, 6);
}

function normalizeDarken(value: unknown): number {
  return clamp(readNumber(value) ?? LEGACY_THUMBNAIL_BRAND_RENDER.background_treatment.darken, 0, 1);
}

function normalizeBlur(value: unknown): number {
  return clamp(readNumber(value) ?? LEGACY_THUMBNAIL_BRAND_RENDER.background_treatment.blur, 0, 12);
}

function normalizeBorderWidth(value: unknown): number {
  return clamp(Math.floor(readNumber(value) ?? LEGACY_THUMBNAIL_BRAND_RENDER.accent.border_width), 0, 24);
}

function normalizeCornerRadius(value: unknown): number {
  return clamp(Math.floor(readNumber(value) ?? LEGACY_THUMBNAIL_BRAND_RENDER.accent.corner_radius), 0, 64);
}

function normalizeLogoPlacement(value: unknown): ThumbnailBrandTemplateLogoPlacement {
  const placement = readString(value)?.toLowerCase();
  if (placement === "top_left" || placement === "top_right" || placement === "bottom_left" || placement === "bottom_right") {
    return placement;
  }
  return LEGACY_THUMBNAIL_BRAND_RENDER.logo.placement;
}

function normalizeLogoWidthPercent(value: unknown): number {
  return clamp(Math.floor(readNumber(value) ?? LEGACY_THUMBNAIL_BRAND_RENDER.logo.width_percent), 6, 50);
}

function normalizeLogoOpacity(value: unknown): number {
  return clamp(readNumber(value) ?? LEGACY_THUMBNAIL_BRAND_RENDER.logo.opacity, 0.1, 1);
}

function normalizeColor(value: unknown): string | null {
  const color = readString(value);
  if (!color) return null;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [r, g, b] = color.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return color;
}

export function normalizeThumbnailBrandTemplateConfig(value: unknown): ThumbnailBrandTemplateConfig {
  const raw = isRecord(value) ? value : {};
  const layout = isRecord(raw.layout) ? raw.layout : {};
  const background = isRecord(raw.background_treatment) ? raw.background_treatment : {};
  const accent = isRecord(raw.accent) ? raw.accent : {};
  const logo = isRecord(raw.logo) ? raw.logo : {};

  return {
    title_style: normalizeEpisodeThumbnailTitleStyle(raw.title_style),
    layout: {
      title_position: normalizeTitlePosition(layout.title_position),
      alignment: normalizeAlignment(layout.alignment),
      max_lines: normalizeMaxLines(layout.max_lines),
    },
    background_treatment: {
      darken: normalizeDarken(background.darken),
      blur: normalizeBlur(background.blur),
    },
    accent: {
      border_color: normalizeColor(accent.border_color),
      border_width: normalizeBorderWidth(accent.border_width),
      corner_radius: normalizeCornerRadius(accent.corner_radius),
    },
    logo: {
      workpiece_id: normalizeUuid(logo.workpiece_id),
      asset_path: readString(logo.asset_path),
      mime_type: readString(logo.mime_type),
      placement: normalizeLogoPlacement(logo.placement),
      width_percent: normalizeLogoWidthPercent(logo.width_percent),
      opacity: normalizeLogoOpacity(logo.opacity),
    },
  };
}

function toThumbnailBrandTemplate(
  row: unknown,
  workspaceId: string,
): ThumbnailBrandTemplate | null {
  const raw = row as ThumbnailBrandTemplateRpcRow | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  const id = normalizeUuid(raw.template_id);
  const resolvedWorkspaceId = normalizeUuid(raw.workspace_id) ?? workspaceId;
  const slug = normalizeTemplateSlug(raw.slug);
  const name = readString(raw.name);
  if (!id || !resolvedWorkspaceId || !slug || !name) return null;

  return {
    id,
    workspaceId: resolvedWorkspaceId,
    slug,
    name,
    templateJson: normalizeThumbnailBrandTemplateConfig(raw.template_json),
    isDefault: raw.is_default === true,
    archivedAt: readString(raw.archived_at),
    createdAt: readString(raw.created_at),
    updatedAt: readString(raw.updated_at),
    updatedBy: normalizeUuid(raw.updated_by),
  };
}

export function resolveDefaultThumbnailBrandTemplate(
  templates: readonly ThumbnailBrandTemplate[],
): ThumbnailBrandTemplate | null {
  return templates.find((template) => template.isDefault && !template.archivedAt)
    ?? templates.find((template) => !template.archivedAt)
    ?? null;
}

export function resolveThumbnailBrandRender(args: {
  template: ThumbnailBrandTemplate | null;
  conceptTitleStyle: EpisodeThumbnailTitleStyle | null | undefined;
}): ResolvedThumbnailBrandRender {
  const templateConfig = args.template?.templateJson ?? LEGACY_THUMBNAIL_BRAND_RENDER;
  const normalizedConceptTitleStyle = normalizeEpisodeThumbnailTitleStyle(args.conceptTitleStyle);
  const hasExplicitTitleStyleOverride = !areEpisodeThumbnailTitleStylesEqual(
    normalizedConceptTitleStyle,
    DEFAULT_TITLE_STYLE,
  );
  // Backward-compatible rule:
  // once a concept diverges from the default title styling, treat that as a full explicit override.
  const titleStyle = hasExplicitTitleStyleOverride
    ? normalizedConceptTitleStyle
    : templateConfig.title_style;

  return {
    title_style: titleStyle,
    layout: templateConfig.layout,
    background_treatment: templateConfig.background_treatment,
    accent: templateConfig.accent,
    logo: templateConfig.logo,
    text_shadow_css: getShadowCss(titleStyle.shadow),
  };
}

function firstTemplateRpcRow(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

type UploadWorkspaceThumbnailBrandLogoResult =
  | {
    ok: true;
    assetPath: string;
    mimeType: string;
  }
  | {
    ok: false;
    status: number;
    error: string;
  };

type LoadWorkspaceThumbnailBrandLogoPreviewResult =
  | {
    ok: true;
    dataUrl: string;
  }
  | {
    ok: false;
    status: number;
    error: string;
  };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function resolveUploadMimeType(file: File): string {
  const mimeType = readString(file.type)?.toLowerCase();
  if (mimeType?.startsWith("image/")) return mimeType;
  return "application/octet-stream";
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "bin";
}

function safeFileStem(fileName: string): string {
  const stem = fileName
    .replace(/\.[^./\\]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stem || "logo";
}

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readCommitError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as { error?: unknown; message?: unknown; details?: unknown };
  const message = readString(row.message) ?? readString(row.error);
  const details = readString(row.details);
  if (message && details) return `${message} (${details})`;
  return message ?? details ?? fallback;
}

export async function uploadWorkspaceThumbnailBrandLogo(args: {
  workpieceId: string;
  templateId: string;
  file: File;
}): Promise<UploadWorkspaceThumbnailBrandLogoResult> {
  const workpieceId = normalizeUuid(args.workpieceId);
  const templateId = normalizeUuid(args.templateId);
  if (!workpieceId || !templateId) {
    return { ok: false, status: 400, error: "workpiece_id and template_id are required." };
  }

  const mimeType = resolveUploadMimeType(args.file);
  if (!mimeType.startsWith("image/")) {
    return { ok: false, status: 400, error: "Only image files can be used as brand logos." };
  }

  let bytesBase64 = "";
  try {
    const bytes = new Uint8Array(await args.file.arrayBuffer());
    bytesBase64 = bytesToBase64(bytes);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : "Unable to read logo file.",
    };
  }

  const timestamp = Date.now();
  const extension = extensionFromMimeType(mimeType);
  const fileStem = safeFileStem(args.file.name);
  const assetPath = `assets/thumbnail-brand-logos/${templateId}/${timestamp}-${fileStem}.${extension}`;
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: assetPath,
        content_type: mimeType,
        file_type: "thumbnail_image",
        bytes_base64: bytesBase64,
        written_by: {
          tool: "hearth",
          tool_version: "v1",
          lane: "hearth_thumbnail_branding",
        },
        event_name: "hearth.thumbnail.brand.logo.uploaded.v1",
        event_payload: {
          template_id: templateId,
          file_name: args.file.name,
          mime_type: mimeType,
        },
        correlation_id: `hearth-thumbnail-brand-logo-${timestamp.toString(36)}`,
      },
    },
  );

  if (!response.ok) {
    const payload = await readResponseJson(response);
    return {
      ok: false,
      status: response.status,
      error: readCommitError(payload, `Logo upload failed (${response.status}).`),
    };
  }

  return {
    ok: true,
    assetPath,
    mimeType,
  };
}

const thumbnailBrandLogoPreviewRequests = new Map<string, Promise<LoadWorkspaceThumbnailBrandLogoPreviewResult>>();

export function loadWorkspaceThumbnailBrandLogoPreview(args: {
  workpieceId: string;
  assetPath: string;
}): Promise<LoadWorkspaceThumbnailBrandLogoPreviewResult> {
  const workpieceId = normalizeUuid(args.workpieceId);
  const assetPath = readString(args.assetPath);
  if (!workpieceId || !assetPath) {
    return Promise.resolve({ ok: false, status: 400, error: "workpiece_id and asset_path are required." });
  }

  const requestKey = `${workpieceId}:${assetPath}`;
  const inFlight = thumbnailBrandLogoPreviewRequests.get(requestKey);
  if (inFlight) return inFlight;

  const request = (async (): Promise<LoadWorkspaceThumbnailBrandLogoPreviewResult> => {
    const response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(assetPath)}&encoding=base64&optional=1`,
      { method: "GET" },
    );
    const payload = await readResponseJson(response);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: readCommitError(payload, `Logo preview load failed (${response.status}).`),
      };
    }

    if (!payload || typeof payload !== "object") {
      return { ok: false, status: 502, error: "Logo preview payload was invalid." };
    }
    const row = payload as {
      ok?: unknown;
      data?: {
        bytes_base64?: unknown;
        content_type?: unknown;
      };
    };
    const bytesBase64 = readString(row.data?.bytes_base64);
    if (!bytesBase64) {
      return { ok: false, status: 404, error: "Logo file is unavailable." };
    }
    const mimeType = readString(row.data?.content_type) ?? "image/png";
    return {
      ok: true,
      dataUrl: `data:${mimeType};base64,${bytesBase64}`,
    };
  })();
  thumbnailBrandLogoPreviewRequests.set(requestKey, request);
  void request.finally(() => {
    if (thumbnailBrandLogoPreviewRequests.get(requestKey) === request) {
      thumbnailBrandLogoPreviewRequests.delete(requestKey);
    }
  });
  return request;
}

export async function listWorkspaceThumbnailBrandTemplates(
  workspaceId: string,
  options?: { includeArchived?: boolean },
): Promise<RpcSuccess<ThumbnailBrandTemplate[]> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  const rpc = await callTongsRpc<ThumbnailBrandTemplateRpcRow[] | ThumbnailBrandTemplateRpcRow>(
    "list_my_thumbnail_brand_templates",
    {
      p_workspace_id: normalizedWorkspaceId,
      p_include_archived: options?.includeArchived === true,
    },
  );
  if (!rpc.ok) return rpc;

  const rows = Array.isArray(rpc.data) ? rpc.data : (rpc.data ? [rpc.data] : []);
  const templates = rows
    .map((row) => toThumbnailBrandTemplate(row, normalizedWorkspaceId))
    .filter((template): template is ThumbnailBrandTemplate => Boolean(template));

  return {
    ok: true,
    status: rpc.status,
    data: templates,
  };
}

export async function seedWorkspaceThumbnailBrandTemplates(
  workspaceId: string,
): Promise<RpcSuccess<number> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  const rpc = await callTongsRpc<SeedTemplatesRpcRow[] | SeedTemplatesRpcRow>(
    "seed_my_thumbnail_brand_templates",
    { p_workspace_id: normalizedWorkspaceId },
  );
  if (!rpc.ok) return rpc;

  const raw = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  return {
    ok: true,
    status: rpc.status,
    data: Math.max(0, Math.floor(readNumber(raw?.inserted_count) ?? 0)),
  };
}

export async function createWorkspaceThumbnailBrandTemplate(
  workspaceId: string,
  input: ThumbnailBrandTemplateInput,
): Promise<RpcSuccess<ThumbnailBrandTemplate> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }
  const slug = normalizeTemplateSlug(input.slug);
  const name = readString(input.name);
  if (!slug || !name) {
    return { ok: false, status: 400, error: "Template slug and name are required." };
  }

  const rpc = await callTongsRpc<ThumbnailBrandTemplateRpcRow[] | ThumbnailBrandTemplateRpcRow>(
    "create_my_thumbnail_brand_template",
    {
      p_workspace_id: normalizedWorkspaceId,
      p_slug: slug,
      p_name: name,
      p_template_json: normalizeThumbnailBrandTemplateConfig(input.templateJson),
      p_is_default: input.isDefault === true,
    },
  );
  if (!rpc.ok) return rpc;

  const resolvedTemplate = toThumbnailBrandTemplate(firstTemplateRpcRow(rpc.data), normalizedWorkspaceId);
  if (!resolvedTemplate) {
    return {
      ok: false,
      status: 502,
      error: "Template create returned an invalid payload.",
    };
  }

  return {
    ok: true,
    status: rpc.status,
    data: resolvedTemplate,
  };
}

export async function updateWorkspaceThumbnailBrandTemplate(
  workspaceId: string,
  templateId: string,
  input: {
    name?: string | null;
    templateJson?: ThumbnailBrandTemplateConfig | null;
    isDefault?: boolean | null;
  },
): Promise<RpcSuccess<ThumbnailBrandTemplate> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  const normalizedTemplateId = normalizeUuid(templateId);
  if (!normalizedWorkspaceId || !normalizedTemplateId) {
    return { ok: false, status: 400, error: "workspace_id and template_id are required." };
  }

  const rpc = await callTongsRpc<ThumbnailBrandTemplateRpcRow[] | ThumbnailBrandTemplateRpcRow>(
    "update_my_thumbnail_brand_template",
    {
      p_workspace_id: normalizedWorkspaceId,
      p_template_id: normalizedTemplateId,
      p_name: input.name ?? null,
      p_template_json: input.templateJson == null ? null : normalizeThumbnailBrandTemplateConfig(input.templateJson),
      p_is_default: input.isDefault ?? null,
    },
  );
  if (!rpc.ok) return rpc;

  const template = toThumbnailBrandTemplate(firstTemplateRpcRow(rpc.data), normalizedWorkspaceId);
  if (!template) {
    return {
      ok: false,
      status: 502,
      error: "Template update returned an invalid payload.",
    };
  }

  return {
    ok: true,
    status: rpc.status,
    data: template,
  };
}

export async function archiveWorkspaceThumbnailBrandTemplate(
  workspaceId: string,
  templateId: string,
): Promise<RpcSuccess<ThumbnailBrandTemplate> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  const normalizedTemplateId = normalizeUuid(templateId);
  if (!normalizedWorkspaceId || !normalizedTemplateId) {
    return { ok: false, status: 400, error: "workspace_id and template_id are required." };
  }

  const rpc = await callTongsRpc<ThumbnailBrandTemplateRpcRow[] | ThumbnailBrandTemplateRpcRow>(
    "archive_my_thumbnail_brand_template",
    {
      p_workspace_id: normalizedWorkspaceId,
      p_template_id: normalizedTemplateId,
    },
  );
  if (!rpc.ok) return rpc;

  const template = toThumbnailBrandTemplate(firstTemplateRpcRow(rpc.data), normalizedWorkspaceId);
  if (!template) {
    return {
      ok: false,
      status: 502,
      error: "Template archive returned an invalid payload.",
    };
  }

  return {
    ok: true,
    status: rpc.status,
    data: template,
  };
}
