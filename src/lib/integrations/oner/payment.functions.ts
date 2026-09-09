/**
 * Funções chamadas pela tela de pagamento (admin e link de pagamento).
 *
 * O identificador do carrinho é a única credencial da tela — igual ao modelo do
 * próprio fornecedor —, por isso estas funções não exigem login do cliente.
 * Nada de PAN/CVV é gravado, registrado em log ou devolvido ao navegador:
 * os dados do cartão seguem direto para o cofre da operadora.
 */
import { createServerFn } from "@tanstack/react-start";
import type { CartaoParaPagamento } from "./payment.server";

export type EntradaCartaoSensivel = {
  nome: string;
  numero: string;
  cvv: string;
  mesValidade: string;
  anoValidade: string;
  documentoTipo: number;
  documentoNumero: string;
};

export type CartaoParaEnvio = EntradaCartaoSensivel & {
  valor: number;
  parcelas: number;
  juros: number;
};

function mensagemAmigavel(status: number, texto?: string | null): string {
  if (status === 0) return "Não foi possível falar com a operadora agora. Tente novamente.";
  if (status === 401 || status === 403) return "Sessão de pagamento expirada. Recarregue a página.";
  if (status === 409 || (texto ?? "").includes("Expired")) {
    return "Esta reserva expirou. Refaça a busca para continuar.";
  }
  if (status >= 500) return "A operadora está instável neste momento. Tente novamente em instantes.";
  return "Não foi possível concluir o pagamento. Confira os dados e tente novamente.";
}

/** Resumo da compra + formas de pagamento reais liberadas para este carrinho. */
export const onerCheckoutResumo = createServerFn({ method: "POST" })
  .inputValidator((d: { cartId: string }) => d)
  .handler(async ({ data }) => {
    const { obterToken } = await import("./session.server");
    const { lerCarrinho } = await import("./checkout.server");
    const { consultarFormasPagamento } = await import("./payment.server");

    const token = await obterToken({});
    if (!token) return { ok: false as const, erro: "Não foi possível abrir o pagamento agora." };

    const carrinho = await lerCarrinho(data.cartId, token);
    if (!carrinho.resumo) {
      return { ok: false as const, erro: mensagemAmigavel(carrinho.call.status, carrinho.call.message) };
    }
    const { formas } = await consultarFormasPagamento(token, data.cartId);
    const cartao = formas.find((f) => f.paymentMethodId === 1);
    const pix = formas.find((f) => f.paymentMethodId === 4);

    return {
      ok: true as const,
      resumo: carrinho.resumo,
      aceitaCartao: Boolean(cartao),
      maxCartoes: cartao?.multipleQuantityUsage ?? 0,
      aceitaPix: Boolean(pix),
    };
  });

/** Parcelas reais de UM cartão — só depois que o cartão foi para o cofre. */
export const onerParcelasCartao = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { cartId: string; valor: number; multiplosCartoes: boolean; cartao: EntradaCartaoSensivel }) => d,
  )
  .handler(async ({ data }) => {
    const { obterToken } = await import("./session.server");
    const { guardarCartaoNoCofre, consultarParcelasDoCartao } = await import("./payment.server");

    if (!(data.valor > 0)) return { ok: false as const, erro: "Informe o valor deste cartão." };

    const token = await obterToken({});
    if (!token) return { ok: false as const, erro: "Sessão de pagamento indisponível." };

    const cofre = await guardarCartaoNoCofre(data.cartao);
    if (!cofre.ok || !cofre.cofre) {
      return { ok: false as const, erro: "Não foi possível validar este cartão." };
    }

    const r = await consultarParcelasDoCartao(token, data.cartId, {
      totalValue: Number(data.valor.toFixed(2)),
      vaultToken: cofre.cofre.Token,
      vaultKey: cofre.cofre.Key,
      multiplosCartoes: data.multiplosCartoes,
    });
    if (!r.call.ok || r.opcoes.length === 0) {
      return { ok: false as const, erro: "Não foi possível carregar o parcelamento para este cartão." };
    }
    return {
      ok: true as const,
      bandeira: cofre.cofre.Brand,
      finalCartao: cofre.cofre.LastDigts,
      opcoes: r.opcoes,
    };
  });

