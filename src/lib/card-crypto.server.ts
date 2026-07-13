import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM helper para cifrar números de cartão salvos em people_cards.
 * A chave vem da env var PEOPLE_CARD_ENC_KEY (base64 ou hex).
 * Se o valor recebido não tiver 32 bytes, derivamos via SHA-256 para tolerar
 * chaves geradas em formatos variados.
 */
function key(): Buffer {
  const raw = process.env.PEOPLE_CARD_ENC_KEY;
  if (!raw) throw new Error("PEOPLE_CARD_ENC_KEY não configurada");
  // tenta base64, depois hex, depois utf8 — normaliza para 32 bytes com SHA-256
  const buffers: Buffer[] = [];
  try { buffers.push(Buffer.from(raw, "base64")); } catch { /* noop */ }
  try { buffers.push(Buffer.from(raw, "hex")); } catch { /* noop */ }
  buffers.push(Buffer.from(raw, "utf8"));
  const exact = buffers.find((b) => b.length === 32);
  if (exact) return exact;
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptCardNumber(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptCardNumber(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
