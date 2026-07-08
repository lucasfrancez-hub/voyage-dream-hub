// Link do cofre / checkout Bitrix (cartão de crédito).
// Substitua pelo link exato do formulário do Bitrix quando estiver pronto.
export const BITRIX_CHECKOUT_URL = "https://viaair.bitrix24.site";

// WhatsApp da agência (usado nos CTAs de Pix e contato).
export const WHATSAPP_PHONE = "5544999514838";

export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

// E-mail que recebe notificações de novos pedidos.
export const NOTIFICATION_EMAIL = "comercial@voeair.com";
