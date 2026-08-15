/**
 * RESGATE DETERMINÍSTICO DO SETOR AÉREO.
 *
 * Regra de negócio: transferir pro setor aéreo NÃO PODE FALHAR. Quando o
 * especialista roda e não produz texto (modelo devolveu vazio depois de a
 * pesquisa ser bloqueada por falta de dado, por exemplo), o atendimento
 * morria em silêncio e o watchdog acabava jogando o cliente pro Comercial com
 * a mensagem de "instabilidade" — sem o setor aéreo nunca ter falado.
 *
 * Aqui montamos, sem IA, a pergunta que o especialista deveria ter feito.
 */
import { safeMissingOriginResponse } from "./airflow-guard";

export type ToolResultLike = { toolName: string; output?: unknown };

type BuscaBloqueada = {
  faltam_dados?: boolean;
  dados_invalidos?: boolean;
  campos_faltando?: string[];
  ok?: boolean;
};

/** Campos que a pesquisa exige, na ordem em que perguntamos ao cliente. */
const PERGUNTA_POR_CAMPO: Array<{ campo: RegExp; pergunta: string }> = [
  { campo: /origem/i, pergunta: "De qual cidade você pretende embarcar?" },
  { campo: /destino/i, pergunta: "Para qual cidade você quer viajar?" },
  { campo: /data_volta/i, pergunta: "Qual a data da volta?" },
  { campo: /data/i, pergunta: "Qual a data da ida?" },
  { campo: /(adulto|crian|beb|pax|passageir)/i, pergunta: "Quantas pessoas vão viajar?" },
  { campo: /tipo_trecho/i, pergunta: "É só ida ou ida e volta?" },
];

/** Extrai os campos que faltaram na última chamada de pesquisa bloqueada. */
export function camposFaltandoNaPesquisa(
  steps: Array<{ toolResults?: ToolResultLike[] }> | undefined,
): string[] {
  const saidas = (steps ?? [])
    .flatMap((s) => s.toolResults ?? [])
    .filter((tr) => tr.toolName === "pesquisar_passagens")
    .map((tr) => tr.output as BuscaBloqueada | undefined)
    .filter((o): o is BuscaBloqueada => !!o && o.ok === false);
  const ultima = saidas[saidas.length - 1];
  if (!ultima || !(ultima.faltam_dados || ultima.dados_invalidos)) return [];
  return (ultima.campos_faltando ?? []).map(String);
}

/**
 * Mensagem de resgate do especialista aéreo — nunca devolve string vazia
 * quando o produto é aéreo: no pior caso pergunta a origem.
 */
export function respostaDeResgateAerea(params: {
  campos: string[];
  clientName?: string | null;
  origemSugerida?: string | null;
  origemFaltando: boolean;
  semSaudacao: boolean;
}): string {
  const campos = params.campos.filter(Boolean);
  const perguntas: string[] = [];
  for (const { campo, pergunta } of PERGUNTA_POR_CAMPO) {
    if (campos.some((c) => campo.test(c)) && !perguntas.includes(pergunta)) perguntas.push(pergunta);
  }
  const pedeOrigem = params.origemFaltando || perguntas[0] === PERGUNTA_POR_CAMPO[0]!.pergunta;
  if (pedeOrigem) {
    const origem = safeMissingOriginResponse(params.clientName, params.origemSugerida, {
      semSaudacao: params.semSaudacao,
    });
    const outras = perguntas.filter((p) => p !== PERGUNTA_POR_CAMPO[0]!.pergunta).slice(0, 1);
    return [origem, ...outras].join("\n\n");
  }
  if (perguntas.length) return perguntas.slice(0, 2).join("\n\n");
  // Sem pista nenhuma: pergunta a origem em vez de ficar em silêncio.
  return safeMissingOriginResponse(params.clientName, params.origemSugerida, {
    semSaudacao: params.semSaudacao,
  });
}
