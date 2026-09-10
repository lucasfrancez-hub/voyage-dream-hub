/** Teste real de pagamento (uso único, manual). Não grava PAN/CVV. */
import { lerCarrinho } from "../../src/lib/integrations/oner/checkout.server";
import { obterToken } from "../../src/lib/integrations/oner/session.server";
import {
  guardarCartaoNoCofre,
  consultarParcelasDoCartao,
  pagarComCartoes,
  consultarFormasPagamento,
  salvarPagador,
} from "../../src/lib/integrations/oner/payment.server";

const cartId = process.env["CART_ID"]!;
const token = (await obterToken({ esperarCodigoMs: 180_000 }))!;
if (!token) throw new Error("sem token");

const carrinho = await lerCarrinho(cartId, token);
const total = Number(carrinho.resumo?.total ?? 0);
console.log("total", total, "expirado", carrinho.resumo?.expirado ?? null);

const formas = await consultarFormasPagamento(token, cartId);
console.log("formas", JSON.stringify(formas.formas), "docTitular", formas.documentoTitularObrigatorio);

const pag = await salvarPagador(token, {
  cartId,
  firstName: "Lucas",
  lastName: "Rocha Francez",
  documentNumber: process.env["C_CPF"]!,
  documentTypeId: 1,
  birthDate: "1998-04-09",
  email: "lucasfrancez@gmail.com",
  mobilePhone: "44999093642",
  mobilePhoneCountryCode: 55,
  countryId: 30,
  city: "Paranavaí",
  stateOrProvice: "PR",
  street: "Rua Takeshi Mitsuaysu",
  neighborhood: "Centro",
  houseNumber: "355",
  zipCode: "87707120",
});
console.log("pagador", pag.call.status, pag.raw.slice(0, 400));

const cofre = await guardarCartaoNoCofre({
  nome: process.env["C_NOME"]!,
  numero: process.env["C_NUM"]!,
  cvv: process.env["C_CVV"]!,
  mesValidade: process.env["C_MES"]!,
  anoValidade: process.env["C_ANO"]!,
});
console.log("cofre", cofre.ok, cofre.cofre?.Brand, cofre.cofre?.LastDigts, cofre.mensagem ?? "");
if (!cofre.ok || !cofre.cofre) process.exit(1);

const parc = await consultarParcelasDoCartao(token, cartId, {
  totalValue: total,
  vaultToken: cofre.cofre.Token,
  vaultKey: cofre.cofre.Key,
  multiplosCartoes: false,
});
console.log("parcelas", parc.call.status, JSON.stringify(parc.opcoes.slice(0, 3)));
const opcao = parc.opcoes[0];
if (!opcao) process.exit(1);

const pago = await pagarComCartoes(token, {
  cartId,
  purchaseForCustomer: true,
  cartoes: [
    {
      installments: opcao.installment,
      value: total,
      interestRate: opcao.interestRate ?? 0,
      creditCard: {
        vaultToken: cofre.cofre.Token,
        vaultKey: cofre.cofre.Key,
        brand: cofre.cofre.Brand,
        bin: cofre.cofre.CardBin,
        lastNumbers: cofre.cofre.LastDigts,
        name: process.env["C_NOME"]!,
        documentTypeId: 1,
        documentNumber: process.env["C_CPF"]!,
        expirationMonth: Number(process.env["C_MES"]),
        expirationYear: Number(process.env["C_ANO"]),
      },
    },
  ],
});
console.log("pagamento", pago.call.status, pago.raw.slice(0, 1500));
