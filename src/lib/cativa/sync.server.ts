import { baixarPlanilha } from "./sheets.server";
import { normalizarLinha } from "./normalize.server";
import { CAMPOS_COMERCIAIS, CAMPOS_QUE_EXIGEM_INFOTRAVEL, type CativaFonte, type CativaPacoteNormalizado } from "./types";

export const FONTES: CativaFonte[] = ["tradicionais", "eventos", "internacionais"];

/** Dias até revalidar os voos de um pacote ativo sem alterações. */
const REVALIDAR_VOOS_DIAS = 7;

type Resultado = {
  linhas: number;
  novos: number;
  alterados: number;
  inalterados: number;
  removidos: number;
  agendados_infotravel: number;
  evitados_infotravel: number;
};

function comparavel(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function diffComercial(anterior: Record<string, unknown>, novo: CativaPacoteNormalizado) {
  const mudancas: Array<{ campo: string; anterior: string; novo: string }> = [];
  for (const campo of CAMPOS_COMERCIAIS) {
    const a = comparavel(anterior[campo]);
    const b = comparavel((novo as unknown as Record<string, unknown>)[campo]);
    if (a !== b) mudancas.push({ campo, anterior: a.slice(0, 500), novo: b.slice(0, 500) });
  }
  return mudancas;
}

/**
 * Sincroniza as planilhas com o banco.
 * Só agenda consulta na Infotravel quando o pacote é novo, o token mudou,
 * um dado comercial relevante mudou, ou passou o prazo de revalidação.
 */
export async function sincronizarPlanilhas(fontes: CativaFonte[] = FONTES): Promise<Resultado> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const res: Resultado = {
    linhas: 0,
    novos: 0,
    alterados: 0,
    inalterados: 0,
    removidos: 0,
    agendados_infotravel: 0,
    evitados_infotravel: 0,
  };

  const agora = new Date().toISOString();
  const vistos = new Set<string>();

  for (const fonte of fontes) {
    const linhas = await baixarPlanilha(fonte);
    const normalizados: CativaPacoteNormalizado[] = [];
    for (const l of linhas) {
      const n = normalizarLinha(fonte, l);
      if (n) normalizados.push(n);
    }
    res.linhas += normalizados.length;

    // uma linha por fingerprint (a planilha pode repetir)
    const porFingerprint = new Map<string, CativaPacoteNormalizado>();
    for (const n of normalizados) porFingerprint.set(n.fingerprint, n);

    const fingerprints = [...porFingerprint.keys()];
    const existentes = new Map<string, any>();
    for (let i = 0; i < fingerprints.length; i += 500) {
      const { data } = await supabaseAdmin
        .from("cativa_pacotes")
        .select("*")
        .eq("fonte", fonte)
        .in("fingerprint", fingerprints.slice(i, i + 500));
      for (const row of data ?? []) existentes.set((row as any).fingerprint, row);
    }

    for (const n of porFingerprint.values()) {
      vistos.add(n.fingerprint);
      const atual = existentes.get(n.fingerprint);

      const payload: Record<string, unknown> = {
        ...n,
        outras_datas: n.outras_datas,
        status: "ativo",
        visto_em: agora,
      };

      if (!atual) {
        const { data: inserido } = await supabaseAdmin
          .from("cativa_pacotes")
          .insert({ ...payload, voos_status: "pendente", voos_prioridade: 10, voos_proxima_em: agora } as any)
          .select("id")
          .maybeSingle();
        res.novos++;
        res.agendados_infotravel++;
        if (inserido) {
          await supabaseAdmin.from("cativa_pacote_historico").insert({
            pacote_id: (inserido as any).id,
            tipo: "novo",
          } as any);
        }
        continue;
      }

      if (atual.content_hash === n.content_hash && atual.status === "ativo") {
        await supabaseAdmin.from("cativa_pacotes").update({ visto_em: agora } as any).eq("id", atual.id);
        res.inalterados++;
        res.evitados_infotravel++;
        continue;
      }

      const mudancas = diffComercial(atual, n);
      const tokenMudou = (atual.token_infotravel ?? "") !== (n.token_infotravel ?? "");
      const precisaVoos = tokenMudou || mudancas.some((m) => (CAMPOS_QUE_EXIGEM_INFOTRAVEL as string[]).includes(m.campo));

      await supabaseAdmin
        .from("cativa_pacotes")
        .update({
          ...payload,
          ...(precisaVoos
            ? {
                voos_status: "pendente",
                voos_prioridade: tokenMudou ? 20 : 40,
                voos_proxima_em: agora,
                voos_tentativas: 0,
              }
            : {}),
        } as any)
        .eq("id", atual.id);

      res.alterados++;
      if (precisaVoos) res.agendados_infotravel++;
      else res.evitados_infotravel++;

      if (mudancas.length) {
        await supabaseAdmin.from("cativa_pacote_historico").insert(
          mudancas.slice(0, 20).map((m) => ({
            pacote_id: atual.id,
            tipo: atual.status !== "ativo" ? "reativado" : "alterado",
            campo: m.campo,
            valor_anterior: m.anterior,
            valor_novo: m.novo,
          })) as any,
        );
      }
    }

    // sumiu da planilha => esgotado (nunca apaga)
    const { data: ativos } = await supabaseAdmin
      .from("cativa_pacotes")
      .select("id, fingerprint")
      .eq("fonte", fonte)
      .eq("status", "ativo");
    const sumidos = (ativos ?? []).filter((p: any) => !vistos.has(p.fingerprint));
    for (let i = 0; i < sumidos.length; i += 200) {
      const lote = sumidos.slice(i, i + 200);
      await supabaseAdmin
        .from("cativa_pacotes")
        .update({ status: "esgotado" } as any)
        .in("id", lote.map((p: any) => p.id));
      await supabaseAdmin.from("cativa_pacote_historico").insert(
        lote.map((p: any) => ({ pacote_id: p.id, tipo: "esgotado" })) as any,
      );
      res.removidos += lote.length;
    }
  }

  // revalidação por idade (só pacotes ativos e antigos)
  const limite = new Date(Date.now() - REVALIDAR_VOOS_DIAS * 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("cativa_pacotes")
    .update({ voos_status: "pendente", voos_prioridade: 80, voos_proxima_em: new Date().toISOString() } as any)
    .eq("status", "ativo")
    .eq("voos_status", "ok")
    .lt("voos_atualizado_em", limite);

  return res;
}