/** Pagamento com 1, 2 ou 3 cartões. */
export const onerPagarCartao = createServerFn({ method: "POST" })
  .inputValidator((d: { cartId: string; cartoes: CartaoParaEnvio[]; totalEsperado: number }) => d)
  .handler(async ({ data }) => {
    const { obterToken } = await import("./session.server");
    const { guardarCartaoNoCofre, pagarComCartoes } = await import("./payment.server");

    if (data.cartoes.length < 1 || data.cartoes.length > 3) {
      return { ok: false as const, erro: "Escolha de 1 a 3 cartões." };
    }
    const soma = Number(data.cartoes.reduce((s, c) => s + (c.valor || 0), 0).toFixed(2));
    if (soma !== Number(data.totalEsperado.toFixed(2))) {
      return { ok: false as const, erro: "A soma dos cartões precisa ser igual ao total da compra." };
    }
    if (data.cartoes.some((c) => !c.parcelas)) {
      return { ok: false as const, erro: "Escolha o parcelamento de cada cartão." };
    }

    const token = await obterToken({});
    if (!token) return { ok: false as const, erro: "Sessão de pagamento indisponível." };

    const prontos: CartaoParaPagamento[] = [];
    for (const c of data.cartoes) {
      const cofre = await guardarCartaoNoCofre(c);
      if (!cofre.ok || !cofre.cofre) {
        return { ok: false as const, erro: `Não foi possível validar o cartão ${prontos.length + 1}.` };
      }
      const mes = Number(String(c.mesValidade).replace(/\D/g, ""));
      const anoBruto = String(c.anoValidade).replace(/\D/g, "");
      const ano = Number(anoBruto.length === 2 ? `20${anoBruto}` : anoBruto);
      prontos.push({
        installments: c.parcelas,
        value: Number(c.valor.toFixed(2)),
        interestRate: c.juros ?? 0,
        creditCard: {
          vaultToken: cofre.cofre.Token,
          vaultKey: cofre.cofre.Key,
          brand: cofre.cofre.Brand,
          bin: cofre.cofre.CardBin,
          lastNumbers: cofre.cofre.LastDigts,
          name: c.nome,
          documentTypeId: c.documentoTipo || 1,
          documentNumber: c.documentoNumero,
          expirationMonth: mes,
          expirationYear: ano,
        },
      });
    }

    const r = await pagarComCartoes(token, {
      cartId: data.cartId,
      cartoes: prontos,
      purchaseForCustomer: true,
    });

    if (!r.call.ok || !r.compra) {
      return { ok: false as const, erro: mensagemAmigavel(r.call.status, r.call.message) };
    }
    if (r.compra.cartExpired) return { ok: false as const, erro: "Esta reserva expirou." };
    if (r.compra.wasChanged) {
      return { ok: false as const, erro: "O valor da passagem mudou. Refaça a busca para continuar." };
    }
    if (r.compra.paymentError || !r.compra.reservationCode) {
      return { ok: false as const, erro: "Pagamento não autorizado pelo banco emissor." };
    }
    return { ok: true as const, localizador: r.compra.reservationCode };
  });

/** Pix do fornecedor (uso interno/operacional — não é o QR mostrado ao cliente). */
export const onerPagarPix = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { cartId: string; valor: number; documentoNumero: string; documentoTipo?: number }) => d,
  )
  .handler(async ({ data }) => {
    const { obterToken } = await import("./session.server");
    const { solicitarPixOner, aguardarQrCodePixOner } = await import("./payment.server");

    const token = await obterToken({});
    if (!token) return { ok: false as const, erro: "Sessão de pagamento indisponível." };

    const escuta = aguardarQrCodePixOner(data.cartId, 90_000);
    const envio = await solicitarPixOner(token, {
      cartId: data.cartId,
      documentNumber: data.documentoNumero,
      documentType: data.documentoTipo ?? 1,
      valor: Number(data.valor.toFixed(2)),
      purchaseForCustomer: true,
    });
    if (!envio.call.ok) {
      return { ok: false as const, erro: mensagemAmigavel(envio.call.status, envio.call.message) };
    }
    const qr = await escuta;
    if (!qr.ok || !qr.pix) return { ok: false as const, erro: "O código Pix não foi gerado a tempo." };
    return { ok: true as const, pix: qr.pix };
  });
