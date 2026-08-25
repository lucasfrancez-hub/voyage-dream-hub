/**
 * Cancelamento de reservas na operadora CompreFácil/FRT.
 *
 * Rotas mapeadas no portal da operadora:
 *   POST  {aereo}/api/aereo/cancelar/{aereoId}            (corpo = objeto do aéreo)
 *   PATCH {hotel}/api/hotel/cancelar/{orcamentoId}/{hotelId}
 *   POST  {servico}/api/servico/cancelar/{orcamentoId}/{servicoId}
 *   POST  {api}/api/seguro/cancelar/{orcamentoId}/{seguroId}
 *
 * O cancelamento é item a item — não existe "cancelar orçamento inteiro";
 * por isso varremos todos os produtos do orçamento e cancelamos cada um.
 */
import { chamarCompreFacil, COMPREFACIL_BASES } from "./auth.server";
import { extrairPrazoPagamento } from "./prazo.server";

export type ItemReservaFRT = {
  tipo: "aereo" | "hotel" | "servico" | "seguro";
  id: number;
  descricao: string;
  localizador: string | null;
  status: string | null;
  cancelado: boolean;
};

export type PassoCancelamento = { passo: string; ok: boolean; detalhe?: string | null };

export type ResultadoCancelamentoFRT = {
  ok: boolean;
  orcamentoId: number;
  itens: ItemReservaFRT[];
  passos: PassoCancelamento[];
};

function texto(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s ? s : null;
}

/**
 * A operadora devolve o status ora como texto ("Cancelado"), ora como código
 * numérico — 8 é o código de cancelado confirmado no portal.
 */
function statusCancelado(s: unknown): boolean {
  const t = (texto(s) ?? "").toUpperCase();
  if (!t) return false;
  if (/^\d+$/.test(t)) return t === "8";
  return t.includes("CANCEL");
}

async function lerOrcamento(orcamentoId: number): Promise<any> {
  const r = await chamarCompreFacil(`/api/Reserva/${orcamentoId}/false`);
  return (r.dados as any) ?? {};
}

/** Lista os produtos do orçamento com status atual (para a tela de cancelamento). */
export function itensDoOrcamento(orc: any): ItemReservaFRT[] {
  const itens: ItemReservaFRT[] = [];

  for (const a of (orc?.Aereos ?? []) as any[]) {
    const trechos: any[] = a?.Voos ?? a?.Trechos ?? [];
    const de = texto(trechos[0]?.Origem ?? trechos[0]?.OrigemIata);
    const para = texto(trechos[trechos.length - 1]?.Destino ?? trechos[trechos.length - 1]?.DestinoIata);
    itens.push({
      tipo: "aereo",
      id: Number(a?.Id ?? 0),
      descricao: `Aéreo${de && para ? ` ${de} → ${para}` : ""}`,
      localizador: texto(a?.LocalizadorAereo ?? a?.Localizador),
      status: texto(a?.Status ?? a?.StatusDescricao),
      cancelado: statusCancelado(a?.Status ?? a?.StatusDescricao),
    });
  }

  for (const h of (orc?.Hoteis ?? []) as any[]) {
    itens.push({
      tipo: "hotel",
      id: Number(h?.Id ?? 0),
      descricao: `Hospedagem${texto(h?.Nome) ? ` — ${texto(h?.Nome)}` : ""}`,
      localizador: texto(h?.Localizador ?? h?.LocalizadorHotel),
      status: texto(h?.Status ?? h?.StatusDescricao),
      cancelado: statusCancelado(h?.Status ?? h?.StatusDescricao),
    });
  }

  for (const s of (orc?.Servicos ?? []) as any[]) {
    itens.push({
      tipo: "servico",
      id: Number(s?.Id ?? 0),
      descricao: `Serviço${texto(s?.Nome) ? ` — ${texto(s?.Nome)}` : ""}`,
      localizador: texto(s?.Localizador),
      status: texto(s?.Status ?? s?.StatusDescricao),
      cancelado: statusCancelado(s?.Status ?? s?.StatusDescricao),
    });
  }

  for (const s of (orc?.Seguros ?? []) as any[]) {
    itens.push({
      tipo: "seguro",
      id: Number(s?.Id ?? 0),
      descricao: `Seguro${texto(s?.Nome ?? s?.Plano) ? ` — ${texto(s?.Nome ?? s?.Plano)}` : ""}`,
      localizador: texto(s?.Localizador),
      status: texto(s?.Status ?? s?.StatusDescricao),
      cancelado: statusCancelado(s?.Status ?? s?.StatusDescricao),
    });
  }

  return itens.filter((i) => i.id > 0);
}

