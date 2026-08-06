export const CHAT_DEVICE_COOKIE = "via_chat_dev";
export const CHAT_DEVICE_DAYS = 30;
export const CHAT_DEVICE_MAX_ATTEMPTS = 5;

export function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function hashDevicePin(pin: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const pairs = saltHex.match(/.{2}/g);
  if (!pairs) throw new Error("Salt de PIN inválido.");
  const salt = Uint8Array.from(pairs.map((hex) => parseInt(hex, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return `${saltHex}:${bytesToHex(bits)}`;
}

export async function verifyDevicePin(pin: string, stored: string): Promise<boolean> {
  const [saltHex] = stored.split(":");
  if (!saltHex) return false;
  const calculated = await hashDevicePin(pin, saltHex);
  if (calculated.length !== stored.length) return false;
  let difference = 0;
  for (let index = 0; index < calculated.length; index += 1) {
    difference |= calculated.charCodeAt(index) ^ stored.charCodeAt(index);
  }
  return difference === 0;
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function makeDeviceCookie(value: string, maxAge: number): string {
  return [
    `${CHAT_DEVICE_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}${"•".repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

export async function hashChatAppLinkPin(token: string, pin: string): Promise<string> {
  return sha256Hex(`viaair-chat:${token}:${pin}`);
}