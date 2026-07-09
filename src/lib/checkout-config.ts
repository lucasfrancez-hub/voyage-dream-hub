// WhatsApp da agência (usado nos CTAs de Pix e contato).
export const WHATSAPP_PHONE = "5544999514838";

export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

// Mensagem padrão para solicitar orçamento com outra quantidade de viajantes.
export function customQuoteWhatsappUrl(pkgTitle: string): string {
  return whatsappUrl(
    `Olá! Tenho interesse no pacote *${pkgTitle}* mas para uma quantidade diferente de viajantes. Pode me ajudar com um orçamento personalizado?`,
  );
}

// E-mail que recebe notificações de novos pedidos.
export const NOTIFICATION_EMAIL = "comercial@voeair.com";

// Gera um link do cofre próprio (dentro do domínio) com valor e parcelas.
export function paymentLinkUrl(params: {
  description: string;
  total: number;
  installments: number;
  orderRef?: string;
  customerName?: string;
  firstAmount?: number; // valor da 1ª parcela quando diferente das demais
  imageUrl?: string; // imagem do destino que aparece no topo do link do cliente
  supplier?: string; // fornecedor que aparecerá na fatura (cia aérea, operadora, etc.)
}): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://voeair.com";
  const q = new URLSearchParams();
  q.set("desc", params.description);
  q.set("total", params.total.toFixed(2));
  q.set("parcelas", String(params.installments));
  if (params.firstAmount && params.firstAmount > 0 && params.installments > 1) {
    q.set("entrada", params.firstAmount.toFixed(2));
  }
  if (params.orderRef) q.set("ref", params.orderRef);
  if (params.customerName) q.set("cliente", params.customerName);
  if (params.imageUrl) q.set("img", params.imageUrl);
  if (params.supplier) q.set("fornec", params.supplier);
  return `${origin}/pagar?${q.toString()}`;
}

// Link de pagamento "convencional" (sem biometria/assinatura) — para clientes já conhecidos.
export function paymentSimpleLinkUrl(params: {
  description: string;
  total: number;
  installments: number;
  orderRef?: string;
  customerName?: string;
  firstAmount?: number;
  imageUrl?: string;
  supplier?: string;
}): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://voeair.com";
  const q = new URLSearchParams();
  q.set("desc", params.description);
  q.set("total", params.total.toFixed(2));
  q.set("parcelas", String(params.installments));
  if (params.firstAmount && params.firstAmount > 0 && params.installments > 1) {
    q.set("entrada", params.firstAmount.toFixed(2));
  }
  if (params.orderRef) q.set("ref", params.orderRef);
  if (params.customerName) q.set("cliente", params.customerName);
  if (params.imageUrl) q.set("img", params.imageUrl);
  if (params.supplier) q.set("fornec", params.supplier);
  q.set("simples", "1");
  return `${origin}/pagar?${q.toString()}`;
}

// Link de pagamento por boleto bancário — cliente preenche a ficha de crédito.
export function paymentBoletoLinkUrl(params: {
  description: string;
  total: number;
  orderRef?: string;
  customerName?: string;
  imageUrl?: string;
}): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://voeair.com";
  const q = new URLSearchParams();
  q.set("desc", params.description);
  q.set("total", params.total.toFixed(2));
  if (params.orderRef) q.set("ref", params.orderRef);
  if (params.customerName) q.set("cliente", params.customerName);
  if (params.imageUrl) q.set("img", params.imageUrl);
  return `${origin}/pagar-boleto?${q.toString()}`;
}

// Divide o total em parcelas. Se firstAmount for informado, a 1ª parcela usa esse
// valor e o restante é dividido igualmente entre as demais.
export function splitInstallments(
  total: number,
  installments: number,
  firstAmount?: number,
) {
  if (!installments || installments < 1) {
    return { first: total, rest: 0, restCount: 0, equal: true };
  }
  if (!firstAmount || installments === 1 || firstAmount <= 0) {
    const each = total / installments;
    return { first: each, rest: each, restCount: installments - 1, equal: true };
  }
  const restTotal = Math.max(total - firstAmount, 0);
  const rest = installments > 1 ? restTotal / (installments - 1) : 0;
  return { first: firstAmount, rest, restCount: installments - 1, equal: false };
}
