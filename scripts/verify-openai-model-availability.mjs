import { verifyAndRecordOpenAiModelVisibility } from "./lib/openai-model-visibility.mjs";

try {
  const evidence = await verifyAndRecordOpenAiModelVisibility({
    openAiKey: process.env.OPENAI_MODEL_EVIDENCE_API_KEY,
    openAiProjectId: process.env.OPENAI_MODEL_EVIDENCE_PROJECT_ID,
    supabaseUrl: process.env.TONGS_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceRoleKey: process.env.TONGS_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false, blocker: error instanceof Error ? error.message : "model_visibility_check_failed",
    operation: "GET /v1/models/{model}; catalog-driven; no generation",
    required_server_secrets: ["OPENAI_MODEL_EVIDENCE_API_KEY", "OPENAI_MODEL_EVIDENCE_PROJECT_ID", "TONGS_SUPABASE_URL", "TONGS_SERVICE_ROLE_KEY"],
  }));
  process.exitCode = 2;
}
