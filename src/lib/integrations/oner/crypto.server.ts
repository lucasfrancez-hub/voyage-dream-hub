/**
 * Cifra AES-256-GCM para a sessão e o código de acesso da Comprar Viagem.
 * SERVER-ONLY. A chave vem de ONER_SESSION_ENC_KEY (base64, hex ou texto);
 * qualquer formato é normalizado para 32 bytes com SHA-256.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function chave(): Buffer {
  const raw = process.env["ONER_SESSION_ENC_KEY"] ?? process.env["PEOPLE_CARD_ENC_KEY"];
  if (!raw) throw new Error("ONER_SESSION_ENC_KEY não configurada");
  const tentativas: Buffer[] = [];
  try { tentativas.push(Buffer.from(raw, "base64")); } catch { /* noop */ }
  try { tentativas.push(Buffer.from(raw, "hex")); } catch { /* noop */ }
  tentativas.push(Buffer.from(raw, "utf8"));
  const exata = tentativas.find((b) => b.length === 32);
  return exata ?? createHash("sha256").update(raw, "utf8").digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const ct = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decifrar(guardado: string): string {
  const buf = Buffer.from(guardado, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", chave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

/** Mostra só os dois últimos dígitos de um código. */
export function mascarar(codigo: string): string {
  const fim = String(codigo).slice(-2);
  return `${"•".repeat(Math.max(2, String(codigo).length - 2))}${fim}`;
}
