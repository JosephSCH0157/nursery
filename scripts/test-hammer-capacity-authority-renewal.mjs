import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const managed = readFileSync(new URL("./lib/forge-managed-credential.ps1", import.meta.url), "utf8");
const credentials = readFileSync(new URL("./invoke-hammer-capacity-read-credentials.ps1", import.meta.url), "utf8");
const renewal = readFileSync(new URL("./invoke-hammer-capacity-authority-renewal.ps1", import.meta.url), "utf8");
const generator = readFileSync(new URL("./new-hammer-capacity-evidence.mjs", import.meta.url), "utf8");
const prep = readFileSync(new URL("../apps/nursery/scripts/mw-hammer-prep.ts", import.meta.url), "utf8");

test("capacity credentials remain managed, process-scoped, and absent from receipts", () => {
  assert.match(managed, /WindowsCredentialNative\]::Read\(\$script:ForgeNetlifyCapacityReadCredentialTarget\)/);
  assert.match(managed, /WindowsCredentialNative\]::Read\(\$script:ForgeSupabaseCapacityReadCredentialTarget\)/);
  assert.match(managed, /SetEnvironmentVariable\('FORGE_NETLIFY_CAPACITY_READ_TOKEN', \$null, 'Process'\)/);
  assert.match(managed, /SetEnvironmentVariable\('FORGE_SUPABASE_CAPACITY_READ_TOKEN', \$null, 'Process'\)/);
  assert.match(credentials, /ENROLL-HAMMER-CAPACITY-READ-CREDENTIALS/);
  assert.match(credentials, /secretReturned=\$false/);
  assert.doesNotMatch(credentials, /ConvertFrom-SecureString/);
});

test("authenticated collection pins the exact Netlify and Supabase read endpoints", () => {
  assert.match(generator, /api\.netlify\.com\/api\/v1\/accounts/);
  assert.match(generator, /billing\/credits/);
  assert.match(generator, /api\.supabase\.com\/platform\/organizations/);
  assert.match(generator, /billing\/subscription/);
  assert.match(generator, /usage\/daily/);
  assert.match(generator, /authorization: `Bearer \$\{token\}`/);
  assert.match(generator, /openSync\(outputPath, "wx", 0o600\)/);
  assert.match(generator, /responseBodiesRetained: false/);
});

test("renewal is pinned to migration 427 and invokes only the service-role renewal RPC", () => {
  assert.match(renewal, /history\.Count -ne 427/);
  assert.match(renewal, /20261030224605/);
  assert.match(renewal, /RENEW-HAMMER-BRAD-OWNER-SPONSORSHIP-AUTHORITY/);
  assert.match(renewal, /set_config\('request\.jwt\.claim\.role','service_role',true\)/);
  assert.match(renewal, /renew_hammer_owner_funded_first_transcription_authority/);
  assert.match(renewal, /customerPaymentMicros=0/);
  assert.match(renewal, /customerCreditUnits=0/);
  assert.match(renewal, /providerAttemptCreated=\$false/);
  assert.doesNotMatch(renewal, /AssemblyAI|stripe|customer_spending_quotes\s+set/i);
});

test("production Hammer consumes the governed database authority instead of an expiring environment snapshot", () => {
  assert.match(prep, /readCurrentHammerAssemblyAiCapacityEvidence/);
  assert.match(prep, /hammer_first_transcription_activation_authorities/);
  assert.match(prep, /hammer_first_transcription_capacity_authorities/);
  assert.doesNotMatch(prep, /FORGE_HAMMER_ASSEMBLYAI_CAPACITY_EVIDENCE_JSON/);
});
