/**
 * Versões PÚBLICAS (sem login) do motor de pacotes CompreFácil/FRT.
 *
 * Usadas no widget do site (embed) e nas páginas públicas. Devolvem apenas
 * dados de catálogo/tarifa — nada de dado de cliente.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { LocalidadeCF } from "./localidades.functions";

const aereo = z.object({
  origem: z.string().min(3).max(4),
  destino: z.string().min(3).max(4),
  ida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  volta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  adultos: z.number().int().min(1).max(9),
  criancas: z.number().int().min(0).max(8).optional(),
});

export const buscarAereoCFPublic = createServerFn({ method: "POST" })
  .inputValidator((i: z.input<typeof aereo>) => aereo.parse(i))
  .handler(async ({ data }) => {
    const { buscarAereoDinamicoCF } = await import("./dinamico.server");
    try {
      const ofertas = await buscarAereoDinamicoCF(data);
      return { ok: true as const, ofertas };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha na busca aérea", ofertas: [] };
    }
  });

const hosp = z.object({
  cidadeId: z.number().int().positive(),
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adultos: z.number().int().min(1).max(24),
  criancas: z.number().int().min(0).max(20).optional(),
  quartos: z
    .array(
      z.object({
        adultos: z.number().int().min(1).max(6),
        criancas: z.number().int().min(0).max(5),
        bebes: z.number().int().min(0).max(3),
        idades: z.array(z.number().int().min(0).max(17)).max(5),
      }),
    )
    .max(4)
    .optional(),
});

export const buscarHospedagemCFPublic = createServerFn({ method: "POST" })
  .inputValidator((i: z.input<typeof hosp>) => hosp.parse(i))
  .handler(async ({ data }) => {
    const { buscarHotelDinamicoCF } = await import("./dinamico.server");
    try {
      const hoteis = await buscarHotelDinamicoCF(data);
      return { ok: true as const, hoteis };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha na busca de hotéis", hoteis: [] };
    }
  });

const loc = z.object({
  termo: z.string().min(2).max(60),
  campo: z.enum(["destino", "saida"]).optional(),
});

/** Autocomplete público de cidades (somente catálogo de destinos). */
export const autocompleteLocalidadeCFPublic = createServerFn({ method: "POST" })
  .inputValidator((i: z.input<typeof loc>) => loc.parse(i))
  .handler(async ({ data }): Promise<LocalidadeCF[]> => {
    const termo = data.termo.trim();
    const campo = data.campo === "saida" ? "cidade_saida" : "cidade";
    const { cidadesOficiaisCF, semAcento } = await import("./localidades.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const alvo = semAcento(termo);

    const { data: linhas } = await supabaseAdmin
      .from("comprefacil_pacotes")
      .select(campo === "cidade" ? "cidade, cidade_id" : "cidade_saida")
      .eq("ativo", true)
      .limit(2000);

    const mapa = new Map<string, LocalidadeCF>();
    for (const l of ((linhas as any[]) ?? [])) {
      const nome: string | null = campo === "cidade" ? l.cidade : l.cidade_saida;
      if (!nome || !semAcento(nome).includes(alvo)) continue;
      const chave = semAcento(nome);
      const atual = mapa.get(chave);
      if (atual) {
        atual.total += 1;
        if (atual.cidadeId == null && campo === "cidade") atual.cidadeId = l.cidade_id ?? null;
      } else {
        mapa.set(chave, { nome, cidadeId: campo === "cidade" ? (l.cidade_id ?? null) : null, iata: null, total: 1 });
      }
    }

    try {
      const oficiais = await cidadesOficiaisCF();
      for (const c of oficiais) {
        if (!semAcento(c.nome).includes(alvo)) continue;
        const chave = semAcento(c.nome);
        const atual = mapa.get(chave);
        if (atual) {
          if (atual.cidadeId == null) atual.cidadeId = c.id;
          if (!atual.iata) atual.iata = c.iata;
        } else {
          mapa.set(chave, { nome: c.nome, cidadeId: c.id, iata: c.iata, total: 0 });
        }
      }
    } catch (e) {
      console.error("[comprefacil] cidades oficiais indisponíveis:", e instanceof Error ? e.message : e);
    }

    return [...mapa.values()]
      .sort((a, b) => {
        const pa = semAcento(a.nome).startsWith(alvo) ? 0 : 1;
        const pb = semAcento(b.nome).startsWith(alvo) ? 0 : 1;
        return pa - pb || b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR");
      })
      .slice(0, 12);
  });
