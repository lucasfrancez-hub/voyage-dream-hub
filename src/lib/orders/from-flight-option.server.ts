/**
 * PEDIDO a partir da OPÇÃO AÉREA escolhida no WhatsApp.
 *
 * Quando o cliente diz "quero a opção 1" e prefere seguir pelo atendimento
 * (em vez de finalizar sozinho pelo link), Bruno/Paula coletam nome completo,
 * CPF e data de nascimento de CADA passageiro e chamam a tool `reservar_opcao`.
 * Aqui o pedido nasce direto na aba /admin/pedidos, já com itens de voo,
 * financeiro e passageiros — antes de a conversa ir pro atendimento humano.
 *
 * SERVER-ONLY.
 */
import type { FlightQuoteOption, FlightQuoteResult } from "@/lib/whatsapp/flight-quote.server";
import type { NormalizedOption, NormalizedQuote } from "@/lib/quotes/types";

export type PassageiroPedido = {
  nome_completo: string;
  cpf: string;
  /** DD/MM/AAAA ou AAAA-MM-DD */
  data_nascimento: string;
  tipo?: "adulto" | "crianca" | "bebe" | null;
};

export type PassageiroValidado = {
  nome_completo: string;
  cpf: string;
  birth_date: string;
  tipo: "adult" | "child" | "infant";
};

export type CriarPedidoResultado =
  | { ok: true; orderId: string; orderNumber: string | null; total: number; passageiros: PassageiroValidado[] }
  | { ok: false; erro: string; detalhe?: string };

const digits = (s: string): string => String(s ?? "").replace(/\D/g, "");

/** Aceita DD/MM/AAAA, DD-MM-AAAA e AAAA-MM-DD. Retorna AAAA-MM-DD ou null. */
export function normalizarDataNascimento(v: string): string | null {
  const t = String(v ?? "").trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!br) return null;
  const dia = br[1]!.padStart(2, "0");
  const mes = br[2]!.padStart(2, "0");
  const ano = br[3]!;
  if (Number(mes) < 1 || Number(mes) > 12 || Number(dia) < 1 || Number(dia) > 31) return null;
  const d = new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > Date.now()) return null;
  return `${ano}-${mes}-${dia}`;
}

