import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config as loadDotEnv } from "dotenv";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
loadDotEnv({ path: path.join(repoRoot, "apps", "nursery", ".env.local"), override: false });
loadDotEnv({ path: path.join(repoRoot, "apps", "nursery", ".env"), override: false });

const supabaseUrl = process.env.TONGS_SUPABASE_URL?.trim()
  || process.env.VITE_SUPABASE_URL?.trim()
  || "";
const serviceRoleKey = process.env.TONGS_SERVICE_ROLE_KEY?.trim() || "";
const publishableKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() || "";
const userId = process.env.CERT_USER_ID?.trim() || "71daf61b-57b3-4e5f-a8c8-64befecb5950";
if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
  throw new Error("Supabase credentials are required.");
}

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const customerResult = await service.auth.admin.getUserById(userId);
if (customerResult.error || !customerResult.data.user?.email) {
  throw customerResult.error ?? new Error("Customer email is unavailable.");
}
const linkResult = await service.auth.admin.generateLink({
  type: "magiclink",
  email: customerResult.data.user.email,
});
if (linkResult.error || !linkResult.data.properties?.hashed_token) {
  throw linkResult.error ?? new Error("Could not create a non-delivered customer sign-in token.");
}
const customer = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const verified = await customer.auth.verifyOtp({
  token_hash: linkResult.data.properties.hashed_token,
  type: "magiclink",
});
if (verified.error || verified.data.user?.id !== userId || !verified.data.session?.access_token) {
  throw verified.error ?? new Error("Customer-scoped authentication failed.");
}

const response = await fetch(`${supabaseUrl}/functions/v1/create-one-time-checkout-session`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${verified.data.session.access_token}`,
    apikey: publishableKey,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    priceId: "price_1THQeR1OSG3CCNl8YajEHCL8",
    successUrl: "https://example.invalid/forge-credit-success",
    cancelUrl: "https://example.invalid/forge-credit-cancel",
  }),
});
const body = await response.json() as Record<string, unknown>;
assert.equal(response.status, 403, JSON.stringify(body));
assert.equal(body.error, "FORGE_CREDIT_PURCHASES_UNAVAILABLE", JSON.stringify(body));
assert.equal(body.reason_code, "beta_admin_provisioned_only", JSON.stringify(body));

process.stdout.write(`${JSON.stringify({
  ok: true,
  user_id: userId,
  status: response.status,
  error: body.error,
  reason_code: body.reason_code,
  stripe_mutation_reached: false,
})}\n`);
