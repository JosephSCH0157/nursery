import { createBetaInvitationHandler, isBetaInvitationMutationEnabled } from "../../server/auth/beta-invitation-service";

declare const Netlify: { env: { get(name: string): string | undefined } };

function environment(name: string): string | undefined {
  try {
    return Netlify.env.get(name);
  } catch {
    return process.env[name];
  }
}

function required(...names: string[]): string {
  for (const name of names) {
    const value = environment(name)?.trim();
    if (value) return value;
  }
  throw new Error(`Missing server configuration: ${names.join(" or ")}`);
}

let handler: ReturnType<typeof createBetaInvitationHandler> | null = null;

export default function betaInvitations(request: Request): Promise<Response> {
  try {
    handler ??= createBetaInvitationHandler({
      supabaseUrl: required("TONGS_SUPABASE_URL", "SUPABASE_URL"),
      serviceRoleKey: required("TONGS_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
      publicOrigin: required("URL", "FORGE_PUBLIC_ORIGIN"),
      mutationsEnabled: isBetaInvitationMutationEnabled(
        environment("FORGE_BETA_INVITATIONS_ENABLED"),
      ),
    });
    return handler(request);
  } catch {
    return Promise.resolve(Response.json(
      { ok: false, code: "beta_invitation_service_unconfigured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    ));
  }
}
