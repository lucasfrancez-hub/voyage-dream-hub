/**
 * Reserva real na operadora CompreFácil/FRT.
 *
 * Fluxo mapeado (e testado) contra a API da operadora:
 *   1. POST /api/Reserva/                        → cria o orçamento com os produtos
 *   2. PUT  /api/Reserva/consultor/{oid}/{cid}   → vincula o consultor
 *   3. POST /api/reservas/paxes/{oid}            → grava os passageiros
 *   4. GET  /api/aereo/{aereoId}/TemDuplicidade  → checa duplicidade
 *   5. POST /api/Aereo/tarifar/{aereoId}         → revalida a tarifa
 *   6. POST /api/aereo/reservar/{aereoId}        → gera o PNR (LocalizadorAereo)
 *   7. PATCH /api/hotel/politica/{oid}/{hid}    → política do hotel (corpo da reserva)
 *   8. POST /api/Hotel/reservar                  → reserva a hospedagem

 */
import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "./auth.server";
import { itemBrutoCF } from "./busca-cache.server";
import { extrairPrazoPagamento } from "./prazo.server";

/** Consultor padrão das reservas do portal (Ana Beatriz). */
export const CONSULTOR_PADRAO_FRT = 19800;
export const EMAIL_PADRAO_FRT = "lucas@voeair.com";
export const TELEFONE_PADRAO_FRT = "44999093642";

export type PaxReserva = {
  nome: string;
  sobrenome: string;
  /** ISO yyyy-mm-dd */
  nascimento?: string | null;
  sexo?: "M" | "F" | null;
  cpf?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  /** 0 = adulto, 1 = criança, 2 = bebê */
  tipo?: 0 | 1 | 2;
  /** idade pesquisada (obrigatória para criança/bebê na operadora) */
  idade?: number | null;
  quarto?: number;
};


export type EntradaReservaFRT = {
  aereo?: { token: string; indice: number } | null;
  hotel?: { token: string; indice: number; quartoIndice?: number | null } | null;
  /** distribuição usada na busca — o orçamento precisa dela para casar os quartos */
  quartos?: { adultos: number; criancas?: number; bebes?: number; idades?: number[] }[] | null;
  passageiros: PaxReserva[];
  consultorId?: number | null;
  observacao?: string | null;
};


export type PassoReserva = { passo: string; ok: boolean; detalhe?: string | null };

export type ResultadoReservaFRT = {
  ok: boolean;
  orcamentoId: number | null;
  localizadorAereo: string | null;
  localizadorHotel: string | null;
  limiteEmissao: string | null;
  /** Prazo de pagamento informado pela operadora (ISO). */
  prazoPagamento: string | null;
  passos: PassoReserva[];
};

const TIPO_DESC = ["ADT", "CHD", "INF"] as const;

