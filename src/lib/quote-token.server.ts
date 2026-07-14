import { createHmac, timingSafeEqual } from "crypto";

const getSecret = () => {
  const s = process.env.QUOTE_LINK_SECRET;
  if (!s) throw new Error("QUOTE_LINK_SECRET não configurado");
  return s;
};

// Token curto no formato `{orderNumber}-{sig10}`.
// Ex.: 12345678-a1b2c3d4e5
export function encodeQuoteTokenFromOrderNumber(orderNumber: string): string {
  const num = String(orderNumber).trim();
  if (!/^\d{4,20}$/.test(num)) throw new Error("orderNumber inválido");
  const sig = createHmac("sha256", getSecret()).update(num).digest("hex").slice(0, 10);
  return `${num}-${sig}`;
}

// Retorna o orderNumber se o token curto for válido.
export function decodeQuoteTokenToOrderNumber(token: string): string | null {
  const m = /^(\d{4,20})-([0-9a-f]{10})$/.exec(token);
  if (!m) return null;
  const num = m[1]!;
  const sig = m[2]!;
  const expected = createHmac("sha256", getSecret()).update(num).digest("hex").slice(0, 10);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return num;
}

// ---- Legado (formato antigo `{b64(id)}.{sig24}`) — mantido para links já enviados ----
const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string) => {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(b64, "base64");
};

export function encodeQuoteToken(orderId: string): string {
  const id = b64url(Buffer.from(orderId, "utf8"));
  const sig = createHmac("sha256", getSecret()).update(orderId).digest("hex").slice(0, 24);
  return `${id}.${sig}`;
}

export function decodeQuoteTokenLegacy(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [id, sig] = parts;
  if (!id || !sig) return null;
  let orderId: string;
  try {
    orderId = fromB64url(id).toString("utf8");
  } catch {
    return null;
  }
  if (!/^[0-9a-f-]{10,}$/i.test(orderId)) return null;
  const expected = createHmac("sha256", getSecret()).update(orderId).digest("hex").slice(0, 24);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return orderId;
}
