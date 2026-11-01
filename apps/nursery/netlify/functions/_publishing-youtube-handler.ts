import { createYoutubeConnectionHandler } from "../../server/publishing/create-youtube-connection-handler";
import {
  type AdmissionOperationClass,
  withAdmissionEnforcement,
} from "../../server/auth/admission-enforcement";

function required(...names: string[]): string {
  for (const name of names) { const value = process.env[name]?.trim(); if (value) return value; }
  throw new Error(`Missing server configuration: ${names.join(" or ")}`);
}

let handler: ReturnType<typeof createYoutubeConnectionHandler> | null = null;
function classifyPublishingOperation(pathname: string): AdmissionOperationClass {
  if (
    pathname.endsWith("/publishing-youtube-callback")
    || pathname.endsWith("/publishing-youtube-disconnect")
    || pathname.endsWith("/publishing-youtube-refresh")
    || pathname.endsWith("/publishing-destinations")
  ) {
    return "existing_authorized_operation";
  }
  return "new_customer_operation";
}

export function publishingYoutubeHandler(request: Request): Promise<Response> {
  try {
    handler ??= createYoutubeConnectionHandler({
      supabaseUrl: required("TONGS_SUPABASE_URL", "SUPABASE_URL"),
      serviceRoleKey: required("TONGS_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
      rpcKey: required("TONGS_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
      clientId: required("FORGE_GOOGLE_OAUTH_CLIENT_ID"),
      clientSecret: required("FORGE_GOOGLE_OAUTH_CLIENT_SECRET"),
      redirectUri: required("FORGE_YOUTUBE_OAUTH_REDIRECT_URI"),
    });
    return withAdmissionEnforcement(
      request,
      classifyPublishingOperation(new URL(request.url).pathname),
      () => handler!(request),
    );
  } catch {
    return Promise.resolve(new Response(JSON.stringify({ ok: false, code: "publishing_youtube_unconfigured" }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } }));
  }
}
