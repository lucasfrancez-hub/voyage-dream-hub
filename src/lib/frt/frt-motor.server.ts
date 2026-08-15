/**
 * CAMADA DE PRODUTO DO MOTOR FRT.
 *
 * Não duplica o conector: reaproveita sessão → autocomplete → itemSelect →
 * pesquisa já validados e apenas normaliza o pnlResultado em pacotes.
 * O HTML bruto (~1,3 MB) fica no servidor; o cliente recebe só o normalizado,
 * primeiro os hotéis e, sob demanda, o aéreo daquele pacote.
 */
import { consultarFRT, frtUltimoResultadoBruto, frtTraceLog } from "./frt-connector.server";
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
  buscas.set(id, { id, em: Date.now(), input, pacotes, diagnostico });

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
