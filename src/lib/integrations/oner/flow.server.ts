/**
 * Fluxo padrão da Comprar Viagem / Oner — sempre na mesma ordem.
 *
 * A operação NUNCA pula etapa: a tela de pagamento só é aberta depois do
 * carrinho lido, da sessão autenticada (código por e-mail) e dos passageiros
 * gravados no fornecedor. Isso evita carrinho expirado, passageiro faltando e
 * pagamento em cima de reserva inválida.
 *
 * Ordem fixa:
 *   1. carrinho gerado no nosso motor de busca ("Comprar agora")
 *   2. sessão da conta operacional (login + código do e-mail)
 *   3. leitura/validação do carrinho
 *   4. passageiros (primeira etapa do checkout)
 *   5. tela de pagamento (outro link, já com formas e parcelas do fornecedor)
 *
 * SERVER-ONLY.
 */
import { ONER_API, ONER_INSTITUTION_ID, ONER_SITE } from "./config";
import { arr, num, onerFetch, pick } from "./client.server";
import { registrarEvento } from "./store.server";
import { extrairCartId, enviarPassageiros, lerCarrinho, type PassageiroOner } from "./checkout.server";
import { obterToken, tokenAtual } from "./session.server";

export const ONER_CHECKOUT_BASE = "https://checkout.comprarviagem.com.br/checkout";

export type ChaveEtapa = "carrinho_link" | "sessao" | "carrinho" | "passageiros" | "pagamento";

export const ONER_FLOW_STEPS: Array<{ chave: ChaveEtapa; titulo: string }> = [
  { chave: "carrinho_link", titulo: "Carrinho do nosso portal" },
  { chave: "sessao", titulo: "Login e código do e-mail" },
  { chave: "carrinho", titulo: "Conferência do carrinho" },
  { chave: "passageiros", titulo: "Dados do passageiro" },
  { chave: "pagamento", titulo: "Tela de pagamento" },
];

export type EtapaResultado = {
  chave: ChaveEtapa;
  titulo: string;
  ok: boolean;
  detalhe: string;
  /** Dados brutos da etapa, já em texto (JSON) para viajar com segurança. */
  dados: string | null;
};

export type FormaPagamentoOner = {
  codigo: string;
  nome: string;
  maxCartoes: number | null;
};

export type TelaPagamentoOner = {
  url: string;
  formas: FormaPagamentoOner[];
  parcelas: Array<{ numero: number; valor: number | null; juros: boolean }>;
  total: number | null;
  /** Respostas cruas das sondagens, para mapeamento. */
  tentativas: Array<{ endpoint: string; status: number; ok: boolean; amostra: string }>;
};

function etapa(
  chave: ChaveEtapa,
  ok: boolean,
  detalhe: string,
  dados?: unknown,
): EtapaResultado {
  const titulo = ONER_FLOW_STEPS.find((e) => e.chave === chave)?.titulo ?? chave;
  return {
    chave,
    titulo,
    ok,
    detalhe,
    dados: dados === undefined ? null : JSON.stringify(dados, null, 2),
  };
}

export function urlPagamentoOner(cartId: string): string {
  return `${ONER_CHECKOUT_BASE}/${cartId}?institutionId=${ONER_INSTITUTION_ID}`;
}

/**
 * Lê a tela de pagamento do fornecedor: formas aceitas, quantidade de cartões
 * e parcelamento. Sonda os caminhos conhecidos e guarda o que cada um devolveu.
 */
