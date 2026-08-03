/**
 * Web Push (VAPID + aes128gcm) implementado só com Web Crypto,
 * porque o runtime do servidor é Worker e as libs de Node não rodam aqui.
 *
 * Referências: RFC 8291 (Message Encryption) e RFC 8292 (VAPID).
 */

const enc = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array {
  const base = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base + "=".repeat((4 - (base.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(b: Uint8Array | ArrayBuffer): string {
  const arr = b instanceof Uint8Array ? b : new Uint8Array(b);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as BufferSource));
}

/** HKDF simplificado (uma iteração basta: nunca passamos de 32 bytes). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, len);
}

/** Chave pública P-256 (65 bytes, não comprimida) a partir de um JWK. */
function jwkToRaw(x: string, y: string): Uint8Array {
  return concat(new Uint8Array([4]), b64urlToBytes(x), b64urlToBytes(y));
}

async function vapidJwt(audience: string, subject: string, privD: string, pubRaw: Uint8Array): Promise<string> {
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: privD,
    x: bytesToB64url(pubRaw.slice(1, 33)),
    y: bytesToB64url(pubRaw.slice(33, 65)),
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(`${header}.${payload}`) as BufferSource,
  );
  return `${header}.${payload}.${bytesToB64url(sig)}`;
}

async function encriptar(payload: string, p256dh: string, authSecret: string) {
  const clientPub = b64urlToBytes(p256dh);
  const auth = b64urlToBytes(authSecret);

  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));

  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPub as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, par.privateKey, 256));

  const prkKey = await hmac(auth, shared);
  const keyInfo = concat(enc.encode("WebPush: info\0"), clientPub, asPublic);
  const ikm = await hmac(prkKey, concat(keyInfo, new Uint8Array([1])));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, plaintext as BufferSource),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const header = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic);
  return concat(header, ct);
}

export type PushSub = { endpoint: string; p256dh: string; auth: string };

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/** Manda uma notificação. Devolve `gone: true` quando o aparelho desinstalou. */
export async function enviarPush(sub: PushSub, payload: PushPayload): Promise<{ ok: boolean; gone: boolean; status: number; erro?: string }> {
  const pubB64 = process.env["VAPID_PUBLIC_KEY"];
  const privD = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] || "mailto:contato@viaair.tur.br";
  if (!pubB64 || !privD) return { ok: false, gone: false, status: 0, erro: "VAPID não configurado" };

  const pubRaw = b64urlToBytes(pubB64);
  const audience = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(audience, subject, privD, pubRaw);
  const corpo = await encriptar(JSON.stringify(payload), sub.p256dh, sub.auth);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${pubB64}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body: corpo as BodyInit,
  });

  if (res.ok) return { ok: true, gone: false, status: res.status };
  const texto = await res.text().catch(() => "");
  return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status, erro: texto.slice(0, 300) };
}

export function chavePublicaVapid(): string {
  return process.env["VAPID_PUBLIC_KEY"] ?? "";
}
