import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for secrets at rest (members' AI keys, later LinkedIn tokens). Server only.
// ENCRYPTION_KEY is 32 random bytes, base64 or hex. key_version lets the key be rotated later.

export const KEY_VERSION = 1;

export type Sealed = { ciphertext: Buffer; iv: Buffer; tag: Buffer; keyVersion: number };

function encryptionKey() {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("ENCRYPTION_KEY is not set.");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64 or hex).");
  return key;
}

export function encryptionConfigured() {
  try { encryptionKey(); return true; } catch { return false; }
}

export function seal(plaintext: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag(), keyVersion: KEY_VERSION };
}

export function unseal({ ciphertext, iv, tag }: Pick<Sealed, "ciphertext" | "iv" | "tag">): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Postgres bytea travels through PostgREST as "\x" followed by hex. */
export const toBytea = (buffer: Buffer) => `\\x${buffer.toString("hex")}`;
export const fromBytea = (value: string) => Buffer.from(value.replace(/^\\x/, ""), "hex");