export async function lerTelaPagamento(
  cartId: string,
  token: string,
  integrationOrderId?: string | null,
): Promise<TelaPagamentoOner> {
  const candidatos = [
    `${ONER_API}/api/checkout/v1/payment-methods/${cartId}`,
    `${ONER_API}/api/checkout/v1/booking/${cartId}/payment-methods`,
    `${ONER_API}/api/payment/v1/payment-methods?cartId=${cartId}`,
    `${ONER_API}/api/checkout/v1/booking/${cartId}`,
  ];

  const tentativas: TelaPagamentoOner["tentativas"] = [];
  const formas: FormaPagamentoOner[] = [];
  let parcelas: TelaPagamentoOner["parcelas"] = [];
  let total: number | null = null;

  for (const url of candidatos) {
    const r = await onerFetch(url, { token });
    tentativas.push({
      endpoint: url,
      status: r.call.status,
      ok: r.call.ok,
      amostra: r.raw.slice(0, 4000),
    });
    if (!r.call.ok || !r.body) continue;

    const d = (pick(r.body, "data") ?? r.body) as Record<string, unknown>;
    const resumo = (pick(d, "orderSummary") ?? {}) as Record<string, unknown>;

    for (const f of arr(pick(d, "paymentMethods") ?? pick(resumo, "paymentMethods"))) {
      const codigo = String(pick(f, "code", "id", "paymentMethodId", "type") ?? "");
      if (!codigo || formas.some((x) => x.codigo === codigo)) continue;
      formas.push({
        codigo,
        nome: String(pick(f, "name", "description", "label") ?? codigo),
        maxCartoes: num(pick(f, "maxCards", "maximumCards", "cardsAllowed", "maxCreditCards")),
      });
    }

    const lista = arr(pick(resumo, "installments") ?? pick(d, "installments"));
    if (lista.length && !parcelas.length) {
      parcelas = lista
        .map((i) => ({
          numero: num(pick(i, "installmentNumber", "quantity", "number", "installments")) ?? 0,
          valor: num(pick(i, "installmentValue", "value", "amount", "installmentAmount")),
          juros: Boolean(pick(i, "hasInterest", "interest")),
        }))
        .filter((i) => i.numero > 0)
        .sort((a, b) => a.numero - b.numero);
    }

    total =
      total ??
      num(pick(d, "flight.price.totalPrice", "totalPrice", "total", "totalAmount")) ??
      num(pick(resumo, "totalPrice", "total", "totalAmount"));
  }

  await registrarEvento({
    integrationOrderId: integrationOrderId ?? null,
    eventType: "oner_payment_screen",
    message: `Tela de pagamento lida (${formas.length} formas, ${parcelas.length} opções de parcela)`,
    payload: { tentativas: tentativas.map(({ endpoint, status, ok }) => ({ endpoint, status, ok })) },
  });

  return { url: urlPagamentoOner(cartId), formas, parcelas, total, tentativas };
}

export type EntradaFluxo = {
  /** URL do carrinho gerado no nosso portal, ou o próprio identificador. */
  cartRef: string;
  /** Passageiros do pedido. Sem eles o fluxo para na etapa de passageiros. */
  passageiros?: PassageiroOner[];
  /** Tempo de espera do código do e-mail. */
  esperarCodigoMs?: number;
  integrationOrderId?: string | null;
  /** Só usar sessão já ativa (não dispara novo código). */
  semNovoLogin?: boolean;
};

export type ResultadoFluxo = {
  ok: boolean;
  cartId: string | null;
  etapas: EtapaResultado[];
  /** Preenchido só quando todas as etapas anteriores passaram. */
  pagamento: TelaPagamentoOner | null;
  /** Onde a operação parou, quando parou. */
  parouEm: ChaveEtapa | null;
};

/**
 * Executa o caminho completo, na ordem, parando na primeira etapa que falhar.
 */
