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

/** URL absoluta de imagem/logo vinda da operadora (aceita caminho relativo). */
function urlImagem(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  if (t.startsWith("/")) return `https://www.frt.com.br${t}`;
  return null;
}

/** Procura a logomarca da seguradora em qualquer campo plausível do item. */
function logoSeguradora(s: any): string | null {
  const candidatos = [
    s?.UrlLogo, s?.Logo, s?.LogoUrl, s?.LogoFornecedor, s?.UrlLogoFornecedor,
    s?.ImagemFornecedor, s?.UrlImagemFornecedor, s?.Imagem, s?.UrlImagem,
    s?.Seguradora?.Logo, s?.Seguradora?.UrlLogo, s?.Fornecedor?.Logo, s?.Fornecedor?.UrlLogo,
  ];
  for (const c of candidatos) {
    const u = urlImagem(c);
    if (u) return u;
  }
  // varredura genérica: qualquer chave com "logo"/"imagem" que aponte para arquivo
  for (const [k, v] of Object.entries(s ?? {})) {
    if (!/logo|imagem|image|icone/i.test(k)) continue;
    const u = urlImagem(v);
    if (u && /\.(png|jpe?g|svg|webp)/i.test(u)) return u;
  }
  return null;
}

/** Normaliza as coberturas detalhadas do plano (nome + valor coberto). */
function coberturasDoPlano(s: any): { nome: string; valor: string | null }[] {
  const fontes = [
    s?.Coberturas, s?.ListaCoberturas, s?.ItensCobertura, s?.Beneficios,
    s?.Detalhes, s?.DetalhesCobertura, s?.Servicos, s?.Garantias,
  ];
  const saida: { nome: string; valor: string | null }[] = [];
  const vistos = new Set<string>();
  for (const fonte of fontes) {
    if (!Array.isArray(fonte)) continue;
    for (const c of fonte) {
      if (typeof c === "string") {
        const t = texto(c);
        if (t && !vistos.has(t)) { vistos.add(t); saida.push({ nome: t, valor: null }); }
        continue;
      }
      const nome =
        texto(c?.Nome) ?? texto(c?.Titulo) ?? texto(c?.Descricao) ??
        texto(c?.NomeCobertura) ?? texto(c?.Cobertura);
      if (!nome) continue;
      const bruto =
        c?.ValorCobertura ?? c?.Valor ?? c?.ValorFormatado ?? c?.Limite ?? c?.LimiteCobertura ?? c?.Texto;
      let valor: string | null = null;
      if (typeof bruto === "number" && Number.isFinite(bruto) && bruto > 0) {
        const moeda = texto(c?.Moeda) ?? texto(s?.Moeda) ?? "";
        valor = `${moeda ? `${moeda} ` : ""}${bruto.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
      } else {
        valor = texto(bruto);
      }
      const chave = `${nome}|${valor ?? ""}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push({ nome, valor });
    }
  }
  return saida.slice(0, 40);
}

/** Código da seguradora na operadora → nome comercial. */
const SEGURADORAS: Record<string, string> = {
  AC: "Assist Card",
  AF: "Affinity",
  AS: "Assist Card",
  CI: "Coris",
  GT: "GTA",
  IT: "Intermac",
  MP: "Mapfre",
  UN: "Universal Assistance",
  VT: "Vital Card",
  MC: "My Care",
};

function nomeSeguradora(codigo: unknown): string | null {
  const c = typeof codigo === "string" ? codigo.trim().toUpperCase() : "";
  if (!c) return null;
  if (SEGURADORAS[c]) return SEGURADORAS[c];
  return c.length > 3 ? texto(codigo) : null;
}

/**
 * Resumo do plano quando a operadora não devolve a tabela de coberturas.
 * Só usa dados reais do item (nome do plano, moeda, região, vigência) —
 * nenhum valor de cobertura é inventado.
 */
function resumoDoPlano(
  s: any,
  ctx: { pax: number; noites: number; regiaoNome: string },
): { nome: string; valor: string | null }[] {
  const plano = texto(s?.Nome) ?? texto(s?.Titulo) ?? "Plano";
  const moeda = texto(s?.MoedaNet?.Sigla) ?? texto(s?.MoedaListagem?.Sigla) ?? null;
  const lista: { nome: string; valor: string | null }[] = [
    { nome: "Plano contratado", valor: plano },
    { nome: "Abrangência", valor: ctx.regiaoNome },
    { nome: "Vigência", valor: `${ctx.noites} ${ctx.noites === 1 ? "dia" : "dias"}` },
    { nome: "Passageiros cobertos", valor: `${ctx.pax}` },
  ];
  if (moeda) lista.push({ nome: "Moeda das coberturas", valor: moeda });
  lista.push({
    nome: "Condições gerais e limites de cobertura",
    valor: "Enviados pela seguradora junto ao voucher",
  });
  return lista;
}



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
    let anterior = -1;
    let estavel = 0;
    for (let i = 0; i < 14; i++) {
      await espera(2000);
      const r = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(guid) });
      const novos = ((r.dados as any)?.Items ?? (r.dados as any)?.Itens ?? []) as any[];
      const atuais = (dados?.Items ?? dados?.Itens ?? []) as any[];
      if (novos.length >= atuais.length) dados = r.dados;
      const meta = (r.dados as any)?.MetaData;
      // só encerra quando as seguradoras terminaram E a contagem parou de crescer
      if (novos.length > 0 && ativas(meta) === 0) {
        estavel = novos.length === anterior ? estavel + 1 : 0;
        if (estavel >= 1) break;
      }
      anterior = novos.length;
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
    // A operadora já devolve o total da ocupação/período em ValorTotalListagem
    // (BRL). Se só vier o valor NET em moeda estrangeira, converte pelo câmbio.
    const total = num(s?.ValorTotalListagem, s?.ValorListagem, s?.ValorTotal, s?.ValorVendaTotal);
    const unit = num(s?.ValorVenda, s?.Valor, s?.ValorPorPassageiro, s?.ValorDiaria, s?.Preco);
    const calculado = total > 0 ? total : paraBRL(unit * pax, cambioContexto(s));



    const chave = `${titulo}|${calculado.toFixed(2)}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);

    const seguradora =
      nomeSeguradora(s?.Fornecedor) ??
      texto(s?.NomeFornecedor) ??
      texto(s?.Seguradora) ??
      texto(s?.Fornecedor);
    const regiaoNome = texto(s?.DestinoNome) ?? REGIOES_SEGURO[regiao] ?? "Cobertura nacional";
    const daApi = coberturasDoPlano(s);

    lista.push({
      id: `cfseg-${s?.CodigoFornecedor ?? s?.Id ?? i}-${i}`,
      externoId: Number(s?.CodigoFornecedor ?? s?.Id ?? 0) || 0,
      titulo: /seguro/i.test(titulo) ? titulo : `Seguro viagem · ${titulo}`,
      categoria: "Seguro viagem",
      descricao:
        texto(s?.Descricao) ??
        texto(s?.Cobertura) ??
        `Plano ${titulo} para ${pax} ${pax === 1 ? "passageiro" : "passageiros"}, com ${noites} ${noites === 1 ? "dia" : "dias"} de cobertura em ${regiaoNome.toLowerCase()}.`,
      fornecedor: seguradora,
      politica: texto(s?.PoliticaCancelamento),
      informacoes: [
        `${pax} ${pax === 1 ? "passageiro" : "passageiros"}`,
        `${noites} ${noites === 1 ? "dia" : "dias"} de cobertura`,
        regiaoNome,
        seguradora ? `Seguradora ${seguradora}` : null,
      ].filter(Boolean) as string[],

      recomendado: false,
      valor: calculado > 0 ? Number(calculado.toFixed(2)) : null,
      moeda: "BRL" as const,
      imagem: null,
      logo: logoSeguradora(s),
      coberturas: daApi.length ? daApi : resumoDoPlano(s, { pax, noites, regiaoNome }),

    });
  });


  return lista.sort((a, b) => (a.valor ?? Infinity) - (b.valor ?? Infinity));
}
