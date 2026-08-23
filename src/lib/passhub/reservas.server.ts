/**
 * Reservas da agência na PassHub. SERVER-ONLY.
 *
 * Contrato do painel: GET {gerencia}/api/v1/reservas → todas as reservas da
 * agência (inclusive as criadas direto no site da PassHub).
 */
import { passhubRequest } from "./client.server";
import type { PassHubReservaLista, PassHubReservaPax } from "./types";

const GERENCIA = "https://emissor-gerencia.passhub.com.br";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : v == null ? fb : String(v));
const num = (v: unknown, fb = 0): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fb;
};

function normalizaSegmento(v: unknown) {
  const s = rec(v);
  return {
    origem: str(s["origem"]),
    destino: str(s["destino"]),
    partida: str(s["data_partida"]),
    chegada: str(s["data_chegada"]),
    duracao: str(s["duracao"]),
    bagagemMao: s["bagagem_mao"] === true,
    bagagemDespachada: s["bagagem_despachada"] === true,
    bagagemDespachadaQtd: num(s["bagagem_despachada_quantidade"]),
    conexoes: arr(s["conexoes"]).map((c) => {
      const x = rec(c);
      return {
        origem: str(x["origem"]),
        destino: str(x["destino"]),
        partida: str(x["data_partida"]),
        chegada: str(x["data_chegada"]),
        duracao: str(x["duracao"]),
        numeroVoo: str(x["numero_voo"]),
        familiaTarifaria: str(x["familia_tarifaria"]),
        classe: str(x["cabin_class"]),
        companhia: str(x["airline_iata_operating"]),
      };
    }),
  };
}

function normalizaReserva(v: unknown): PassHubReservaLista {
  const r = rec(v);
  const preco = num(r["preco"]);
  const comissao = num(r["valor_comissao"]);
  const rav = num(r["rav_amount_brl"]);
  const localizador = str(r["localizador"]);
  return {
    idPassagem: num(r["id_passagem"]),
    localizador,
    // Em voo nacional a consolidadora não devolve o localizador da companhia:
    // nesse caso ele é o mesmo da reserva.
    localizadorCompanhia: str(r["localizador_companhia"]) || localizador,
    status: str(r["status_emissao"]),
    statusDescricao: str(r["descricao_status_emissao"]),
    origem: str(r["origem"]),
    destino: str(r["destino"]),
    dataIda: str(r["data_ida"]),
    dataVolta: str(r["data_volta"]),
    criadaEm: str(r["data_criacao_reserva"]),
    limiteEmissao: str(r["data_limite_emissao"]),
    emitidaEm: str(r["data_emissao"]),
    preco,
    precoSemTaxa: num(r["preco_sem_taxa"]),
    taxas: num(r["tax"]),
    ravPercentual: num(r["rav_percentage"]),
    ravValor: rav,
    comissao,
    comissaoExtra: 0,
    comissaoExtraObs: "",
    // A PassHub devolve `preco` líquido (tarifa + taxas). O total da venda
    // inclui a comissão total (RAV + incentivo).
    totalVenda: preco + (comissao || rav),
    companhia: str(r["companhia_aerea_iata"] ?? r["companhia_aerea"]),
    provedor: str(r["provider"]),
    emissor: str(r["nome_usuario"]),
    whatsapp: str(r["numero_whatsapp"]),
    linkPagamento: str(r["link_pagamento"]),
    multitrecho: r["is_multitrecho"] === true,
    passageiros: arr(r["nomes_passageiros"] ?? r["passageiros"] ?? r["paxs"])
      .map((p) => {
        if (p && typeof p === "object") {
          const o = p as Record<string, unknown>;
          return `${str(o["nome"])} ${str(o["sobrenome"])}`.trim() || str(o["nome_completo"]);
        }
        return str(p);
      })
      .filter(Boolean),
    passageirosDetalhe: [],
    segmentos: arr(r["segmentos"]).map(normalizaSegmento),
  };
}

/** Dados completos dos passageiros que gravamos no momento da reserva. */
async function anexaPassageiros(reservas: PassHubReservaLista[]): Promise<PassHubReservaLista[]> {
  const locs = reservas.map((r) => r.localizador).filter(Boolean);
  if (locs.length === 0) return reservas;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("passhub_reserva_pax")
      .select("localizador, ordem, nome, sobrenome, documento_tipo, documento, nascimento, genero, tipo, telefone")
      .in("localizador", locs)
      .order("ordem", { ascending: true });
    const porLoc = new Map<string, PassHubReservaLista["passageirosDetalhe"]>();
    for (const row of data ?? []) {
      const lista = porLoc.get(row.localizador) ?? [];
      lista.push({
        nome: `${row.nome ?? ""} ${row.sobrenome ?? ""}`.trim().toUpperCase(),
        documentoTipo: row.documento_tipo ?? "cpf",
        documento: row.documento ?? "",
        nascimento: row.nascimento ?? "",
        genero: row.genero ?? "",
        tipo: row.tipo ?? "",
        telefone: row.telefone ?? "",
      });
      porLoc.set(row.localizador, lista);
    }
    for (const r of reservas) {
      r.passageirosDetalhe = porLoc.get(r.localizador) ?? [];
      if (r.passageiros.length === 0 && r.passageirosDetalhe.length) {
        r.passageiros = r.passageirosDetalhe.map((p) => p.nome);
      }
    }
  } catch (e) {
    console.error("[passhub] passageiros locais indisponíveis:", e);
  }
  await marcaCanceladasLocais(reservas);
  await anexaComissaoExtra(reservas);
  return reservas;
}

