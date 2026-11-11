import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function assertDisposableAdmissionTarget(url: string, env: NodeJS.ProcessEnv = process.env): void {
  const target = new URL(url);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1"
    || env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "JosephSCH0157/nursery"
    || !/^\d+$/.test(env.GITHUB_RUN_ID ?? "") || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? "")
    || !env.FORGE_BROWSER_SUPABASE_WORKDIR || !env.RUNNER_TEMP
    || env.FORGE_BROWSER_SUPABASE_WORKDIR !== `${env.RUNNER_TEMP}/forge-he3-browser-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`) {
    throw new Error("Admission provisioning requires the exact guarded disposable browser CI environment.");
  }
}

// Normal admission APIs, never direct admission/ledger writes or forged JWT claims.
// A separate synthetic operator is revoked in finally; audit-linked identities survive until DB teardown.
export async function ensureBrowserFixtureAdmission(admin: SupabaseClient, config: {supabaseUrl: string; anonKey: string; email: string}, userId: string): Promise<void> {
  const tongs = admin.schema("tongs");
  const admitted = await tongs.rpc("is_account_admitted", {p_user_id: userId});
  if (admitted.error) throw new Error("Unable to verify browser fixture admission.");
  if (admitted.data === true) return;
  assertDisposableAdmissionTarget(config.supabaseUrl);
  const operation = randomUUID();
  const email = `browser-operator-${operation}@example.test`, password = randomUUID()+randomUUID();
  const created = await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{fixture_namespace:"forge-browser-release-v1",purpose:"admission-operator"}});
  if (created.error || !created.data.user) throw new Error("Disposable admission operator creation failed.");
  const operatorId = created.data.user.id;
  const operator = createClient(config.supabaseUrl,config.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const requireResult = async (request: PromiseLike<{error: unknown; data: unknown}>, label: string) => {
    const result = await request;
    if(result.error) throw new Error(`Disposable admission ${label} failed.`);
    return result.data;
  };
  try {
    await requireResult(tongs.rpc("set_platform_operator",{p_user_id:operatorId,p_enabled:true,p_reason:"Guarded disposable browser fixture admission"}),"operator grant");
    const login = await operator.auth.signInWithPassword({email,password});
    if(login.error || login.data.user?.id !== operatorId) throw new Error("Disposable admission operator authentication failed.");
    const rows = await requireResult(tongs.rpc("ingest_beta_access_application",{
      p_source_reference:`browser-fixture:${userId}`,p_payload_sha256:createHash("sha256").update(JSON.stringify({userId,email:config.email})).digest("hex"),
      p_email:config.email,p_name:"Synthetic browser fixture",p_creator_type:"test",p_frequency:"test",
      p_goals:"Guarded disposable publication certification; no paid processing",
    }),"application") as Array<{application_id:string}>;
    const applicationId = rows?.[0]?.application_id;
    if(!applicationId) throw new Error("Disposable admission application identity missing.");
    await requireResult(operator.schema("tongs").rpc("decide_beta_access_application",{p_application_id:applicationId,p_decision:"approved",p_reason:"Guarded disposable browser certification",p_operation_id:randomUUID()}),"approval");
    await requireResult(tongs.rpc("bind_existing_beta_access_application_as_operator",{
      p_actor_id:operatorId,p_application_id:applicationId,p_user_id:userId,p_reason:"Bind exact confirmed synthetic browser fixture identity",
      p_binding_operation_id:randomUUID(),p_attempt_id:randomUUID(),p_acknowledgement_operation_id:randomUUID(),p_journal_operation_id:randomUUID(),
    }),"binding");
    const verified = await requireResult(tongs.rpc("is_account_admitted",{p_user_id:userId}),"verification");
    if(verified !== true) throw new Error("Disposable fixture admission was not established.");
  } finally {
    await operator.auth.signOut();
    await requireResult(tongs.rpc("set_platform_operator",{p_user_id:operatorId,p_enabled:false,p_reason:"Disposable admission operator cleanup"}),"operator revocation");
  }
}
