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
}): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://voeair.com";
  const q = new URLSearchParams();
  q.set("desc", params.description);
  q.set("total", params.total.toFixed(2));
  q.set("parcelas", String(params.installments));
  if (params.orderRef) q.set("ref", params.orderRef);
  if (params.customerName) q.set("cliente", params.customerName);
  return `${origin}/pagar?${q.toString()}`;
}
