import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function exigirAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

/** Reserva de verdade na operadora CompreFácil/FRT (orçamento → consultor → pax → PNR). */
export const reservarPacoteFRT = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      aereo?: { token: string; indice: number } | null;
      hotel?: { token: string; indice: number; quartoIndice?: number | null } | null;
      quartos?: { adultos: number; criancas?: number; bebes?: number; idades?: number[] }[] | null;

      consultorId?: number | null;
      observacao?: string | null;
      passageiros: {
        nome: string;
        sobrenome: string;
        nascimento?: string | null;
        sexo?: "M" | "F" | null;
        cpf?: string | null;
        documento?: string | null;
        email?: string | null;
        telefone?: string | null;
        tipo?: 0 | 1 | 2;
        idade?: number | null;
        quarto?: number;

      }[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { reservarNaFRT } = await import("./reserva.server");
    try {
      return await reservarNaFRT(data);
    } catch (e) {
      return {
        ok: false,
        orcamentoId: null,
        localizadorAereo: null,
        localizadorHotel: null,
        limiteEmissao: null,
        passos: [{ passo: "Reserva", ok: false, detalhe: e instanceof Error ? e.message : "Falha inesperada" }],
      };
    }
  });
