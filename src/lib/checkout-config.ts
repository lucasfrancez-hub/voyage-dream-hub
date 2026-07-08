// Link do cofre / checkout Bitrix (cartão de crédito).
// Substitua pelo link exato do formulário do Bitrix quando estiver pronto.
export const BITRIX_CHECKOUT_URL = "https://viaair.bitrix24.site";

// WhatsApp da agência (usado nos CTAs de Pix e contato).
export const WHATSAPP_PHONE = "5544999514838";

export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

// URL final do cofre com dados do pedido para o time comercial.
export function bitrixCheckoutUrl(params: {
  installments: number;
  total: number;
  orderId?: string;
  packageTitle?: string;
}): string {
  const q = new URLSearchParams();
  q.set("parcelas", String(params.installments));
  q.set("total", params.total.toFixed(2));
  if (params.orderId) q.set("pedido", params.orderId);
  if (params.packageTitle) q.set("pacote", params.packageTitle);
  return `${BITRIX_CHECKOUT_URL}?${q.toString()}`;
}

// Mensagem padrão para solicitar orçamento com outra quantidade de viajantes.
export function customQuoteWhatsappUrl(pkgTitle: string): string {
  return whatsappUrl(
    `Olá! Tenho interesse no pacote *${pkgTitle}* mas para uma quantidade diferente de viajantes. Pode me ajudar com um orçamento personalizado?`,
  );
}

// E-mail que recebe notificações de novos pedidos.
export const NOTIFICATION_EMAIL = "comercial@voeair.com";