/** Comissão extra (RAV por fora) que definimos por reserva. */
async function anexaComissaoExtra(reservas: PassHubReservaLista[]): Promise<void> {
  const ids = reservas.map((r) => r.idPassagem).filter(Boolean);
  if (ids.length === 0) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("passhub_reserva_extra")
      .select("id_passagem, comissao_extra, observacao")
      .in("id_passagem", ids);
    const porId = new Map((data ?? []).map((e) => [Number(e.id_passagem), e]));
    for (const r of reservas) {
      const extra = porId.get(r.idPassagem);
      if (!extra) continue;
      r.comissaoExtra = Number(extra.comissao_extra ?? 0);
      r.comissaoExtraObs = extra.observacao ?? "";
      r.totalVenda = Number((r.totalVenda + r.comissaoExtra).toFixed(2));
    }
  } catch (e) {
    console.error("[passhub] comissão extra indisponível:", e);
  }
}

/** Reservas que cancelamos por aqui aparecem como canceladas mesmo que a PassHub demore a refletir. */
async function marcaCanceladasLocais(reservas: PassHubReservaLista[]): Promise<void> {
  const locs = reservas.map((r) => r.localizador).filter(Boolean);
  if (locs.length === 0) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("passhub_reserva_cancelada")
      .select("localizador, motivo")
      .in("localizador", locs);
    const canceladas = new Map((data ?? []).map((c) => [c.localizador, c.motivo ?? ""]));
    for (const r of reservas) {
      const motivo = canceladas.get(r.localizador);
      if (motivo === undefined) continue;
      r.status = "CANCELED";
      r.statusDescricao = motivo || "Cancelada pela agência";
    }
  } catch (e) {
    console.error("[passhub] cancelamentos locais indisponíveis:", e);
  }
}


/** Todas as reservas da agência na PassHub, mais recentes primeiro. */
export async function passhubListarReservas(): Promise<PassHubReservaLista[]> {
  const bruto = await passhubRequest<unknown>(`${GERENCIA}/api/v1/reservas`, { method: "GET" });
  const dados = rec(rec(bruto)["data"]);
  const lista = arr(dados["reservas"] ?? rec(bruto)["reservas"]);
  return anexaPassageiros(
    lista
      .map(normalizaReserva)
      .sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : a.criadaEm > b.criadaEm ? -1 : 0)),
  );
}


/** Detalhe de uma reserva específica (mesmo contrato do painel). */
export async function passhubReservaDetalhe(id: number): Promise<PassHubReservaLista | null> {
  const bruto = await passhubRequest<unknown>(`${GERENCIA}/api/v1/reservas/${id}`, {
    method: "GET",
  });
  const dados = rec(bruto)["data"];
  if (!dados || typeof dados !== "object") return null;
  const [reserva] = await anexaPassageiros([normalizaReserva(dados)]);
  return reserva ?? null;

}

/**
 * Link de pagamento da reserva. A PassHub gera o link do checkout logo após a
 * reserva, então aqui consultamos (com algumas tentativas) até ele aparecer.
 */
export async function passhubLinkPagamentoReserva(alvo: {
  id?: number;
  localizador?: string;
}): Promise<{ link: string; reserva: PassHubReservaLista | null }> {
  const localizador = (alvo.localizador ?? "").trim().toUpperCase();

  const buscar = async (): Promise<PassHubReservaLista | null> => {
    if (alvo.id) {
      const r = await passhubReservaDetalhe(alvo.id);
      if (r) return r;
    }
    if (!localizador) return null;
    const lista = await passhubListarReservas();
    return lista.find((r) => r.localizador.toUpperCase() === localizador) ?? null;
  };

  let reserva: PassHubReservaLista | null = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    reserva = await buscar();
    if (reserva?.linkPagamento) return { link: reserva.linkPagamento, reserva };
    if (tentativa < 2) await new Promise((r) => setTimeout(r, 2000));
  }
  return { link: "", reserva };
}

/* ------------------------------ cancelamento ------------------------------ */

/**
 * Cancelamento de reserva.
 *
 * A PassHub não expõe rota de cancelamento: as variantes /cancelar, /cancel e
 * DELETE não existem (404/405). A única rota de atualização é
 * `PATCH /api/v1/reservas/{localizador}` — e ela aceita apenas campos
 * descritivos: gravar `status_emissao` estoura um erro interno deles
 * ("tbe_agencia"). Então fazemos o possível: anotamos o cancelamento na
 * reserva pelo campo de descrição, registramos localmente (a reserva some da
 * operação) e deixamos a PassHub expirar o bilhete na data-limite de emissão.
 */