export async function executarFluxoOner(entrada: EntradaFluxo): Promise<ResultadoFluxo> {
  const etapas: EtapaResultado[] = [];
  const parar = (chave: ChaveEtapa, cartId: string | null): ResultadoFluxo => ({
    ok: false,
    cartId,
    etapas,
    pagamento: null,
    parouEm: chave,
  });

  // 1 — carrinho vindo do nosso motor de busca
  const cartId = extrairCartId(entrada.cartRef);
  if (!cartId) {
    etapas.push(
      etapa(
        "carrinho_link",
        false,
        "Não encontrei o identificador do carrinho no endereço informado. Copie o endereço que abre ao clicar em Comprar agora.",
      ),
    );
    return parar("carrinho_link", null);
  }
  etapas.push(etapa("carrinho_link", true, `Carrinho ${cartId}`, { cartId, site: ONER_SITE }));

  // 2 — sessão: login com código do e-mail
  const token = entrada.semNovoLogin
    ? await tokenAtual()
    : await obterToken({
        integrationOrderId: entrada.integrationOrderId ?? null,
        ...(entrada.esperarCodigoMs === undefined ? {} : { esperarCodigoMs: entrada.esperarCodigoMs }),
      });
  if (!token) {
    etapas.push(
      etapa(
        "sessao",
        false,
        entrada.semNovoLogin
          ? "Não há sessão ativa. Peça o código de acesso para entrar."
          : "O código do e-mail não chegou a tempo.",
      ),
    );
    return parar("sessao", cartId);
  }
  etapas.push(etapa("sessao", true, "Conta operacional conectada"));

  // 3 — conferência do carrinho
  const carrinho = await lerCarrinho(cartId, token, entrada.integrationOrderId ?? undefined);
  const resumo = carrinho.resumo;
  if (!carrinho.call.ok || !resumo) {
    etapas.push(etapa("carrinho", false, `Não consegui ler o carrinho (${carrinho.call.status}).`));
    return parar("carrinho", cartId);
  }
  if (resumo.expirado === true) {
    etapas.push(etapa("carrinho", false, "Carrinho expirado — refaça a busca e gere outro."));
    return parar("carrinho", cartId);
  }
  if (!resumo.total || resumo.total <= 0) {
    etapas.push(etapa("carrinho", false, "O carrinho não trouxe valor total; não dá para seguir."));
    return parar("carrinho", cartId);
  }
  etapas.push(
    etapa("carrinho", true, `Carrinho válido — total ${resumo.total} ${resumo.moeda ?? "BRL"}`, resumo),
  );

  // 4 — passageiros (primeira etapa do checkout)
  if (entrada.passageiros?.length) {
    const envio = await enviarPassageiros(
      cartId,
      entrada.passageiros,
      token,
      entrada.integrationOrderId ?? undefined,
    );
    if (!envio.ok) {
      etapas.push(
        etapa("passageiros", false, envio.call.message ?? "O fornecedor recusou os passageiros."),
      );
      return parar("passageiros", cartId);
    }
  }

  const conferencia = await lerCarrinho(cartId, token, entrada.integrationOrderId ?? undefined);
  if (!conferencia.resumo?.passageirosPersistidos) {
    etapas.push(
      etapa(
        "passageiros",
        false,
        "Os passageiros ainda não estão gravados no fornecedor — preencha os dados antes do pagamento.",
      ),
    );
    return parar("passageiros", cartId);
  }
  etapas.push(etapa("passageiros", true, "Passageiros gravados no fornecedor"));

  // 5 — tela de pagamento
  const pagamento = await lerTelaPagamento(cartId, token, entrada.integrationOrderId ?? null);
  if (!pagamento.formas.length && !pagamento.parcelas.length) {
    etapas.push(
      etapa(
        "pagamento",
        false,
        "A tela de pagamento não devolveu formas nem parcelas. Nada é inventado aqui: confira as respostas registradas.",
        pagamento.tentativas,
      ),
    );
    return { ok: false, cartId, etapas, pagamento, parouEm: "pagamento" };
  }
  etapas.push(
    etapa(
      "pagamento",
      true,
      `${pagamento.formas.length} forma(s) de pagamento e ${pagamento.parcelas.length} opção(ões) de parcela`,
      { url: pagamento.url },
    ),
  );

  return { ok: true, cartId, etapas, pagamento, parouEm: null };
}
