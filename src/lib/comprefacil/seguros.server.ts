/**
 * Seguro viagem da operadora (CompreFácil / FRT) para o motor de pacotes.
 *
 * A busca é assíncrona igual à de serviços: primeiro POST sem `Guid`, depois
 * polling com o `Guid` até a operadora terminar de cotar. O valor devolvido é
 * normalizado para o TOTAL da ocupação pesquisada (nº de passageiros × diárias
 * quando a operadora devolve valor unitário).
 */
import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "./auth.server";
import { REGIOES_SEGURO, regiaoSeguroDoDestino } from "./seguro-regioes";
import type { ServicoDisponivel } from "./servicos.server";


const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const texto = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/<li[^>]*>/gi, " • ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
};

function ativas(meta: any): number {
  try {
    const v = meta?.BuscasAtivas;
    if (Array.isArray(v)) return v.length;
    if (typeof v === "string") return (JSON.parse(v) as unknown[]).length;
  } catch {
    /* ignora */
  }
  return 0;
}

const num = (...vs: unknown[]): number => {
  for (const v of vs) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};

const dias = (de: string, ate: string) => {
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
};

export async function buscarSegurosCF(p: {
  cidadeId: number;
  data: string;
  dataFim?: string | null;
  adultos: number;
  idades?: number[];
  destino?: string | null;
  /** IATA do destino pesquisado — usado para casar a região do seguro */
  destinoIata?: string | null;
  /** true quando o destino é fora do Brasil (muda o plano ofertado) */
  internacional?: boolean;
}): Promise<ServicoDisponivel[]> {
  const ses = await sessaoCompreFacil();
  const base = COMPREFACIL_BASES.servico;
  const fim = p.dataFim || p.data;
  // A operadora cobra o mesmo valor por passageiro adulto ou criança:
  // cotamos todos como adultos de 18 anos para manter o preço correto.
  const pax = Math.max(1, (p.adultos || 1) + (p.idades?.length ?? 0));
  const noites = dias(p.data, fim);
  const rota = "/api/Seguro/busca?Pagina=1&ItensPorPagina=40";
  const regiao = regiaoSeguroDoDestino({
    iata: p.destinoIata ?? null,
    destino: p.destino ?? null,
    internacional: p.internacional ?? false,
  });

  const corpo = (guid: string | null) => ({
    AgenciaId: Number(ses.agenciaId ?? 0),
    Guid: guid,
    Adt: pax,
    Chd: 0,
    Snr: 0,
    IdadesAdt: Array.from({ length: pax }, () => 18),
    IdadesChd: [],
    DestinoCodigo: regiao,
    Partida: p.data,
    Retorno: fim,
    EscreveLog: false,
  });


  const inicio = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(null) });
  if (!inicio.ok) return [];
  let dados: any = inicio.dados;
  const guid = (dados?.MetaData?.Guid as string | undefined) ?? null;

  if (guid) {
    let vazioSeguido = 0;
    for (let i = 0; i < 12; i++) {
      await espera(2500);
      const r = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(guid) });
      const novos = ((r.dados as any)?.Items ?? (r.dados as any)?.Itens ?? []) as any[];
      const atuais = (dados?.Items ?? dados?.Itens ?? []) as any[];
      if (novos.length >= atuais.length) dados = r.dados;
      const meta = (r.dados as any)?.MetaData;
      if (novos.length > 0 && ativas(meta) === 0) break;
      if (ativas(meta) === 0 && novos.length === 0) {
        vazioSeguido++;
        if (vazioSeguido >= 3) break;
      } else {
        vazioSeguido = 0;
      }
    }

  }

  const itens: any[] = (dados?.Items ?? dados?.Itens ?? dados?.Seguros ?? []) as any[];
  if (!Array.isArray(itens) || !itens.length) return [];

  const vistos = new Set<string>();
  const lista: ServicoDisponivel[] = [];

  itens.forEach((s: any, i: number) => {
    const titulo =
      texto(s?.Titulo) ?? texto(s?.Nome) ?? texto(s?.Plano) ?? texto(s?.NomePlano) ?? "Seguro viagem";
    const total = num(s?.ValorTotal, s?.ValorVendaTotal);
    const unit = num(s?.ValorVenda, s?.Valor, s?.ValorPorPassageiro, s?.ValorDiaria, s?.Preco);
    const porDia = num(s?.ValorDiaria) > 0 && !num(s?.ValorVenda, s?.Valor);
    const calculado = total > 0 ? total : porDia ? unit * pax * noites : unit * pax;

    const chave = `${titulo}|${calculado.toFixed(2)}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);

    lista.push({
      id: `cfseg-${s?.CodigoFornecedor ?? s?.Id ?? i}-${i}`,
      externoId: Number(s?.CodigoFornecedor ?? s?.Id ?? 0) || 0,
      titulo: /seguro/i.test(titulo) ? titulo : `Seguro viagem · ${titulo}`,
      categoria: "Seguro viagem",
      descricao:
        texto(s?.Descricao) ??
        texto(s?.Cobertura) ??
        `Cobertura para ${pax} ${pax === 1 ? "passageiro" : "passageiros"} · ${noites} ${noites === 1 ? "dia" : "dias"}`,
      fornecedor: texto(s?.Fornecedor) ?? texto(s?.NomeFornecedor) ?? texto(s?.Seguradora),
      politica: texto(s?.PoliticaCancelamento),
      informacoes: [
        `${pax} ${pax === 1 ? "passageiro" : "passageiros"}`,
        `${noites} ${noites === 1 ? "dia" : "dias"} de cobertura`,
        p.internacional ? "Cobertura internacional" : "Cobertura nacional",
      ],
      recomendado: false,
      valor: calculado > 0 ? Number(calculado.toFixed(2)) : null,
      moeda: "BRL" as const,
      imagem: null,
    });
  });

  return lista.sort((a, b) => (a.valor ?? Infinity) - (b.valor ?? Infinity));
}
