import crypto from "node:crypto";

const CIPHERTEXT_VERSION = "v1";
const CIPHER_ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;

function assertServerOnlyModule(): void {
  if (typeof window !== "undefined") {
    throw new Error("ai-key-crypto is server-only and cannot run in browser context");
  }
}

function readEncryptionSecret(): string {
  const value = process.env.FORGE_USER_KEY_ENCRYPTION_SECRET;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing FORGE_USER_KEY_ENCRYPTION_SECRET");
  }
  return value.trim();
}

function deriveEncryptionKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function decodeBase64(part: string): Buffer {
  try {
    return Buffer.from(part, "base64");
  } catch {
    throw new Error("Malformed ciphertext payload");
  }
}

export function encryptUserAiKey(rawKey: string): string {
  assertServerOnlyModule();
  const trimmed = rawKey.trim();
  if (!trimmed) {
    throw new Error("AI key cannot be empty");
  }

  const secret = readEncryptionSecret();
  const key = deriveEncryptionKey(secret);
  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${CIPHERTEXT_VERSION}:${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptUserAiKey(ciphertext: string): string {
  assertServerOnlyModule();
  const parts = ciphertext.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed ciphertext payload");
  }
  const [version, ivPart, authTagPart, ciphertextPart] = parts;
  if (version !== CIPHERTEXT_VERSION) {
    throw new Error("Unsupported ciphertext version");
  }

  const iv = decodeBase64(ivPart);
  const authTag = decodeBase64(authTagPart);
  const payload = decodeBase64(ciphertextPart);
  if (iv.byteLength !== IV_BYTE_LENGTH) {
    throw new Error("Malformed ciphertext payload");
  }

  const secret = readEncryptionSecret();
  const key = deriveEncryptionKey(secret);
  try {
    const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8").trim();
    if (!plaintext) {
      throw new Error("Decrypted plaintext was empty");
    }
    return plaintext;
  } catch {
    throw new Error("Failed to decrypt AI key payload");
  }
}

export function getUserAiKeyCiphertextVersion(): string {
  return CIPHERTEXT_VERSION;
}
