import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../src/routes/Subscriptions.tsx", import.meta.url);

test("account panel exposes a Supabase-backed password change form", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /"Change password"/);
  assert.match(source, /autoComplete="new-password"/);
  assert.match(source, /minLength=\{8\}/);
  assert.match(source, /supabase\.auth\.updateUser\(\{\s*password: nextPassword,\s*\.\.\.\(nonce \? \{ nonce \} : \{\}\),\s*\}\)/);
  assert.match(source, /const nonce = passwordReauthCode\.trim\(\)/);
  assert.match(source, /supabase\.auth\.getSession\(\)/);
  assert.match(source, /Passwords do not match\./);
  assert.match(source, /role="status"/);
  assert.match(source, /role="alert"/);
});