/** Idade em anos completos a partir da data de nascimento (ISO yyyy-mm-dd). */
function idadePorNascimento(nascimento?: string | null): number | null {
  if (!nascimento) return null;
  const d = new Date(`${nascimento}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--;
  return anos >= 0 ? anos : null;
}

function pessoa(p: PaxReserva, seq: number) {
  const tipo = p.tipo ?? 0;
  // A operadora rejeita CHD/INF sem idade — usamos a do nascimento e caímos na idade pesquisada.
  const idade = idadePorNascimento(p.nascimento) ?? (p.idade ?? null);
  return {
    Nome: (p.nome || "").trim().toUpperCase(),
    Sobrenome: (p.sobrenome || "").trim().toUpperCase(),
    Nascimento: p.nascimento ? `${p.nascimento}T03:00:00` : null,
    Email: p.email || EMAIL_PADRAO_FRT,
    Telefone: (p.telefone || TELEFONE_PADRAO_FRT).replace(/\D/g, ""),
    Sexo: p.sexo ?? "M",
    CPF: p.cpf ?? null,
    Documento: p.documento ?? null,
    Pais: "BR",
    Quarto: p.quarto ?? 1,
    Tipo: tipo,
    TipoDesc: TIPO_DESC[tipo] ?? "ADT",
    ...(tipo === 0 ? {} : { Idade: idade ?? (tipo === 2 ? 0 : 7) }),
    Sequencia: seq,
    Erros: [],
  };
}


/** Executa o fluxo completo de reserva na operadora. */
export async function reservarNaFRT(e: EntradaReservaFRT): Promise<ResultadoReservaFRT> {
  const passos: PassoReserva[] = [];
  const registrar = (passo: string, ok: boolean, detalhe?: string | null) => {
    passos.push({ passo, ok, detalhe: detalhe ?? null });
  };

  const ses = await sessaoCompreFacil();
  const agenciaId = Number(ses.agenciaId ?? 0);
  const agenteId = Number((ses as any).agenteId ?? (ses as any).usuarioId ?? 0) || undefined;

  const aereoBruto = e.aereo ? await itemBrutoCF(e.aereo.token, "aereo", e.aereo.indice) : null;
  const hotelBrutoOriginal = e.hotel ? await itemBrutoCF(e.hotel.token, "hotel", e.hotel.indice) : null;
  if (e.aereo && !aereoBruto) registrar("Recuperar aéreo da busca", false, "Busca expirada — pesquise novamente.");
  if (e.hotel && !hotelBrutoOriginal)
    registrar("Recuperar hospedagem da busca", false, "Busca expirada — pesquise novamente.");
  if (!aereoBruto && !hotelBrutoOriginal) {
    return { ok: false, orcamentoId: null, localizadorAereo: null, localizadorHotel: null, limiteEmissao: null, prazoPagamento: null, passos };
  }

  // O hotel vai para o orçamento apenas com o quarto escolhido.
  let hotelBruto: any = null;
  if (hotelBrutoOriginal) {
    hotelBruto = JSON.parse(JSON.stringify(hotelBrutoOriginal));
    const quartos: any[] = hotelBruto?.Quartos ?? [];
    const idx = e.hotel?.quartoIndice ?? 0;
    hotelBruto.Quartos = [quartos[idx] ?? quartos[0]].filter(Boolean);
  }

  // A cia aérea exige documento em TODOS os passageiros e recusa a reserva quando
  // dois passageiros vão com o MESMO documento ("Passenger.DocumentTypeMatch.NotAllowed").
  // Nesses casos paramos antes de criar o orçamento, com mensagem clara.
  const docDe = (p: PaxReserva) => (p.cpf ?? p.documento ?? "").replace(/\D/g, "").trim();
  const semDoc = e.passageiros.filter((p) => !docDe(p));
  const contagemDoc = new Map<string, number>();
  for (const p of e.passageiros) {
    const d = docDe(p);
    if (d) contagemDoc.set(d, (contagemDoc.get(d) ?? 0) + 1);
  }
  const duplicados = [...contagemDoc.values()].some((n) => n > 1);
  if (semDoc.length || duplicados) {
    registrar(
      "Conferir documentos dos passageiros",
      false,
      semDoc.length
        ? `Informe o CPF de: ${semDoc.map((p) => `${p.nome} ${p.sobrenome}`.trim()).join(", ")}.`
        : "Cada passageiro precisa de um CPF diferente — a companhia recusa documentos repetidos.",
    );
    return {
      ok: false,
      orcamentoId: null,
      localizadorAereo: null,
      localizadorHotel: null,
      limiteEmissao: null,
      prazoPagamento: null,
      passos,
    };
  }

  const pessoas = e.passageiros.map((p, i) => pessoa(p, i + 1));

  // Mesma distribuição enviada na busca (o portal repassa `quartos` no orçamento).
  const quartosOrcamento = (
    e.quartos?.length ? e.quartos : [{ adultos: Math.max(1, e.passageiros.filter((p) => (p.tipo ?? 0) === 0).length) }]
  ).map((q, i) => {
    const idades = [...(q.idades ?? [])];
    while (idades.length < (q.criancas ?? 0)) idades.push(7);
    for (let b = 0; b < (q.bebes ?? 0); b++) idades.push(0);
    return { NumeroPesquisa: i + 1, Qtde: 1, Adultos: Math.max(1, q.adultos || 1), Criancas: idades };
  });

  const criar = await chamarCompreFacil("/api/Reserva/", {
    method: "POST",
    body: {
      AgenciaId: agenciaId,
      ...(agenteId ? { AgenteId: agenteId } : {}),
      MoedaId: 1,
      Status: 0,
      Aereos: aereoBruto ? [aereoBruto] : [],
      Hoteis: hotelBruto ? [hotelBruto] : [],
      Servicos: [],
      Seguros: [],
      ...(hotelBruto ? { quartos: quartosOrcamento } : {}),
      Pessoas: pessoas.map((p) => ({ ...p, Nome: "", Sobrenome: "" })),
      ...(e.observacao ? { Observacao: e.observacao } : {}),
    },
  });

  const orcamentoId = Number((criar.dados as any)?.Id ?? 0) || null;
  registrar("Criar orçamento na operadora", Boolean(orcamentoId), orcamentoId ? `#${orcamentoId}` : "Falha ao criar");
  if (!orcamentoId) {
    return { ok: false, orcamentoId: null, localizadorAereo: null, localizadorHotel: null, limiteEmissao: null, prazoPagamento: null, passos };
  }

  const consultor = e.consultorId ?? CONSULTOR_PADRAO_FRT;
  const cons = await chamarCompreFacil(`/api/Reserva/consultor/${orcamentoId}/${consultor}`, {
    method: "PUT",
    body: {},
  });
  registrar("Vincular consultor", cons.ok, cons.ok ? `Consultor ${consultor}` : "Não foi possível vincular");

  // Recarrega o orçamento para pegar os Ids gerados (pessoas, aéreo, hotel).
  const lido = await chamarCompreFacil(`/api/Reserva/${orcamentoId}/false`);
  const orc: any = lido.dados ?? {};

  const pessoasOrc: any[] = orc?.Pessoas ?? [];
  const paxPayload = pessoasOrc.map((base, i) => ({ ...base, ...(pessoas[i] ?? {}), Id: base?.Id }));
  const pax = await chamarCompreFacil(`/api/reservas/paxes/${orcamentoId}`, { method: "POST", body: paxPayload });
  registrar("Gravar passageiros", pax.ok, pax.ok ? `${paxPayload.length} passageiro(s)` : "Falha ao gravar passageiros");

  let localizadorAereo: string | null = null;
  let limiteEmissao: string | null = null;

  const aereoId = Number(orc?.Aereos?.[0]?.Id ?? 0) || null;
  if (aereoId) {
    const dup = await chamarCompreFacil(`/api/aereo/${aereoId}/TemDuplicidade`, { base: COMPREFACIL_BASES.aereo });
    const temDup = (dup.dados as any) === true || (dup.dados as any)?.TemDuplicidade === true;
    registrar("Checar duplicidade", !temDup, temDup ? "Já existe reserva igual na operadora" : "Sem duplicidade");

    const tar = await chamarCompreFacil(`/api/Aereo/tarifar/${aereoId}`, {
      base: COMPREFACIL_BASES.aereo,
      method: "POST",
      body: {},
    });
    const novoTotal = Number((tar.dados as any)?.ValorTotalVenda ?? (tar.dados as any)?.Total ?? 0) || null;
    registrar("Retarifar aéreo", tar.ok, novoTotal ? `Total revalidado: R$ ${novoTotal.toFixed(2)}` : null);

    if (!temDup && tar.ok) {
      const res = await chamarCompreFacil(`/api/aereo/reservar/${aereoId}`, {
        base: COMPREFACIL_BASES.aereo,
        method: "POST",
        body: {},
      });
      const d: any = res.dados ?? {};
      localizadorAereo = d?.LocalizadorAereo ?? d?.Localizador ?? d?.Aereo?.LocalizadorAereo ?? null;
      limiteEmissao = d?.DataLimiteEmissao ?? d?.LimiteEmissao ?? d?.Aereo?.DataLimiteEmissao ?? null;
      registrar(
        "Reservar aéreo",
        Boolean(localizadorAereo),
        localizadorAereo ? `Localizador ${localizadorAereo}` : (d?.message ?? "Operadora não devolveu localizador"),
      );
    }
  }

  let localizadorHotel: string | null = null;
  const hotelOrc = orc?.Hoteis?.[0] ?? null;
  if (hotelOrc) {
    // O portal da operadora sempre consulta a política antes de reservar:
    // PATCH /api/hotel/politica/{reservaId}/{hotelId} devolve o objeto `Politica`
    // que é justamente o corpo aceito por POST /api/Hotel/reservar.
    const pol = await chamarCompreFacil(`/api/hotel/politica/${orcamentoId}/${hotelOrc.Id}`, {
      base: COMPREFACIL_BASES.hotel,
      method: "PATCH",
      body: {},
    });
    const dp: any = pol.dados ?? {};
    const politica = dp?.Politica ?? dp?.politica ?? null;
    registrar(
      "Consultar política da hospedagem",
      Boolean(politica),
      politica ? (politica?.Mensagem ?? "Política recebida") : "Operadora não devolveu a política",
    );

    // Bloqueios que o próprio portal aplica antes de deixar reservar.
    const alteracaoBloqueada =
      Boolean(politica?.BloqueioAumentoTarifa) ||
      (politica?.PoliticaValida === false &&
        Boolean(politica?.AlterouValor) &&
        Number(politica?.DiferencaValor ?? 0) > 0);

    if (politica && alteracaoBloqueada) {
      registrar(
        "Reservar hospedagem",
        false,
        politica?.Mensagem ??
          politica?.MensagemFornecedor ??
          "O fornecedor atualizou o valor da hospedagem. Reveja o orçamento antes de reservar.",
      );
    } else if (politica) {
      // O portal envia o objeto `Politica` exatamente como veio, sem campos extras.
      const res = await chamarCompreFacil("/api/Hotel/reservar", {
        base: COMPREFACIL_BASES.hotel,
        method: "POST",
        body: politica,
      });
      const d: any = res.dados ?? {};
      const hotelRes: any = d?.Hotel ?? d ?? {};
      const status = Number(hotelRes?.Status ?? 0);
      localizadorHotel =
        hotelRes?.Localizador ?? hotelRes?.LocalizadorHotel ?? d?.Localizador ?? d?.LocalizadorHotel ?? null;

      // Status da operadora: 3/4 = reservado, 1 = aguardando fornecedor, 7 = problema técnico.
      if (status === 3 || status === 4) {
        registrar(
          "Reservar hospedagem",
          true,
          localizadorHotel ? `Localizador ${localizadorHotel}` : "Hospedagem reservada na operadora",
        );
      } else if (status === 1) {
        registrar("Reservar hospedagem", true, "Reserva enviada — aguardando retorno do fornecedor");
      } else if (status === 7) {
        registrar("Reservar hospedagem", false, "A operadora relatou problema técnico nesta reserva de hotel");
      } else {
        registrar(
          "Reservar hospedagem",
          Boolean(localizadorHotel),
          localizadorHotel
            ? `Localizador ${localizadorHotel}`
            : (hotelRes?.Mensagem ??
              d?.message ??
              "A operadora não concluiu a reserva do hotel — finalize pelo portal da FRT com o orçamento criado."),
        );
      }
    }

  }


  // Releitura final com repescagem: a operadora costuma carimbar localizador e
  // prazo de pagamento alguns segundos depois de reservar (retorno do fornecedor).
  let prazoPagamento = extrairPrazoPagamento(orc);
  const precisaRepescar = (e.aereo && !localizadorAereo) || (hotelOrc && !localizadorHotel);
  const tentativas = precisaRepescar ? 6 : 1;
  for (let i = 0; i < tentativas; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 3000));
    try {
      const final = await chamarCompreFacil(`/api/Reserva/${orcamentoId}/false`);
      const fd: any = final.dados ?? {};
      prazoPagamento = extrairPrazoPagamento(fd) ?? prazoPagamento;
      const a: any = fd?.Aereos?.[0] ?? null;
      const h: any = fd?.Hoteis?.[0] ?? null;
      localizadorAereo =
        localizadorAereo || a?.Localizador || a?.LocalizadorAereo || a?.Reserva?.Localizador || null;
      limiteEmissao = limiteEmissao || a?.DataLimiteEmissao || a?.LimiteEmissao || null;
      localizadorHotel =
        localizadorHotel || h?.Localizador || h?.LocalizadorHotel || h?.Reserva?.Localizador || null;
    } catch {
      /* mantém os dados já lidos */
    }
    if ((!e.aereo || localizadorAereo) && (!hotelOrc || localizadorHotel)) break;
  }

  // Se a repescagem trouxe o localizador, corrige o passo que havia falhado.
  const corrigirPasso = (nome: string, loc: string | null) => {
    if (!loc) return;
    const p = passos.find((x) => x.passo === nome);
    if (p && !p.ok) {
      p.ok = true;
      p.detalhe = `Localizador ${loc}`;
    }
  };
  corrigirPasso("Reservar aéreo", localizadorAereo);
  corrigirPasso("Reservar hospedagem", localizadorHotel);

  const ok = passos.every((p) => p.ok);
  await registrarReservaFRT({
    orcamentoId,
    localizadorAereo,
    localizadorHotel,
    limiteEmissao,
    prazoPagamento,
    passos,
    passageiros: e.passageiros,
  });

  return { ok, orcamentoId, localizadorAereo, localizadorHotel, limiteEmissao, prazoPagamento, passos };
}

/** Guarda a reserva no nosso banco para aparecer na Consolidadora. */
async function registrarReservaFRT(r: {
  orcamentoId: number;
  localizadorAereo: string | null;
  localizadorHotel: string | null;
  limiteEmissao: string | null;
  prazoPagamento: string | null;
  passos: PassoReserva[];
  passageiros: PaxReserva[];
}) {
  try {
    const { supabaseAdmin } = (await import("@/integrations/supabase/client.server")) as any;
    await supabaseAdmin.from("frt_reservas").upsert(
      {
        orcamento_id: r.orcamentoId,
        localizador_aereo: r.localizadorAereo,
        localizador_hotel: r.localizadorHotel,
        limite_emissao: r.limiteEmissao,
        status: r.localizadorAereo || r.localizadorHotel ? "reservado" : "pendente",
        detalhes: { passos: r.passos, passageiros: r.passageiros, prazo_pagamento: r.prazoPagamento } as never,
      },
      { onConflict: "orcamento_id" },
    );
  } catch {
    /* registro local é best-effort */
  }
}
