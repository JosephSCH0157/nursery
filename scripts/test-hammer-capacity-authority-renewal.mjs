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

test("authenticated collection pins Netlify billing and the supported Supabase metrics endpoint", () => {
  assert.match(generator, /api\.netlify\.com\/api\/v1\/accounts/);
  assert.match(generator, /billing\/credits/);
  assert.match(generator, /api\.supabase\.com\/v1\/projects/);
  assert.match(generator, /analytics\/endpoints\/metrics/);
  assert.match(generator, /supabase-control-attestation/);
  assert.doesNotMatch(generator, /platform\/organizations|billing\/subscription|usage\/daily/);
  assert.match(generator, /authorization: `Bearer \$\{token\}`/);
  assert.match(generator, /"cache-control": "no-cache"/);
  assert.match(generator, /server_response_date/);
  assert.match(generator, /cache_age_seconds/);
  assert.match(generator, /openSync\(outputPath, "wx", 0o600\)/);
  assert.match(generator, /responseBodiesRetained: false/);
  assert.match(generator, /forge_capacity_error=/);
  assert.match(generator, /safeFailureDiagnostic/);
  assert.doesNotMatch(generator, /process\.stderr\.write\([^)]*error\?\.message/);
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

test("Windows governance invokes WSL Node without putting capacity credentials on the command line", () => {
  assert.match(renewal, /Get-Command wsl\.exe/);
  assert.match(renewal, /function ConvertFrom-WslPath/);
  assert.match(renewal, /ConvertFrom-WslPath \(\[string\]\$receipt\.outputPath\)/);
  assert.match(renewal, /Diagnostics\.ProcessStartInfo/);
  assert.match(renewal, /FORGE_NETLIFY_CAPACITY_READ_TOKEN/);
  assert.match(renewal, /FORGE_SUPABASE_CAPACITY_READ_TOKEN/);
  assert.match(renewal, /SetEnvironmentVariable\('WSLENV'/);
  assert.match(renewal, /exec \"\$HOME\/\.local\/bin\/node\" \"\$@\"/);
  assert.match(renewal, /diagnostic \$diagnostic/);
  assert.match(renewal, /response output withheld/);
  assert.doesNotMatch(renewal, /&\s+node\b/);
  assert.doesNotMatch(renewal, /Arguments.*FORGE_(?:NETLIFY|SUPABASE)_CAPACITY_READ_TOKEN/);
});

test("production Hammer consumes the governed database authority instead of an expiring environment snapshot", () => {
  assert.match(prep, /readCurrentHammerAssemblyAiCapacityEvidence/);
  assert.match(prep, /hammer_first_transcription_activation_authorities/);
  assert.match(prep, /hammer_first_transcription_capacity_authorities/);
  assert.doesNotMatch(prep, /FORGE_HAMMER_ASSEMBLYAI_CAPACITY_EVIDENCE_JSON/);
});
