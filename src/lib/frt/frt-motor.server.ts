/**
 * CAMADA DE PRODUTO DO MOTOR FRT.
 *
 * Não duplica o conector: reaproveita sessão → autocomplete → itemSelect →
 * pesquisa já validados e apenas normaliza o pnlResultado em pacotes.
 * O HTML bruto (~1,3 MB) fica no servidor; o cliente recebe só o normalizado,
 * primeiro os hotéis e, sob demanda, o aéreo daquele pacote.
 */
import {
  consultarFRT,
  frtComandoProduto,
  frtUltimoResultadoBruto,
  frtTraceLog,
  FRT_RENDER_AEREO,
} from "./frt-connector.server";
import {
  acharSourceAlterarVoo,
  htmlDoPacote,
  parseOpcoesAereas,
  parseResumoPacote,
  type FrtOpcaoAerea,
} from "./frt-aereo-parse";
import { parsePacotesFrt, type FrtPacote, type FrtPacotesDiagnostico } from "./frt-package-parse";
import type { FrtSearchInput } from "./frt-parse";

export type MotorHotelResumo = {
  id: string;
  hotel: FrtPacote["hotel"];
  preco: FrtPacote["preco"];
  temAereo: boolean;
};

type Cache = {
  id: string;
  em: number;
  input: FrtSearchInput;
  pacotes: FrtPacote[];
  diagnostico: FrtPacotesDiagnostico;
  /** pnlResultado bruto — fica só no servidor, usado para achar sources dinâmicos. */
  html: string;
  /** Opções aéreas já carregadas por pacote (cache do "Alterar voo"). */
  aereos: Map<string, FrtOpcaoAerea[]>;
  aereoSelecionado: Map<string, string>;
};

const CACHE_MS = 20 * 60 * 1000;
const buscas = new Map<string, Cache>();

function limparAntigas() {
  const limite = Date.now() - CACHE_MS;
  for (const [k, v] of buscas) if (v.em < limite) buscas.delete(k);
}

