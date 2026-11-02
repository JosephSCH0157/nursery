import { createClient } from "@supabase/supabase-js";

export const ADMISSION_ENFORCEMENT_FLAG = "FORGE_ADMISSION_ENFORCEMENT_ENABLED";

export type AdmissionOperationClass =
  | "new_customer_operation"
  | "existing_authorized_operation"
  | "trusted_system_maintenance"
  | "public_guest_signal";

type AdmissionRpcResult = {
  data: unknown;
  error: { message?: string; code?: string } | null;
};

export type AdmissionGuardDependencies = {
  verifyUser: (token: string) => PromiseLike<{
    userId: string | null;
    error: unknown;
  }>;
  requireAdmission: (userId: string) => PromiseLike<AdmissionRpcResult>;
};

export type AdmissionGuardRuntime = {
  enabled: boolean;
  dependencies?: AdmissionGuardDependencies;
  supabaseUrl?: string;
  serviceRoleKey?: string;
  fetchImpl?: typeof fetch;
};

function json(status: number, code: string): Response {
  return Response.json(
    { error: code },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function bearer(value: string | null): string | null {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function readAdmissionUserToken(request: Request): string | null {
  return bearer(request.headers.get("x-forge-user-authorization"))
    ?? request.headers.get("x-forge-user-token")?.trim()
    ?? bearer(request.headers.get("authorization"));
}

export function readAdmissionGuardRuntime(
  environment: Record<string, string | undefined> = process.env,
): AdmissionGuardRuntime {
  return {
    enabled: environment[ADMISSION_ENFORCEMENT_FLAG]?.trim().toLowerCase() === "true",
    supabaseUrl: environment.TONGS_SUPABASE_URL?.trim()
      || environment.SUPABASE_URL?.trim()
      || environment.VITE_SUPABASE_URL?.trim(),
    serviceRoleKey: environment.TONGS_SERVICE_ROLE_KEY?.trim()
      || environment.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };
}

function createDependencies(runtime: AdmissionGuardRuntime): AdmissionGuardDependencies | null {
  if (runtime.dependencies) return runtime.dependencies;
  if (!runtime.supabaseUrl || !runtime.serviceRoleKey) return null;

  const client = createClient(runtime.supabaseUrl, runtime.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: runtime.fetchImpl ? { fetch: runtime.fetchImpl } : undefined,
  });

  return {
    async verifyUser(token) {
      const result = await client.auth.getUser(token);
      return { userId: result.data.user?.id ?? null, error: result.error };
    },
    async requireAdmission(userId) {
      return await client.schema("tongs").rpc("require_account_admission", {
        p_user_id: userId,
      }) as AdmissionRpcResult;
    },
  };
}

export async function withAdmissionEnforcement(
  request: Request,
  operationClass: AdmissionOperationClass,
  next: () => Promise<Response>,
  runtime: AdmissionGuardRuntime = readAdmissionGuardRuntime(),
): Promise<Response> {
  // The prepared guard must be a zero-behavior-change pass-through until the
  // exact deployment flag is intentionally enabled.
  if (!runtime.enabled || operationClass !== "new_customer_operation") {
    return await next();
  }

  const token = readAdmissionUserToken(request);
  if (!token) return json(401, "authenticated_account_required");

  const dependencies = createDependencies(runtime);
  if (!dependencies) return json(503, "admission_guard_unavailable");

  let verified: Awaited<ReturnType<AdmissionGuardDependencies["verifyUser"]>>;
  try {
    verified = await dependencies.verifyUser(token);
  } catch {
    return json(503, "admission_guard_unavailable");
  }

  if (verified.error || !verified.userId) {
    return json(401, "authenticated_account_required");
  }

  try {
    const result = await dependencies.requireAdmission(verified.userId);
    if (result.error) {
      return result.error.code === "42501"
        ? json(403, "account_admission_required")
        : json(503, "admission_guard_unavailable");
    }
  } catch {
    return json(503, "admission_guard_unavailable");
  }

  return await next();
}
