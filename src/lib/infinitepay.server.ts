/**
 * Integração InfinitePay — EXCLUSIVA do módulo de PASSAPORTE.
 * Não usar em aéreo, hotel, pacote, seguro, reserva, transfer ou orçamento.
 */

export const INFINITEPAY_HANDLE = "viaair_agencia";
export const PASSAPORTE_VALOR_CENTAVOS = 32000; // R$ 320,00 — definido só no backend
export const PASSAPORTE_MAX_PARCELAS_CARTAO = 10;

const API_BASE = "https://api.checkout.infinitepay.io";

export function siteBaseUrl(): string {
  return (
    process.env["PUBLIC_SITE_URL"] ||
    process.env["VITE_PUBLIC_SITE_URL"] ||
    "https://pedidos.viaair.tur.br"
  ).replace(/\/$/, "");
}

export type InfinitePayCheckoutInput = {
  orderNsu: string;
  token: string;
  customer?: { name?: string | null; email?: string | null; phone?: string | null };
};

export type InfinitePayCheckoutResult = {
  url: string;
  slug: string | null;
  raw: unknown;
};

function normalizePhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
}

export async function criarCheckoutInfinitePay(
  input: InfinitePayCheckoutInput,
): Promise<InfinitePayCheckoutResult> {
  const base = siteBaseUrl();
  const customer: Record<string, string> = {};
  if (input.customer?.name) customer["name"] = input.customer.name;
  if (input.customer?.email) customer["email"] = input.customer.email;
  const phone = normalizePhone(input.customer?.phone);
  if (phone) customer["phone_number"] = phone;

  const body: Record<string, unknown> = {
    handle: INFINITEPAY_HANDLE,
    order_nsu: input.orderNsu,
    items: [
      {
        quantity: 1,
        price: PASSAPORTE_VALOR_CENTAVOS,
        description: "Pagamento de Passaporte",
      },
    ],
    redirect_url: `${base}/passaporte/${input.token}/retorno`,
    webhook_url: `${base}/api/public/infinitepay-passaporte-webhook`,
  };
  if (Object.keys(customer).length > 0) body["customer"] = customer;

  const res = await fetch(`${API_BASE}/links`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(
      `InfinitePay /links falhou (${res.status}): ${text.slice(0, 300) || "sem corpo"}`,
    );
  }

  const url: string | undefined =
    json?.url ?? json?.checkout_url ?? json?.link ?? json?.data?.url ?? undefined;
  if (!url) throw new Error("InfinitePay não retornou a URL do checkout.");

  const slug: string | null =
    json?.slug ?? json?.invoice_slug ?? json?.data?.slug ?? extrairSlug(url);

  return { url, slug, raw: json };
}

function extrairSlug(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

export type PaymentCheckResult = {
  success: boolean;
  paid: boolean;
  amount: number | null;
  paidAmount: number | null;
  installments: number | null;
  captureMethod: string | null;
  receiptUrl: string | null;
  raw: unknown;
};

export async function consultarPagamentoInfinitePay(params: {
  orderNsu: string;
  transactionNsu?: string | null;
  slug?: string | null;
}): Promise<PaymentCheckResult> {
  const body: Record<string, unknown> = {
    handle: INFINITEPAY_HANDLE,
    order_nsu: params.orderNsu,
  };
  if (params.transactionNsu) body["transaction_nsu"] = params.transactionNsu;
  if (params.slug) body["slug"] = params.slug;

  const res = await fetch(`${API_BASE}/payment_check`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(
      `InfinitePay /payment_check falhou (${res.status}): ${text.slice(0, 300) || "sem corpo"}`,
    );
  }

  const num = (v: unknown): number | null =>
    v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);

  return {
    success: json?.success === true,
    paid: json?.paid === true,
    amount: num(json?.amount),
    paidAmount: num(json?.paid_amount),
    installments: num(json?.installments),
    captureMethod: json?.capture_method ? String(json.capture_method) : null,
    receiptUrl: json?.receipt_url ? String(json.receipt_url) : null,
    raw: json,
  };
}

export function gerarOrderNsu(passportRequestId: string): string {
  const curto = passportRequestId.replace(/-/g, "").slice(0, 12).toUpperCase();
  return `PASSAPORTE-${curto}-${Math.floor(Date.now() / 1000)}`;
}