/** Consulta os itens de um orçamento na operadora (sem cancelar nada). */
export async function consultarReservaFRT(orcamentoId: number) {
  const orc = await lerOrcamento(orcamentoId);
  return { orcamentoId, itens: itensDoOrcamento(orc), prazoPagamento: extrairPrazoPagamento(orc) };
}

/**
 * Cancela os itens do orçamento na operadora.
 * `itens` vazio/ausente = cancelar tudo.
 */
export async function cancelarReservaFRT(entrada: {
  orcamentoId: number;
  itens?: { tipo: ItemReservaFRT["tipo"]; id: number }[] | null;
  motivo?: string | null;
}): Promise<ResultadoCancelamentoFRT> {
  const { orcamentoId } = entrada;
  const passos: PassoCancelamento[] = [];
  const registrar = (passo: string, ok: boolean, detalhe?: string | null) => passos.push({ passo, ok, detalhe });

  const orc = await lerOrcamento(orcamentoId);
  const todos = itensDoOrcamento(orc);
  if (!todos.length) {
    registrar("Ler orçamento na operadora", false, "Orçamento sem itens ou inacessível");
    return { ok: false, orcamentoId, itens: [], passos };
  }
  registrar("Ler orçamento na operadora", true, `${todos.length} item(ns)`);

  const filtro = entrada.itens?.length ? new Set(entrada.itens.map((i) => `${i.tipo}:${i.id}`)) : null;
  const alvos = todos.filter((i) => !i.cancelado && (!filtro || filtro.has(`${i.tipo}:${i.id}`)));

  for (const item of alvos) {
    let resp: { ok: boolean; dados: unknown } | null = null;
    if (item.tipo === "aereo") {
      const bruto = ((orc?.Aereos ?? []) as any[]).find((a) => Number(a?.Id) === item.id) ?? {};
      resp = await chamarCompreFacil(`/api/aereo/cancelar/${item.id}`, {
        base: COMPREFACIL_BASES.aereo,
        method: "POST",
        body: bruto,
      });
    } else if (item.tipo === "hotel") {
      resp = await chamarCompreFacil(`/api/hotel/cancelar/${orcamentoId}/${item.id}`, {
        base: COMPREFACIL_BASES.hotel,
        method: "PATCH",
        body: {},
      });
    } else if (item.tipo === "servico") {
      resp = await chamarCompreFacil(`/api/servico/cancelar/${orcamentoId}/${item.id}`, {
        base: COMPREFACIL_BASES.servico,
        method: "POST",
        body: {},
      });
    } else {
      resp = await chamarCompreFacil(`/api/seguro/cancelar/${orcamentoId}/${item.id}`, {
        method: "POST",
        body: {},
      });
    }
    const d = resp?.dados as any;
    const msg = texto(d?.Mensagem ?? d?.mensagem ?? d?.message ?? d?.Message);
    registrar(`Cancelar ${item.descricao}`, Boolean(resp?.ok), msg ?? (resp?.ok ? "Cancelado" : "A operadora recusou"));
  }

  // Releitura para confirmar o que realmente ficou cancelado do lado da operadora.
  const depois = itensDoOrcamento(await lerOrcamento(orcamentoId));
  const itens = depois.length ? depois : todos;
  const pendentes = itens.filter((i) => !i.cancelado);
  const ok = passos.every((p) => p.ok) && (filtro ? true : pendentes.length === 0);

  await registrarCancelamento({ orcamentoId, itens, passos, motivo: entrada.motivo ?? null, tudo: !filtro && ok });

  return { ok, orcamentoId, itens, passos };
}

/** Guarda o rastro do cancelamento no nosso banco. */
async function registrarCancelamento(r: {
  orcamentoId: number;
  itens: ItemReservaFRT[];
  passos: PassoCancelamento[];
  motivo: string | null;
  tudo: boolean;
}) {
  try {
    const { supabaseAdmin } = (await import("@/integrations/supabase/client.server")) as any;
    const { data: atual } = await supabaseAdmin
      .from("frt_reservas")
      .select("detalhes")
      .eq("orcamento_id", r.orcamentoId)
      .maybeSingle();
    const detalhes = { ...((atual?.detalhes as any) ?? {}) };
    const historico = Array.isArray(detalhes.cancelamentos) ? detalhes.cancelamentos : [];
    historico.push({ em: new Date().toISOString(), motivo: r.motivo, passos: r.passos, itens: r.itens });
    detalhes.cancelamentos = historico;

    await supabaseAdmin.from("frt_reservas").upsert(
      {
        orcamento_id: r.orcamentoId,
        status: r.tudo ? "cancelado" : "cancelado_parcial",
        detalhes: detalhes as never,
      },
      { onConflict: "orcamento_id" },
    );
  } catch {
    /* rastro local é best-effort */
  }
}
