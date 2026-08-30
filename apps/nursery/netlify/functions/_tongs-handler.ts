import { createTongsCommitApiHandler } from "../../../../packages/tongs/src/workpiece-commit-api.ts";
import { resolveTongsRuntimeConfig } from "../../server/tongs/tongs-runtime-config";

const config = resolveTongsRuntimeConfig();
const handler = config.missing.length ? null : createTongsCommitApiHandler(config.options);

const USER_AUTH_HEADERS = ["x-forge-user-authorization", "x-forge-user-token"] as const;

export function authorizeFirstPartyUserRequest(
  request: Request,
  apiToken: string | undefined,
): Request {
  if (!apiToken || request.headers.has("authorization")) return request;
  const hasUserAuthorization = USER_AUTH_HEADERS.some((name) => {
    const value = request.headers.get(name)?.trim();
    return Boolean(value && /^Bearer\s+\S+$/i.test(value));
  });
  if (!hasUserAuthorization) return request;

  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${apiToken}`);
  return new Request(request, { headers });
}

function remapTongsPath(pathname: string, routePrefix: string): string {
  const functionPrefix = "/.netlify/functions/tongs";
  if (pathname === functionPrefix) return routePrefix;
  if (pathname.startsWith(`${functionPrefix}/`)) {
    const suffix = pathname.slice(functionPrefix.length);
    return `${routePrefix}${suffix}`;
  }
  return pathname;
}

export function createNetlifyTongsFunction(routePrefix = "/tongs") {
  return async function netlifyTongsFunction(request: Request): Promise<Response> {
    if (!handler) {
      return new Response(JSON.stringify({
        ok: false,
        error: {
          code: "tongs_commit_api_unconfigured",
          message: "Missing required server env for Tongs Commit API",
          missing_env: config.missing,
        },
      }), {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    }

    const original = new URL(request.url);
    original.pathname = remapTongsPath(original.pathname, routePrefix);
    const remapped = new Request(original.toString(), request);
    // Browser callers prove user authority with their Supabase bearer token.
    // Keep the deployment API credential server-only and add it at this
    // same-origin function boundary; route handlers still validate the user
    // token and enforce workspace roles/RLS before touching canonical state.
    const forwarded = authorizeFirstPartyUserRequest(remapped, config.options.apiToken);
    return handler(forwarded);
  };
}
