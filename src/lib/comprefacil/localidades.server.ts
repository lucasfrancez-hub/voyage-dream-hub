import { chamarCompreFacil, COMPREFACIL_BASES } from "./auth.server";

export type CidadeOficialCF = { id: number; nome: string; iata: string | null; descricao: string };
export type SugestaoCF = {
  nome: string;
  cidadeId: number | null;
  iata: string | null;
  total: number;
  /** Cidade sem aeroporto: o voo usa o aeroporto mais próximo (`iata`). */
  viaAeroporto?: boolean;
  /** Estado/país, só para o usuário reconhecer o destino na lista. */
  regiao?: string | null;
};

let cache: { em: number; itens: CidadeOficialCF[] } | null = null;
const TTL = 6 * 60 * 60 * 1000; // 6h

/** Baixa a lista oficial de cidades/aeroportos da CompreFácil (com o Id certo). */
export async function cidadesOficiaisCF(): Promise<CidadeOficialCF[]> {
  if (cache && Date.now() - cache.em < TTL) return cache.itens;

  const base = COMPREFACIL_BASES.hotel;
  const mapa = new Map<string, CidadeOficialCF>();
  try {
    for (let pagina = 1; pagina <= 25; pagina++) {
      const r = await chamarCompreFacil(`/api/aeroporto?Pagina=${pagina}&ItensPorPagina=50`, { base });
      const dados = r.dados as any;
      const itens: any[] = dados?.Items ?? [];
      for (const a of itens) {
        const id = Number(a?.CidadeId ?? a?.Cidade?.Id);
        const nome = String(a?.Cidade?.Nome ?? a?.Descricao ?? "").trim();
        if (!id || !nome) continue;
        const iata = a?.Iata ? String(a.Iata).toUpperCase() : null;
        const descricao = String(a?.Descricao ?? nome).trim();
        // Uma cidade pode ter vários aeroportos (ex.: Orlando = MCO e MIA):
        // guardamos cada aeroporto separadamente para não perder o código certo.
        const chave = `${id}-${iata ?? "s"}`;
        if (!mapa.has(chave)) mapa.set(chave, { id, nome, iata, descricao });
      }
      const totalPaginas = Number(dados?.MetaData?.TotalPaginas ?? 0);
      if (!totalPaginas || pagina >= totalPaginas) break;
    }
  } catch (e) {
    console.error("[comprefacil] lista de cidades falhou:", e instanceof Error ? e.message : e);
    if (cache) return cache.itens;
    return [];
  }

  const itens = [...mapa.values()];
  if (itens.length) cache = { em: Date.now(), itens };
  return itens;
}