/** Validação de CPF (dígitos verificadores) — evita pedido nascendo com CPF errado. */
export function cpfValido(v: string): boolean {
  const c = digits(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (base: number) => {
    let soma = 0;
    for (let i = 0; i < base; i++) soma += Number(c[i]) * (base + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

function idadeEm(birth: string, ref: string | null): number {
  const nasc = new Date(`${birth}T12:00:00Z`).getTime();
  const base = ref ? new Date(`${String(ref).slice(0, 10)}T12:00:00Z`).getTime() : Date.now();
  if (Number.isNaN(nasc) || Number.isNaN(base)) return 30;
  return Math.floor((base - nasc) / (365.25 * 24 * 3600 * 1000));
}

/**
 * Valida a lista de passageiros. Devolve `faltando` com o que pedir ao cliente
 * em vez de criar pedido pela metade.
 */
export function validarPassageiros(
  lista: PassageiroPedido[],
  dataIda: string | null,
): { ok: true; passageiros: PassageiroValidado[] } | { ok: false; problemas: string[] } {
  const problemas: string[] = [];
  const validados: PassageiroValidado[] = [];

  if (!lista.length) return { ok: false, problemas: ["nenhum passageiro informado"] };

  lista.forEach((p, i) => {
    const rotulo = lista.length > 1 ? `passageiro ${i + 1}` : "passageiro";
    const nome = String(p.nome_completo ?? "").trim().replace(/\s+/g, " ");
    if (nome.split(" ").filter((x) => x.length > 1).length < 2) {
      problemas.push(`nome completo do ${rotulo} (nome e sobrenome, como está no documento)`);
    }
    if (!cpfValido(p.cpf)) problemas.push(`CPF válido do ${rotulo}`);
    const nasc = normalizarDataNascimento(p.data_nascimento);
    if (!nasc) problemas.push(`data de nascimento do ${rotulo} (DD/MM/AAAA)`);

    if (nome && cpfValido(p.cpf) && nasc) {
      const anos = idadeEm(nasc, dataIda);
      const tipo: PassageiroValidado["tipo"] =
        p.tipo === "bebe" || anos < 2 ? "infant" : p.tipo === "crianca" || anos < 12 ? "child" : "adult";
      validados.push({ nome_completo: nome, cpf: digits(p.cpf), birth_date: nasc, tipo });
    }
  });

  const cpfs = validados.map((v) => v.cpf);
  if (new Set(cpfs).size !== cpfs.length) problemas.push("os CPFs estão repetidos — confirme o de cada passageiro");

  if (problemas.length) return { ok: false, problemas };
  return { ok: true, passageiros: validados };
}

/**
 * Cria o pedido na aba /admin/pedidos a partir da opção escolhida.
 * Idempotente: se a mesma cotação/opção já virou pedido, devolve o existente.
 */
export async function criarPedidoDaOpcaoAerea(params: {
  conversationId: string;
  waPhone?: string | null;
  clienteNome?: string | null;
  quoteId: string;
  optionIndex: number;
  passageiros: PassageiroPedido[];
}): Promise<CriarPedidoResultado> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: quoteRow } = await supabaseAdmin
    .from("wa_flight_quotes")
    .select("id, payload, agent_name, conversation_id")
    .eq("id", params.quoteId)
    .maybeSingle();
  if (!quoteRow) return { ok: false, erro: "cotacao_nao_encontrada" };

  const payload = ((quoteRow as { payload?: unknown }).payload ?? {}) as Partial<FlightQuoteResult>;
  const opcoes = (payload.opcoes ?? []) as FlightQuoteOption[];
  const opcao =
    opcoes.find((o) => (o.opcao ?? 0) === params.optionIndex) ?? opcoes[params.optionIndex - 1] ?? null;
  if (!opcao) return { ok: false, erro: "opcao_nao_encontrada" };

  const validacao = validarPassageiros(params.passageiros, payload.data_ida ?? null);
  if (!validacao.ok) return { ok: false, erro: "dados_incompletos", detalhe: validacao.problemas.join("; ") };
  const passageiros = validacao.passageiros;

  const total = Number(opcao.total ?? 0);

  // Linha do orçamento na esteira interna (/admin/orcamentos) — dela sai o
  // snapshot normalizado que vira itens de voo + financeiro do pedido.
  const fingerprint = `wa_flight_quote:${params.quoteId}`;
  const { data: orcamento } = await supabaseAdmin
    .from("quotes")
    .select("id, normalized, converted_order_id, client_name, client_phone, consultant")
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  const jaConvertido = (orcamento as { converted_order_id?: string | null } | null)?.converted_order_id ?? null;
  if (jaConvertido) {
    const { data: existente } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, total_price")
      .eq("id", jaConvertido)
      .maybeSingle();
    if (existente) {
      return {
        ok: true,
        orderId: existente.id as string,
        orderNumber: (existente.order_number as string | null) ?? null,
        total: Number(existente.total_price ?? total),
        passageiros,
      };
    }
  }

  const normalized = ((orcamento as { normalized?: unknown } | null)?.normalized ?? null) as NormalizedQuote | null;
  const opcaoNormalizada: NormalizedOption | null =
    normalized?.options?.find((o) => o.optionNumber === params.optionIndex) ??
    normalized?.options?.[params.optionIndex - 1] ??
    null;

  const titular = passageiros[0]!;
  const adultos = passageiros.filter((p) => p.tipo === "adult").length || 1;
  const criancas = passageiros.filter((p) => p.tipo !== "adult").length;

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      full_name: titular.nome_completo,
      cpf: titular.cpf,
      birth_date: titular.birth_date,
      phone: params.waPhone ?? null,
      email: null,
      adults: adultos,
      children: criancas,
      total_price: total,
      status: "pending",
      payment_method: "pix",
      package_snapshot: ((opcaoNormalizada ?? opcao) ?? {}) as never,
      notes: `Pedido gerado pelo atendimento (${(quoteRow as { agent_name?: string | null }).agent_name ?? "setor aéreo"}) a partir da opção ${params.optionIndex} da cotação.`,
    })
    .select("id, order_number")
    .single();
  if (error || !order) return { ok: false, erro: "falha_ao_criar_pedido", detalhe: error?.message };

  if (opcaoNormalizada) {
    try {
      const { materializeOrderFromNormalizedOption } = await import("./materialize-from-quote.server");
      await materializeOrderFromNormalizedOption(order.id as string, opcaoNormalizada, {
        supplierName: "Comprar Viagem",
        total,
      });
    } catch (e) {
      console.error("[pedido-aereo] falha ao materializar itens:", e);
    }
  }

  const { error: paxError } = await supabaseAdmin.from("order_passengers").insert(
    passageiros.map((p, i) => ({
      order_id: order.id as string,
      full_name: p.nome_completo,
      cpf: p.cpf,
      birth_date: p.birth_date,
      doc_type: "cpf",
      passenger_type: p.tipo,
      whatsapp: i === 0 ? (params.waPhone ?? null) : null,
      sort_order: i,
    })) as never,
  );
  if (paxError) console.error("[pedido-aereo] falha ao salvar passageiros:", paxError.message);

  if (orcamento?.id) {
    await supabaseAdmin
      .from("quotes")
      .update({
        status: "CONVERTED",
        converted_order_id: order.id as string,
        converted_option_number: params.optionIndex,
        client_name: (orcamento as { client_name?: string | null }).client_name ?? titular.nome_completo,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", orcamento.id as string);
  }

  await supabaseAdmin
    .from("wa_flight_quotes")
    .update({ escolha_option_index: params.optionIndex, escolha_at: new Date().toISOString() })
    .eq("id", params.quoteId);

  return {
    ok: true,
    orderId: order.id as string,
    orderNumber: (order.order_number as string | null) ?? null,
    total,
    passageiros,
  };
}
