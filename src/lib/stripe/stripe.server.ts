/**
 * Cliente Stripe — SERVER ONLY.
 *
 * A chave secreta (STRIPE_SECRET_KEY) só existe no ambiente do servidor e
 * nunca é lida no navegador. Número do cartão e CVV jamais passam por aqui:
 * eles são digitados direto no Payment Element hospedado pela Stripe.
 */
import Stripe from "stripe";

export function stripeClient(): Stripe {
  const chave = process.env["STRIPE_SECRET_KEY"];
  if (!chave) throw new Error("STRIPE_SECRET_KEY não configurada no servidor.");
  return new Stripe(chave, {
    apiVersion: "2025-08-27.basil",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/** Minutos de validade de uma autenticação 3DS aprovada. */
export const VALIDADE_3DS_MINUTOS = 15;
