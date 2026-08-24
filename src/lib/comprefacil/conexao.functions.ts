import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Status da conexão com a CompreFácil (não faz login). */
export const statusConexaoCompreFacil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { statusSessaoCompreFacil } = await import("@/lib/comprefacil/auth.server");
    return statusSessaoCompreFacil();
  });

/**
 * Conecta/reconecta na CompreFácil. Quando a operadora pede o código de dois
 * fatores, ele é lido automaticamente na caixa dedicada.
 */
export const conectarCompreFacil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { reconectarCompreFacil, statusSessaoCompreFacil } = await import(
      "@/lib/comprefacil/auth.server"
    );
    try {
      await reconectarCompreFacil();
      return { ok: true as const, mensagem: null, ...(await statusSessaoCompreFacil()) };
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha ao conectar na CompreFácil.";
      return {
        ok: false as const,
        mensagem,
        conectado: false,
        expiraEm: null,
        agenciaId: null,
        usuarioId: null,
      };
    }
  });