export async function motorFrtPesquisar(input: FrtSearchInput) {
  const resposta = await consultarFRT(input);
  if (!resposta.success) {
    return {
      ok: false as const,
      erro: resposta.error ?? "FRT_NETWORK_ERROR",
      mensagem: resposta.message ?? "Não foi possível consultar a FRT",
      log: frtTraceLog().slice(-40),
    };
  }

  const bruto = frtUltimoResultadoBruto();
  const { pacotes, diagnostico } = bruto
    ? parsePacotesFrt(bruto.html)
    : { pacotes: [], diagnostico: null as unknown as FrtPacotesDiagnostico };

  limparAntigas();
  const id = `frt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  buscas.set(id, {
    id,
    em: Date.now(),
    input,
    pacotes,
    diagnostico,
    html: bruto?.html ?? "",
    aereos: new Map(),
    aereoSelecionado: new Map(),
  });

  const hoteis: MotorHotelResumo[] = pacotes.map((p) => ({
    id: p.id,
    hotel: p.hotel,
    preco: p.preco,
    temAereo: Boolean(p.aereo.ida || p.aereo.volta),
  }));

  return {
    ok: true as const,
    searchId: id,
    busca: {
      origem: input.origem,
      destino: input.destino,
      ida: input.ida,
      volta: input.volta ?? null,
      adultos: input.adultos ?? 1,
      criancas: input.criancas ?? 0,
    },
    hoteis,
    diagnostico,
    bytesResultado: bruto?.html.length ?? 0,
  };
}

export function motorFrtPacote(searchId: string, pacoteId: string) {
  const c = buscas.get(searchId);
  if (!c) return { ok: false as const, erro: "FRT_BUSCA_EXPIRADA", mensagem: "Pesquisa expirada — refaça a busca" };
  const pacote = c.pacotes.find((p) => p.id === pacoteId);
  if (!pacote) return { ok: false as const, erro: "FRT_PACOTE_NAO_ENCONTRADO", mensagem: "Pacote não encontrado" };
  return { ok: true as const, pacote };
}

/* ── Etapa "Alterar voo": todas as opções aéreas do pacote ───────────── */

export async function motorFrtOpcoesAereas(searchId: string, pacoteId: string, recarregar = false) {
  const c = buscas.get(searchId);
  if (!c) return { ok: false as const, erro: "FRT_BUSCA_EXPIRADA", mensagem: "Pesquisa expirada — refaça a busca" };
  const pacote = c.pacotes.find((p) => p.id === pacoteId);
  if (!pacote) return { ok: false as const, erro: "FRT_PACOTE_NAO_ENCONTRADO", mensagem: "Pacote não encontrado" };

  const cacheado = c.aereos.get(pacoteId);
  if (cacheado && !recarregar) {
    return {
      ok: true as const,
      opcoes: cacheado,
      selecionado: c.aereoSelecionado.get(pacoteId) ?? null,
      diagnostico: { origem: "cache" as const, paineis: cacheado.length },
    };
  }

  const htmlPacote = htmlDoPacote(c.html, pacoteId) ?? c.html;
  const source = acharSourceAlterarVoo(htmlPacote);
  if (!source) {
    return {
      ok: false as const,
      erro: "FRT_ALTERAR_VOO_NAO_ENCONTRADO",
      mensagem: "Não encontrei o botão 'Alterar voo' deste pacote na resposta da FRT",
      log: frtTraceLog().slice(-30),
    };
  }

  try {
    const r = await frtComandoProduto(source, FRT_RENDER_AEREO);
    const { opcoes, diagnostico } = parseOpcoesAereas(r.body);
    if (!opcoes.length) {
      return {
        ok: false as const,
        erro: "FRT_AEREO_SEM_OPCOES",
        mensagem: "A FRT respondeu ao 'Alterar voo', mas nenhum painel rptAereoPesquisa:N foi reconhecido",
        diagnostico,
        log: frtTraceLog().slice(-30),
      };
    }
    c.aereos.set(pacoteId, opcoes);
    const jaAtiva = opcoes.find((o) => o.selecionado);
    if (jaAtiva) c.aereoSelecionado.set(pacoteId, jaAtiva.id);
    return {
      ok: true as const,
      opcoes,
      selecionado: c.aereoSelecionado.get(pacoteId) ?? null,
      diagnostico,
    };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return {
      ok: false as const,
      erro: err.code ?? "FRT_NETWORK_ERROR",
      mensagem: err.message ?? "Falha ao carregar as opções aéreas",
      log: frtTraceLog().slice(-30),
    };
  }
}

/** Seleciona a opção aérea escolhida e devolve o resumo/preço atualizados. */
export async function motorFrtSelecionarAereo(searchId: string, pacoteId: string, opcaoId: string) {
  const c = buscas.get(searchId);
  if (!c) return { ok: false as const, erro: "FRT_BUSCA_EXPIRADA", mensagem: "Pesquisa expirada — refaça a busca" };
  const opcoes = c.aereos.get(pacoteId) ?? [];
  const opcao = opcoes.find((o) => o.id === opcaoId);
  if (!opcao) return { ok: false as const, erro: "FRT_AEREO_NAO_ENCONTRADO", mensagem: "Opção aérea não encontrada" };
  if (!opcao.selectSource) {
    return {
      ok: false as const,
      erro: "FRT_AEREO_SEM_SOURCE",
      mensagem: "Esta opção não expôs o botão 'Selecionar' na resposta da FRT",
    };
  }

  try {
    const r = await frtComandoProduto(opcao.selectSource, FRT_RENDER_AEREO);
    const resumo = parseResumoPacote(r.body);
    c.aereoSelecionado.set(pacoteId, opcaoId);
    // Mantém o hotel escolhido e atualiza o preço do pacote com o do aéreo ativo.
    const pacote = c.pacotes.find((p) => p.id === pacoteId);
    if (pacote) {
      pacote.aereo = { ida: opcao.ida, volta: opcao.volta };
      if (resumo.precoPorPessoa != null) {
        pacote.preco.porPessoa = resumo.precoPorPessoa;
        pacote.preco.porPessoaFormatado = resumo.precoPorPessoaFormatado;
      } else if (opcao.preco.porPessoa != null) {
        pacote.preco.porPessoa = opcao.preco.porPessoa;
        pacote.preco.porPessoaFormatado = opcao.preco.porPessoaFormatado;
      }
      if (resumo.precoTotal != null) {
        pacote.preco.total = resumo.precoTotal;
        pacote.preco.totalFormatado = resumo.precoTotalFormatado;
      } else if (opcao.preco.total != null) {
        pacote.preco.total = opcao.preco.total;
        pacote.preco.totalFormatado = opcao.preco.totalFormatado;
      }
    }
    // Reflete o "ativo" nas opções em cache.
    c.aereos.set(
      pacoteId,
      opcoes.map((o) => ({ ...o, selecionado: o.id === opcaoId })),
    );
    return {
      ok: true as const,
      selecionado: opcaoId,
      resumo,
      pacote: pacote ?? null,
    };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return {
      ok: false as const,
      erro: err.code ?? "FRT_NETWORK_ERROR",
      mensagem: err.message ?? "Falha ao selecionar o voo",
      log: frtTraceLog().slice(-30),
    };
  }
}
