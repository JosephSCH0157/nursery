import crypto from "node:crypto";
import process from "node:process";

const CIPHERTEXT_VERSION = "v1";
const DEFAULT_KEY_VERSION = "k1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function serverOnly(): void {
  if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
    throw new Error("publishing-credential-crypto is server-only");
  }
}

function keyVersion(): string {
  return process.env.FORGE_PUBLISHING_CREDENTIAL_KEY_VERSION?.trim() || DEFAULT_KEY_VERSION;
}

function secretFor(version: string): string {
  const keyring = process.env.FORGE_PUBLISHING_CREDENTIAL_ENCRYPTION_KEYS?.trim();
  if (keyring) {
    try {
      const parsed = JSON.parse(keyring) as Record<string, unknown>;
      const value = parsed[version];
      if (typeof value === "string" && value.trim()) return value.trim();
    } catch { throw new Error("Malformed FORGE_PUBLISHING_CREDENTIAL_ENCRYPTION_KEYS"); }
  }
  const fallback = process.env.FORGE_PUBLISHING_CREDENTIAL_ENCRYPTION_SECRET?.trim();
  if (fallback && version === keyVersion()) return fallback;
  throw new Error(`Publishing credential key version is unavailable: ${version}`);
}

function key(version: string): Buffer {
  return crypto.createHash("sha256").update(`${version}:${secretFor(version)}`, "utf8").digest();
}

export type PublishingCiphertext = { ciphertext: string; ciphertextVersion: string; encryptionKeyVersion: string };

export function encryptPublishingCredential(plaintext: string): PublishingCiphertext {
  serverOnly();
  if (!plaintext) throw new Error("Publishing credential plaintext is required");
  const iv = crypto.randomBytes(IV_BYTES);
  const currentKeyVersion = keyVersion();
  const cipher = crypto.createCipheriv(ALGORITHM, key(currentKeyVersion), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: `${CIPHERTEXT_VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`,
    ciphertextVersion: CIPHERTEXT_VERSION,
    encryptionKeyVersion: currentKeyVersion,
  };
}

export function decryptPublishingCredential(value: PublishingCiphertext): string {
  serverOnly();
  const [version, ivRaw, tagRaw, payloadRaw] = value.ciphertext.split(":");
  if (version !== value.ciphertextVersion || version !== CIPHERTEXT_VERSION || !ivRaw || !tagRaw || !payloadRaw) throw new Error("Malformed publishing credential ciphertext");
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key(value.encryptionKeyVersion), Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(payloadRaw, "base64")), decipher.final()]).toString("utf8");
    if (!plaintext) throw new Error("empty");
    return plaintext;
  } catch {
    throw new Error("Failed to decrypt publishing credential");
  }
}

export function getPublishingCredentialCiphertextVersion(): string { return CIPHERTEXT_VERSION; }
export function getPublishingCredentialKeyVersion(): string { return keyVersion(); }
