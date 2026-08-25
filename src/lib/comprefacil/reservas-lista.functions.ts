import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReservaFrtLinha = {
  id: string;
  orcamentoId: number;
  localizadorAereo: string | null;
  localizadorHotel: string | null;
  limiteEmissao: string | null;
  prazoPagamento: string | null;
  status: string;
  criadaEm: string;
  passageiros: string[];
  passos: { passo: string; ok: boolean; detalhe?: string | null }[];
};

/** Reservas feitas na operadora FRT/CompreFácil (pacotes), para aparecerem nos Pedidos. */
export const listarReservasFRT = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("frt_reservas")
      .select("id, orcamento_id, localizador_aereo, localizador_hotel, limite_emissao, status, detalhes, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return { ok: false as const, erro: error.message, reservas: [] as ReservaFrtLinha[] };

    const reservas: ReservaFrtLinha[] = (data ?? []).map((r) => {
      const det = (r.detalhes ?? {}) as {
        passos?: { passo: string; ok: boolean; detalhe?: string | null }[];
        passageiros?: { nome?: string; sobrenome?: string }[];
        prazo_pagamento?: string | null;
      };
      return {
        id: r.id,
        orcamentoId: Number(r.orcamento_id),
        localizadorAereo: r.localizador_aereo,
        localizadorHotel: r.localizador_hotel,
        limiteEmissao: r.limite_emissao,
        prazoPagamento: det.prazo_pagamento ?? null,
        status: r.status,
        criadaEm: r.created_at,
        passageiros: (det.passageiros ?? [])
          .map((p) => `${p.nome ?? ""} ${p.sobrenome ?? ""}`.trim())
          .filter(Boolean),
        passos: det.passos ?? [],
      };
    });

    return { ok: true as const, reservas };
  });