export function semAcento(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Resultado pronto por termo: digitação repetida responde na hora. */
const cacheSugestoes = new Map<string, { em: number; itens: SugestaoCF[] }>();
const TTL_SUGESTOES = 10 * 60 * 1000;

/** Não deixa uma fonte lenta (Overpass, portal fora do ar) travar a lista. */
function comLimite<T>(p: Promise<T>, ms: number, padrao: T): Promise<T> {
  return Promise.race([
    p.catch(() => padrao),
    new Promise<T>((r) => setTimeout(() => r(padrao), ms)),
  ]);
}

/**
 * Monta as sugestões de origem/destino juntando o catálogo já importado com a
 * lista oficial de aeroportos (cada aeroporto vira uma opção com o IATA certo).
 */
export async function montarSugestoesCF(
  linhas: { cidade?: string | null; cidade_saida?: string | null; cidade_id?: number | null }[],
  campo: "cidade" | "cidade_saida",
  termo: string,
): Promise<SugestaoCF[]> {
  const alvo = semAcento(termo);
  const chaveCache = `${campo}|${alvo}`;
  const pronto = cacheSugestoes.get(chaveCache);
  if (pronto && Date.now() - pronto.em < TTL_SUGESTOES) return pronto.itens;

  const porNome = new Map<string, SugestaoCF>();

  // Todas as fontes remotas disparam juntas (antes eram sequenciais: era daí
  // a demora do autopreencher).
  const { buscarDestinosCF, buscarSugestoesFrt, iataMaisProximo, iataPeloAutocompleteFrt } =
    await import("./destinos.server");
  const pOficiais = comLimite(cidadesOficiaisCF(), 6_000, [] as CidadeOficialCF[]);
  const pFrt = comLimite(buscarSugestoesFrt(termo), 5_000, [] as Awaited<ReturnType<typeof buscarSugestoesFrt>>);
  const pDestinos = comLimite(buscarDestinosCF(termo, 20), 5_000, [] as Awaited<ReturnType<typeof buscarDestinosCF>>);


  for (const l of linhas ?? []) {
    const nome = campo === "cidade" ? l.cidade : l.cidade_saida;
    if (!nome || !semAcento(nome).includes(alvo)) continue;
    const chave = semAcento(nome);
    const atual = porNome.get(chave);
    if (atual) {
      atual.total += 1;
      if (atual.cidadeId == null && campo === "cidade") atual.cidadeId = l.cidade_id ?? null;
    } else {
      porNome.set(chave, {
        nome,
        cidadeId: campo === "cidade" ? (l.cidade_id ?? null) : null,
        iata: null,
        total: 1,
      });
    }
  }

  const [oficiais, opcoesFrt, destinos] = await Promise.all([pOficiais, pFrt, pDestinos]);

  const saida: SugestaoCF[] = [];
  const nomesComAeroporto = new Set<string>();
  {


    // A operadora repete o mesmo IATA em cidades diferentes (ex.: "Miami
    // (Orlando)" com o código MIA dentro de Orlando). O dono do código é a
    // cidade cujo nome bate com a descrição do aeroporto — os apelidos são
    // descartados para a busca sempre usar o destino que foi preenchido.
    const donoDoIata = new Map<string, string>();
    for (const c of oficiais) {
      if (!c.iata) continue;
      const desc = semAcento(c.descricao);
      const cidade = semAcento(c.nome);
      if (desc === cidade || desc.startsWith(`${cidade},`) || desc.startsWith(`${cidade} `)) {
        if (!donoDoIata.has(c.iata)) donoDoIata.set(c.iata, cidade);
      }
    }

    const porIata = alvo.length === 3;
    const vistos = new Set<string>();
    for (const c of oficiais) {
      const casaIata = porIata && (c.iata ?? "").toLowerCase() === alvo;
      if (!casaIata && !semAcento(c.nome).includes(alvo)) continue;
      const chave = semAcento(c.nome);
      // Apelido de outra cidade (MIA dentro de Orlando): não sugerimos.
      const dono = c.iata ? donoDoIata.get(c.iata) : undefined;
      if (dono && dono !== chave) continue;
      const unico = `${c.id}-${c.iata ?? "s"}`;
      if (vistos.has(unico)) continue;
      vistos.add(unico);
      nomesComAeroporto.add(chave);
      saida.push({ nome: c.nome, cidadeId: c.id, iata: c.iata, total: porNome.get(chave)?.total ?? 0 });
    }
  }

  // A lista da própria FRT é a fonte principal para o que o usuário digitou.
  // Isso evita perder capitais atendidas (Recife, Fortaleza, Maceió etc.) quando
  // o catálogo de aeroportos da CompreFácil estiver parcial ou indisponível.
  {
    const destinoPorNome = new Map(destinos.map((d) => [semAcento(d.nome), d]));
    const oficialPorIata = new Map(oficiais.filter((c) => c.iata).map((c) => [c.iata as string, c]));
    const existentes = new Set(saida.map((s) => `${semAcento(s.nome)}-${s.iata ?? "s"}`));

    for (const opcao of opcoesFrt) {
      const nomeChave = semAcento(opcao.nome);
      const chave = `${nomeChave}-${opcao.iata}`;
      if (existentes.has(chave)) continue;
      const destino = destinoPorNome.get(nomeChave);
      const oficial = oficialPorIata.get(opcao.iata);
      saida.push({
        nome: opcao.nome,
        cidadeId: destino?.cidadeId ?? oficial?.id ?? null,
        iata: opcao.iata,
        total: porNome.get(nomeChave)?.total ?? 0,
        regiao: opcao.regiao ?? ([destino?.estado, destino?.pais].filter(Boolean).join(", ") || null),
      });
      nomesComAeroporto.add(nomeChave);
      existentes.add(chave);
    }
  }


  for (const [chave, item] of porNome) if (!nomesComAeroporto.has(chave)) saida.push(item);

  // Destinos que não são aeroporto (Porto de Galinhas, Búzios, Gramado…):
  // a hospedagem usa a cidade certa e o voo vai pelo aeroporto mais próximo.
  try {
    const iataPorCidade = new Map<number, string>();
    const permitidos = new Set<string>();
    for (const c of oficiais) {
      if (!c.iata) continue;
      permitidos.add(c.iata);
      if (!iataPorCidade.has(c.id)) iataPorCidade.set(c.id, c.iata);
    }

    const jaTem = new Set(saida.map((s) => `${s.cidadeId ?? "s"}-${semAcento(s.nome)}`));
    const pendentes: typeof destinos = [];
    for (const d of destinos.slice(0, 8)) {
      const chave = `${d.cidadeId}-${semAcento(d.nome)}`;
      if (jaTem.has(chave) || nomesComAeroporto.has(semAcento(d.nome))) continue;
      jaTem.add(chave);
      pendentes.push(d);
    }

    // As descobertas de aeroporto rodam em paralelo e com prazo curto: uma
    // cidade lenta não segura mais a lista inteira.
    const resolvidos = await Promise.all(
      pendentes.map(async (d, i) => {
        let iata = iataPorCidade.get(d.cidadeId) ?? null;
        let via = false;
        if (!iata && i < 4) {
          // 1º o autopreencher da própria FRT (mesma resposta do portal);
          // só se ela não responder caímos no aeroporto mais próximo por mapa.
          iata = await comLimite(iataPeloAutocompleteFrt(d.nome), 3_000, null);
          if (!iata && d.lat != null && d.lng != null) {
            iata = await comLimite(iataMaisProximo(d.lat, d.lng, permitidos), 3_000, null);
          }
          via = !!iata;
        }
        return { d, iata, via };
      }),
    );

    for (const { d, iata, via } of resolvidos) {
      saida.push({
        nome: d.nome,
        cidadeId: d.cidadeId,
        iata,
        total: porNome.get(semAcento(d.nome))?.total ?? 0,
        viaAeroporto: via,
        regiao: [d.estado, d.pais].filter(Boolean).join(", ") || null,
      });
    }
  } catch (e) {
    console.error("[comprefacil] destinos sem aeroporto indisponíveis:", e instanceof Error ? e.message : e);
  }


  const codigo = alvo.length === 3 ? alvo.toUpperCase() : null;
  const resultado = saida
    .sort((a, b) => {
      const ca = codigo && a.iata === codigo ? 0 : 1;
      const cb = codigo && b.iata === codigo ? 0 : 1;
      const ea = semAcento(a.nome) === alvo ? 0 : 1;
      const eb = semAcento(b.nome) === alvo ? 0 : 1;
      const pa = semAcento(a.nome).startsWith(alvo) ? 0 : 1;
      const pb = semAcento(b.nome).startsWith(alvo) ? 0 : 1;
      return ca - cb || ea - eb || pa - pb || b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR");
    })
    .slice(0, 12);

  if (resultado.length) {
    cacheSugestoes.set(chaveCache, { em: Date.now(), itens: resultado });
    if (cacheSugestoes.size > 500) cacheSugestoes.delete(cacheSugestoes.keys().next().value as string);
  }
  return resultado;
}
