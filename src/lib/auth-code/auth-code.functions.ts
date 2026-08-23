import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão");
}

/** Estado da caixa de autenticação (nunca devolve o código completo). */
export const diagnosticoCodigosAuth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { diagnosticoCaixa } = await import("./service.server");
    return diagnosticoCaixa();
  });

/** Fornecedores cadastrados (para o seletor da tela de teste). */
export const listarProvedoresCodigo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { PROVEDORES_CODIGO } = await import("./providers");
    return PROVEDORES_CODIGO.map((p) => ({ id: p.id, nome: p.nome }));
  });

/**
 * Modo de teste: aguarda um e-mail novo com código e devolve só metadados
 * e os dois últimos dígitos.
 */
export const testarRecebimentoCodigo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        provider: z.string().min(1).default("generico"),
        timeoutSegundos: z.number().int().min(10).max(240).default(120),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { obterCodigoAutenticacao } = await import("./service.server");
    const r = await obterCodigoAutenticacao({
      provider: data.provider,
      timeoutMs: data.timeoutSegundos * 1000,
      requestedAt: new Date().toISOString(),
    });
    if (!r.success) {
      return { ok: false as const, authAttemptId: r.authAttemptId, erro: r.error };
    }
    // O código completo fica no backend; a tela só vê a máscara.
    return {
      ok: true as const,
      authAttemptId: r.authAttemptId,
      remetente: r.sender,
      assunto: r.subject,
      recebidoEm: r.receivedAt,
      codigoMascarado: r.codeMask,
    };
  });
