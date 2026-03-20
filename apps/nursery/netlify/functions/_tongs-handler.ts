import { createTongsCommitApiHandler } from "../../../../packages/tongs/src/workpiece-commit-api.ts";
import { resolveTongsRuntimeConfig } from "../../server/tongs/tongs-runtime-config";

const config = resolveTongsRuntimeConfig();
const handler = config.missing.length ? null : createTongsCommitApiHandler(config.options);

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
    const forwarded = new Request(original.toString(), request);
    return handler(forwarded);
  };
}