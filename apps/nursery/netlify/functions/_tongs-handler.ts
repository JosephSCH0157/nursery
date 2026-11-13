import { authorizeFirstPartyUserRequest } from "../../server/tongs/first-party-user-request";
export { authorizeFirstPartyUserRequest } from "../../server/tongs/first-party-user-request";
import { createTongsCommitApiHandler } from "../../../../packages/tongs/src/workpiece-commit-api.ts";
import { resolveNurseryTongsProviderBoundary } from "../../scripts/mw-tongs-commit-api";
import { runWithOwnerRuntimeEnvironment } from "../../server/accounting/owner-runtime-environment";
import { withAdmissionEnforcement } from "../../server/auth/admission-enforcement";
import { resolveTongsRuntimeConfig } from "../../server/tongs/tongs-runtime-config";

const config = resolveTongsRuntimeConfig();
const providerBoundary = config.missing.length ? null : resolveNurseryTongsProviderBoundary(config);
const handler = providerBoundary ? createTongsCommitApiHandler(providerBoundary.options) : null;

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
  return async function netlifyTongsFunction(
    request: Request,
    context?: { deploy?: { context?: string } },
  ): Promise<Response> {
    return runWithOwnerRuntimeEnvironment(context?.deploy?.context, async () => {
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
      return withAdmissionEnforcement(
        request,
        "new_customer_operation",
        () => handler(forwarded),
      );
    });
  };
}
