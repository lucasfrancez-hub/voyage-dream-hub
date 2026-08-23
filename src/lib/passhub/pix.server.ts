/**
 * Pix do checkout PassHub. SERVER-ONLY.
 *
 * O link de pagamento é `https://checkout.passhub.com.br/payment/<token>`.
 * O próprio checkout usa esse token como Bearer na API pública:
 *   POST https://checkout-api.passhub.com.br/api/v1/pix/criar
 * que devolve { br_code, br_code_base64, amount_cents, expiration... }.
 */

const CHECKOUT_API = "https://checkout-api.passhub.com.br/api/v1";
const NEXUS_API = "https://nexus.passhub.com.br/api/v1";

export type PassHubPix = {
  copiaECola: string;
  qrCodeBase64: string;
  valor: number;
  expiraEm: string;
};

/** Extrai o código curto do link de checkout. */
export function tokenDoLinkCheckout(link: string): string {
  const m = /\/payment\/([^/?#\s]+)/.exec((link || "").trim());
  return m?.[1] ?? "";
}

/** Troca o código curto do link pelo JWT temporário do checkout. */
async function expandirShortCode(shortCode: string): Promise<string> {
  const resp = await fetch(`${NEXUS_API}/expand-booking-token/${shortCode}`, {
    headers: { Accept: "application/json", Origin: "https://checkout.passhub.com.br" },
  });
  if (!resp.ok) {
    throw new Error(
      resp.status === 404
        ? "Link de pagamento expirado ou não encontrado na consolidadora."
        : `Falha ao abrir o checkout (HTTP ${resp.status}).`,
    );
  }
  const body = (await resp.json()) as { temp_jwt?: string };
  if (!body.temp_jwt) throw new Error("A consolidadora não devolveu o acesso ao checkout.");
  return body.temp_jwt;
}

const str = (v: unknown, fb = ""): string =>
  typeof v === "string" ? v : v == null ? fb : String(v);
const num = (v: unknown, fb = 0): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fb;
};

/** Gera (ou recupera) o Pix de um link de pagamento do checkout PassHub. */
export async function passhubPixDoLink(link: string): Promise<PassHubPix> {
  const shortCode = tokenDoLinkCheckout(link);
  if (!shortCode) throw new Error("Link de pagamento inválido — código do checkout não encontrado.");
  const jwt = await expandirShortCode(shortCode);

  const resp = await fetch(`${CHECKOUT_API}/pix/criar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${jwt}`,
      Origin: "https://checkout.passhub.com.br",
      Referer: `https://checkout.passhub.com.br/payment/${shortCode}`,
    },
    body: "{}",
  });

  const texto = await resp.text();
  if (!resp.ok) {
    throw new Error(
      `A consolidadora não gerou o Pix (HTTP ${resp.status}). ${texto.slice(0, 200)}`.trim(),
    );
  }

  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error("Resposta inesperada da consolidadora ao gerar o Pix.");
  }
  const body = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const dados = (
    body["data"] && typeof body["data"] === "object" ? body["data"] : body
  ) as Record<string, unknown>;

  const copiaECola = str(dados["br_code"] ?? dados["brCode"] ?? dados["pix_code"]);
  if (!copiaECola) throw new Error("A consolidadora não retornou o código Pix desta reserva.");

  const base64 = str(dados["br_code_base64"] ?? dados["qr_code_base64"] ?? dados["qrcode"]);

  return {
    copiaECola,
    qrCodeBase64: base64.startsWith("data:") || !base64 ? base64 : `data:image/png;base64,${base64}`,
    valor: num(dados["amount_cents"]) / 100 || num(dados["amount"]),
    expiraEm: str(dados["expiration"] ?? dados["expires_at"] ?? dados["expiration_date"]),
  };
}
