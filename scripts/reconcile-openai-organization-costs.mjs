import { collectOpenAiOrganizationEvidence, recordOpenAiOrganizationEvidence } from "./lib/openai-organization-reconciliation.mjs";

const periodStart = Number(process.env.OPENAI_RECONCILIATION_START_TIME);
const periodEnd = Number(process.env.OPENAI_RECONCILIATION_END_TIME);
const evidence = await collectOpenAiOrganizationEvidence({
  adminKey: process.env.OPENAI_RECONCILIATION_ADMIN_KEY,
  periodStart,
  periodEnd,
  projectId: process.env.OPENAI_RECONCILIATION_PROJECT_ID,
});
const result = await recordOpenAiOrganizationEvidence({
  supabaseUrl: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  evidence,
  periodStart,
  periodEnd,
});
console.log(JSON.stringify({ batch_id: evidence.batchId, total_cost_micros: evidence.totalCostMicros, result }));
