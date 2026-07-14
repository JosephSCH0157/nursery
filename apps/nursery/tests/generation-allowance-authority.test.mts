import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveOpenAiImageApiKey } from "../server/image-runtime-config.ts";

test("image runtime key never falls back to the ordinary text key", () => {
  const priorImage = process.env.OPENAI_IMAGE_API_KEY;
  const priorText = process.env.OPENAI_API_KEY;
  try {
    delete process.env.OPENAI_IMAGE_API_KEY;
    process.env.OPENAI_API_KEY = "text-key-must-not-be-used";
    assert.equal(resolveOpenAiImageApiKey(), null);
    process.env.OPENAI_IMAGE_API_KEY = " image-key ";
    assert.equal(resolveOpenAiImageApiKey(), "image-key");
  } finally {
    if (priorImage == null) delete process.env.OPENAI_IMAGE_API_KEY;
    else process.env.OPENAI_IMAGE_API_KEY = priorImage;
    if (priorText == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorText;
  }
});

test("generation allowance migration preserves leased, private, idempotent authority", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sql = fs.readFileSync(path.resolve(here, "../../../supabase/migrations/20260714190000_tongs_generation_allowance_banks.sql"), "utf8");
  assert.match(sql, /create table tongs\.generation_balances/i);
  assert.match(sql, /create table tongs\.generation_operations/i);
  assert.match(sql, /create table tongs\.generation_ledger/i);
  assert.match(sql, /expires_at timestamptz not null/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /unique \(billing_owner_id, generation_kind, action_id\)/i);
  assert.match(sql, /record_generation_outputs/i);
  assert.match(sql, /compensates_ledger_id/i);
  assert.match(sql, /revoke all on tongs\.generation_ledger from public, anon, authenticated/i);
  assert.match(sql, /get_my_generation_allowances\(\)/i);
  assert.doesNotMatch(sql, /apply_ai_token_delta/i);
});
