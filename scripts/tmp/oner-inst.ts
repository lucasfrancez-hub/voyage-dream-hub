import { onerFetch } from "../../src/lib/integrations/oner/client.server";
import { ONER_API } from "../../src/lib/integrations/oner/config";
import { tokenAtual } from "../../src/lib/integrations/oner/session.server";
import { guardarCartaoNoCofre } from "../../src/lib/integrations/oner/payment.server";

const cartId = process.env["CART_ID"]!;
const token = (await tokenAtual())!;
const cofre = await guardarCartaoNoCofre({
  nome: process.env["C_NOME"]!,
  numero: process.env["C_NUM"]!,
  cvv: process.env["C_CVV"]!,
  mesValidade: process.env["C_MES"]!,
  anoValidade: process.env["C_ANO"]!,
});
const c = cofre.cofre!;
console.log("cofre", c.Brand, c.CardBin, c.LastDigts);
const total = 374.05;
const corpos: Record<string, unknown>[] = [
  { totalValue: total, paymentMethodId: 1, isMultiplePayment: false, vaultToken: c.Token, vaultKey: c.Key },
  { total, paymentMethodId: 1, isMultiplePayment: false, vaultToken: c.Token, vaultKey: c.Key, bin: c.CardBin, brand: c.Brand },
  { totalValue: total, paymentMethodId: 1, isMultiplePayment: false, bin: c.CardBin, brand: c.Brand, cardBin: c.CardBin },
];
for (const body of corpos) {
  const r = await onerFetch(`${ONER_API}/api/booking/installments/${cartId}`, { token, method: "POST", body });
  console.log("POST", r.call.status, JSON.stringify(body).slice(0, 120), "->", r.raw.slice(0, 300));
}
for (const u of [
  `/api/booking/installments/${cartId}?total=${total}&paymentMethodId=1`,
  `/api/checkout/v1/installments/${cartId}?total=${total}&paymentMethodId=1`,
  `/api/booking/installments/${cartId}/${total}/1`,
]) {
  const r = await onerFetch(`${ONER_API}${u}`, { token });
  console.log("GET", r.call.status, u, r.raw.slice(0, 300));
}
