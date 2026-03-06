import type { MediaCtaPayload } from "./projectCardMediaBadge";

export interface MediaCtaActionContext {
  navigate?: (to: string) => void;
  emit?: (eventName: string, detail: Record<string, unknown>) => void;
  logger?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface MediaCtaDispatchResult {
  action: MediaCtaPayload["action"];
  handled: boolean;
  route?: string;
  eventName?: string;
  detail?: Record<string, unknown>;
  reason: string;
}

function pushParam(params: URLSearchParams, key: string, value?: string): void {
  if (!value) return;
  const next = value.trim();
  if (!next) return;
  params.set(key, next);
}

function withQuery(path: string, query: URLSearchParams): string {
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

function defaultEmit(eventName: string, detail: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  } catch {
    // no-op
  }
}

function defaultLogger(message: string, detail?: Record<string, unknown>): void {
  try {
    if (detail) {
      console.log(message, detail);
      return;
    }
    console.log(message);
  } catch {
    // no-op
  }
}

function buildRoute(payload: MediaCtaPayload): string {
  const params = new URLSearchParams();
  pushParam(params, "workspace_id", payload.workspaceId);
  pushParam(params, "media_id", payload.mediaId);
  params.set("action", payload.action);

  switch (payload.action) {
    case "OPEN_WORKSPACE_SETTINGS":
      return withQuery("/app/settings/storage", params);
    case "RELINK_MEDIA":
      {
        const returnParams = new URLSearchParams();
        pushParam(returnParams, "workspace_id", payload.workspaceId);
        params.set("return_to", withQuery("/app/hammer/dev/cards", returnParams));
      }
      return withQuery("/app/hammer/dev/relink", params);
    case "ENABLE_CLOUD_MEDIA":
      params.set("section", "cloud-media");
      return withQuery("/app/settings/storage", params);
    default:
      return "/app/hammer";
  }
}

function buildEventName(payload: MediaCtaPayload): string {
  switch (payload.action) {
    case "OPEN_WORKSPACE_SETTINGS":
      return "hammer:media:workspace-settings:requested";
    case "RELINK_MEDIA":
      return "hammer:media:relink:requested";
    case "ENABLE_CLOUD_MEDIA":
      return "hammer:media:cloud-enable:requested";
    default:
      return "hammer:media:cta:requested";
  }
}

export function dispatchMediaCtaAction(
  payload: MediaCtaPayload,
  context: MediaCtaActionContext = {},
): MediaCtaDispatchResult {
  const emit = context.emit || defaultEmit;
  const logger = context.logger || defaultLogger;

  const detail: Record<string, unknown> = {
    action: payload.action,
    workspaceId: payload.workspaceId,
    mediaId: payload.mediaId,
  };
  const eventName = buildEventName(payload);
  const route = buildRoute(payload);

  emit(eventName, detail);
  emit("hammer:media:cta:requested", detail);

  if (context.navigate) {
    context.navigate(route);
  }

  const result: MediaCtaDispatchResult = {
    action: payload.action,
    handled: true,
    route,
    eventName,
    detail,
    reason: "action_map_stub_v1",
  };
  logger("[hammer:media] CTA dispatched", { ...result });
  return result;
}
