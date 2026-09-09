import { createOpenAiTextTestCertificationHandler } from "../../server/billing/openai-text-test-certification";

function required(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing required server configuration: ${names.join(" or ")}`);
}

const handler = createOpenAiTextTestCertificationHandler({
  supabaseUrl: required("TONGS_SUPABASE_URL", "SUPABASE_URL"),
  serviceRoleKey: required("TONGS_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
});

export default handler;