export async function passhubCancelarReserva(
  id: number,
  motivo?: string,
): Promise<{ ok: boolean; rota?: string; mensagem: string; reserva: PassHubReservaLista | null }> {
  const razao = (motivo ?? "").trim() || "Cancelamento solicitado pela agência";
  const reservaAtual = await passhubReservaDetalhe(id).catch(() => null);
  const localizador = reservaAtual?.localizador ?? "";

  const tentativas: string[] = [];
  let remotoOk = false;

  if (localizador) {
    // 1) tentativa "oficial": mudar o status (hoje falha por bug da PassHub)
    for (const body of [
      { status_emissao: "CANCELED", descricao_status_emissao: `CANCELADA — ${razao}` },
      { descricao_status_emissao: `CANCELADA — ${razao}` },
    ]) {
      try {
        await passhubRequest<unknown>(`${GERENCIA}/api/v1/reservas/${localizador}`, {
          method: "PATCH",
          body,
        });
        remotoOk = true;
        break;
      } catch (e) {
        tentativas.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  // 2) registro local: é o que garante que a reserva saia da operação
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("passhub_reserva_cancelada").upsert(
      {
        localizador: localizador || String(id),
        id_passagem: id,
        motivo: razao,
        remoto_ok: remotoOk,
        detalhe: tentativas.join(" | ").slice(0, 1000) || null,
      },
      { onConflict: "localizador" },
    );
  } catch (e) {
    return {
      ok: false,
      mensagem: `Não foi possível registrar o cancelamento: ${
        e instanceof Error ? e.message : String(e)
      }`,
      reserva: reservaAtual,
    };
  }

  const reserva = reservaAtual
    ? { ...reservaAtual, status: "CANCELED", statusDescricao: razao }
    : null;

  return {
    ok: true,
    rota: localizador ? `PATCH /api/v1/reservas/${localizador}` : undefined,
    mensagem: remotoOk
      ? "Reserva cancelada e marcada como cancelada na consolidadora."
      : "Reserva cancelada aqui no sistema. A PassHub não aceita cancelamento por API — o bilhete não será emitido e expira sozinho na data-limite de emissão.",
    reserva,
  };

}

/** Define a comissão extra (RAV por fora) de uma reserva. */
export async function passhubSalvarComissaoExtra(input: {
  idPassagem: number;
  localizador?: string | null;
  comissaoExtra: number;
  observacao?: string | null;
  userId?: string | null;
}): Promise<{ comissaoExtra: number; observacao: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const valor = Number(Number(input.comissaoExtra || 0).toFixed(2));
  const { data, error } = await supabaseAdmin
    .from("passhub_reserva_extra")
    .upsert(
      {
        id_passagem: input.idPassagem,
        localizador: input.localizador ?? null,
        comissao_extra: valor,
        observacao: input.observacao ?? null,
        updated_by: input.userId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id_passagem" },
    )
    .select("comissao_extra, observacao")
    .single();
  if (error) throw new Error(`Falha ao salvar a comissão extra: ${error.message}`);
  return {
    comissaoExtra: Number(data?.comissao_extra ?? valor),
    observacao: data?.observacao ?? "",
  };
}

/** Grava os dados completos dos passageiros de uma reserva (substitui os atuais). */
export async function passhubSalvarPassageirosReserva(
  localizador: string,
  passageiros: Array<{
    nome: string;
    documentoTipo: string;
    documento?: string;
    nascimento?: string | null;
    tipo?: string;
  }>,
): Promise<PassHubReservaPax[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("passhub_reserva_pax").delete().eq("localizador", localizador);
  if (passageiros.length === 0) return [];
  const linhas = passageiros.map((p, i) => {
    const partes = p.nome.trim().toUpperCase().split(/\s+/);
    return {
      localizador,
      ordem: i,
      nome: partes.slice(0, -1).join(" ") || partes[0] || "",
      sobrenome: partes.length > 1 ? partes[partes.length - 1] : "",
      documento_tipo: p.documentoTipo === "passport" ? "passport" : "cpf",
      documento:
        p.documentoTipo === "passport"
          ? (p.documento ?? "").trim().toUpperCase()
          : (p.documento ?? "").replace(/\D/g, ""),
      nascimento: p.nascimento || null,
      tipo: p.tipo || "ADT",
    };
  });
  const { error } = await supabaseAdmin.from("passhub_reserva_pax").insert(linhas);
  if (error) throw new Error(`Falha ao salvar passageiros: ${error.message}`);
  return linhas.map((l) => ({
    nome: `${l.nome} ${l.sobrenome}`.trim(),
    documentoTipo: l.documento_tipo,
    documento: l.documento,
    nascimento: l.nascimento ?? "",
    genero: "",
    tipo: l.tipo,
    telefone: "",
  }));
}
