/**
 * Server functions dos documentos públicos (fora do painel admin):
 * geração do link assinado (autenticado) e leitura pública por token.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tipoSchema = z.enum(["reserva", "bilhete", "pedido"]);

/** Gera o caminho público assinado do documento (para abrir/compartilhar). */
export const criarLinkComprovante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tipo: tipoSchema, id: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { assinarDoc } = await import("./comprovante.server");
    const token = await assinarDoc(data.tipo, data.id);
    return { ok: true as const, caminho: `/doc/${data.tipo}/${data.id}?t=${token}` };
  });

/** Leitura pública do documento — exige o token assinado do link. */
export const comprovantePublico = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ tipo: tipoSchema, id: z.string().min(1).max(64), token: z.string().min(8).max(64) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { tokenValido, carregarDocPublico } = await import("./comprovante.server");
    if (!(await tokenValido(data.tipo, data.id, data.token))) {
      return { ok: false as const, erro: "Link inválido ou expirado." };
    }
    try {
      return { ok: true as const, dados: await carregarDocPublico(data.tipo, data.id) };
    } catch (e) {
      return {
        ok: false as const,
        erro: e instanceof Error ? e.message : "Não foi possível carregar o documento.",
      };
    }
  });
