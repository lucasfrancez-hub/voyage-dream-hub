import type { EditairOp } from "./ops";
import type { GeracaoPedida, OpBruta, PlanoIa } from "./planner.functions";
import { gerarImagemEditair, criarVideoEditair, statusVideoEditair } from "./generate.functions";
import type { ProjectState } from "./types";

/**
 * Validação do plano da IA antes de encostar na timeline.
 * A IA propõe; o EditAir decide o que é aplicável (ids reais, números sãos).
 */

const OPS_VALIDAS = new Set([
  "create_track",
  "rename_track",
  "insert_clip",
  "split_clip",
  "trim_clip",
  "extend_clip",
  "restore_clip",
  "delete_range",
  "ripple_delete",
  "delete_clip",
  "move_clip",
  "remove_silences",
  "create_caption",
  "update_caption",
  "rebuild_captions",
  "remove_captions",
  "add_caption_style",
  "add_animation",
  "add_effect",
  "add_transition",
  "set_transform",
  "set_speed",
  "set_volume",
  "set_background",
  "delete_text_range",
  "mute_track",
  "add_text",
]);

/** Ops que só podem mexer em clipes que existem de verdade. */
const PRECISA_CLIP = new Set([
  "split_clip",
  "trim_clip",
  "extend_clip",
  "restore_clip",
  "delete_clip",
  "ripple_delete",
  "move_clip",
  "update_caption",
  "add_animation",
  "add_effect",
  "add_transition",
  "set_transform",
  "set_speed",
]);

export function validarOps(ops: OpBruta[], state: ProjectState, escopoClipId?: string | null): EditairOp[] {
  const ids = new Set(state.clips.map((c) => c.id));
  const out: EditairOp[] = [];
  for (const bruta of ops) {
    const nome = String(bruta.op ?? "");
    if (!OPS_VALIDAS.has(nome)) continue;
    const clipId = typeof bruta.clipId === "string" ? bruta.clipId : undefined;
    if (PRECISA_CLIP.has(nome)) {
      if (!clipId || !ids.has(clipId)) continue;
      // escopo "clipe": a IA não pode encostar em nenhum outro clipe
      if (escopoClipId && clipId !== escopoClipId) continue;
    }
    out.push(bruta as unknown as EditairOp);
  }
  return out;
}

/** Linhas do "Plano de edição" mostradas ao usuário antes de aplicar. */
export function resumoDoPlano(plano: PlanoIa): string[] {
  if (plano.resumo.length) return plano.resumo;
  const linhas: string[] = [];
  const conta = (op: string) => plano.ops.filter((o) => o.op === op).length;
  if (conta("remove_silences")) linhas.push("Remover pausas e dividir a fala em blocos");
  if (conta("split_clip")) linhas.push(`Criar ${conta("split_clip")} cortes`);
  if (conta("delete_range")) linhas.push(`Remover ${conta("delete_range")} trechos`);
  if (conta("rebuild_captions") || conta("create_caption")) linhas.push("Gerar legendas em camada própria");
  if (conta("create_track")) linhas.push(`Criar ${conta("create_track")} camada(s)`);
  if (conta("insert_clip")) linhas.push(`Inserir ${conta("insert_clip")} clipe(s)`);
  if (plano.geracoes.length) linhas.push(`Gerar ${plano.geracoes.length} cena(s) com IA`);
  return linhas.length ? linhas : ["Aplicar ajustes na timeline"];
}

/** Um plano é "grande" quando vale a pena pedir confirmação antes de aplicar. */
export function planoGrande(plano: PlanoIa) {
  return plano.ops.length > 2 || plano.geracoes.length > 0;
}

function dataUrlParaFile(dataUrl: string, nome: string): File {
  const [cabecalho, base64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(cabecalho)?.[1] ?? "application/octet-stream";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], nome, { type: mime });
}

export type GeracaoPronta = { pedido: GeracaoPedida; arquivo: File };

/**
 * Executa as gerações do plano. Cada resultado vira um ARQUIVO comum —
 * entra na Biblioteca e depois na timeline como clipe editável.
 */
export async function executarGeracoes(
  geracoes: GeracaoPedida[],
  opcoes: { vertical: boolean; aoProgredir?: (msg: string) => void },
): Promise<GeracaoPronta[]> {
  const prontas: GeracaoPronta[] = [];
  for (let i = 0; i < geracoes.length; i++) {
    const g = geracoes[i];
    opcoes.aoProgredir?.(`Gerando cena ${i + 1} de ${geracoes.length}…`);
    try {
      if (g.tipo === "imagem") {
        const { dataUrl } = await gerarImagemEditair({
          data: { prompt: g.prompt, formato: opcoes.vertical ? "vertical" : "horizontal" },
        });
        prontas.push({ pedido: g, arquivo: dataUrlParaFile(dataUrl, `ia-${Date.now()}-${i}.png`) });
      } else {
        const segundos = g.durationMs > 7000 ? "8" : g.durationMs > 5000 ? "6" : "4";
        const { id } = await criarVideoEditair({
          data: { prompt: g.prompt, segundos: segundos as "4" | "6" | "8", vertical: opcoes.vertical },
        });
        // geração de vídeo leva 1–3 min; a interface continua livre enquanto isso
        for (let tentativa = 0; tentativa < 60; tentativa++) {
          await new Promise((r) => setTimeout(r, 6000));
          const st = await statusVideoEditair({ data: { id } });
          if (st.status === "completed" && st.dataUrl) {
            prontas.push({ pedido: g, arquivo: dataUrlParaFile(st.dataUrl, `ia-${Date.now()}-${i}.mp4`) });
            break;
          }
          if (st.status === "failed") throw new Error(st.erro || "A geração de vídeo falhou.");
          opcoes.aoProgredir?.(`Gerando cena ${i + 1} de ${geracoes.length}… ${st.progresso || 0}%`);
        }
        if (!prontas.some((p) => p.pedido === g)) {
          throw new Error("A geração do vídeo excedeu o tempo de espera. Tente novamente em instantes.");
        }
      }
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha ao gerar a cena";
      opcoes.aoProgredir?.(mensagem);
      throw new Error(mensagem);
    }
  }
  return prontas;
}
