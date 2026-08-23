/**
 * Converte uma reserva da consolidadora no formato do documento
 * (Plano de Viagem / Bilhete Eletrônico) da VIA AIR.
 */
import type {
  ComprovanteReservaDados,
  ComprovanteVoo,
} from "@/components/passhub/ComprovanteReserva";
import type { PassHubReservaLista } from "./types";

function tituloGrupo(indice: number, total: number, temVolta: boolean): string {
  if (total <= 1) return "IDA";
  if (total === 2 && temVolta) return indice === 0 ? "IDA" : "VOLTA";
  return `TRECHO ${indice + 1}`;
}

export function reservaEmitida(r: PassHubReservaLista): boolean {
  return (
    Boolean(r.emitidaEm) ||
    ["ISSUED", "EMITIDA", "EMITIDO"].includes((r.status || "").toUpperCase())
  );
}

export function paraComprovante(r: PassHubReservaLista): ComprovanteReservaDados {
  const emitido = reservaEmitida(r);

  const grupos = (r.segmentos ?? []).map((s, i) => {
    const bagagem = {
      itemPessoal: true,
      mao: s.bagagemMao,
      despachada: s.bagagemDespachada,
      despachadaQtd: s.bagagemDespachadaQtd,
    };
    const conexoes = s.conexoes?.length
      ? s.conexoes
      : [
          {
            origem: s.origem,
            destino: s.destino,
            partida: s.partida,
            chegada: s.chegada,
            duracao: s.duracao,
            numeroVoo: "",
            familiaTarifaria: "",
            classe: "",
            companhia: r.companhia,
          },
        ];
    const voos: ComprovanteVoo[] = conexoes.map((c) => ({
      companhia: c.companhia || r.companhia,
      numeroVoo: c.numeroVoo,
      origem: c.origem,
      destino: c.destino,
      partida: c.partida,
      chegada: c.chegada,
      duracao: c.duracao,
      classe: c.classe,
      familiaTarifaria: c.familiaTarifaria,
      bagagem,
    }));
    return {
      titulo: tituloGrupo(i, (r.segmentos ?? []).length, Boolean(r.dataVolta)),
      voos,
    };
  });

  return {
    emitido,
    localizador: r.localizador || String(r.idPassagem),
    localizadorCompanhia: r.localizadorCompanhia,
    companhia: r.companhia,
    criadaEm: r.criadaEm,
    consultor: r.emissor,
    origem: r.origem,
    destino: r.destino,
    limiteEmissao: r.limiteEmissao,
    total: r.totalVenda || r.preco,
    passageiros: (r.passageirosDetalhe?.length
      ? r.passageirosDetalhe.map((p) => ({
          nome: p.nome,
          tipo: p.tipo,
          documento: p.documento,
          documentoTipo: p.documentoTipo,
          nascimento: p.nascimento,
        }))
      : (r.passageiros ?? []).map((nome) => ({ nome, tipo: "ADT" }))
    ).map((p) => ({ ...p })),
    grupos,
  };
}

const soLetras = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();

/** Aplica os números de bilhete lidos do PDF aos passageiros do documento. */
export function comBilhetes(
  dados: ComprovanteReservaDados,
  numeros: { passageiro: string; numero: string }[],
  emissao?: string | null,
): ComprovanteReservaDados {
  if (!numeros.length) return dados;
  const restantes = [...numeros];
  const passageiros = dados.passageiros.map((p) => {
    const alvo = soLetras(p.nome);
    let idx = restantes.findIndex((n) => {
      const c = soLetras(n.passageiro);
      return c === alvo || (c.length > 3 && (alvo.includes(c) || c.includes(alvo)));
    });
    if (idx < 0 && restantes.length === dados.passageiros.length) idx = 0;
    if (idx < 0) return p;
    const [achado] = restantes.splice(idx, 1);
    return { ...p, bilhete: achado?.numero ?? p.bilhete, emissao: emissao ?? p.emissao ?? null };
  });
  return { ...dados, passageiros };
}
