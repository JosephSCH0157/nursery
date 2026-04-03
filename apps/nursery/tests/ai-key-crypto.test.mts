import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptUserAiKey,
  encryptUserAiKey,
  getUserAiKeyCiphertextVersion,
} from "../../../packages/tongs/src/server/ai-key-crypto";

const ORIGINAL_SECRET = process.env.FORGE_USER_KEY_ENCRYPTION_SECRET;

test.afterEach(() => {
  if (ORIGINAL_SECRET == null) {
    delete process.env.FORGE_USER_KEY_ENCRYPTION_SECRET;
  } else {
    process.env.FORGE_USER_KEY_ENCRYPTION_SECRET = ORIGINAL_SECRET;
  }
});

test("encrypt/decrypt round-trips and preserves version prefix", () => {
  process.env.FORGE_USER_KEY_ENCRYPTION_SECRET = "test-secret-value";
  const raw = "sk-test-123456";
  const encrypted = encryptUserAiKey(raw);

  assert.match(encrypted, new RegExp(`^${getUserAiKeyCiphertextVersion()}:`));
  const decrypted = decryptUserAiKey(encrypted);
  assert.equal(decrypted, raw);
});

test("decrypt throws controlled error on malformed ciphertext", () => {
  process.env.FORGE_USER_KEY_ENCRYPTION_SECRET = "test-secret-value";
  assert.throws(
    () => decryptUserAiKey("invalid-payload"),
    /Malformed ciphertext payload/,
  );
});

test("encrypt fails fast when FORGE_USER_KEY_ENCRYPTION_SECRET is missing", () => {
  delete process.env.FORGE_USER_KEY_ENCRYPTION_SECRET;
  assert.throws(
    () => encryptUserAiKey("sk-test-123456"),
    /Missing FORGE_USER_KEY_ENCRYPTION_SECRET/,
  );
});
