import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Diagnóstico: lê na UazAPI a configuração atual de webhooks da instância,
 * para conferir se eventos de mensagens (inclusive enviadas pelo celular)
 * estão habilitados.
 */
export const uazDiagnosticarWebhook = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const base = (process.env.UAZAPI_URL ?? "").replace(/\/+$/, "");
    const token = process.env.UAZAPI_TOKEN ?? "";
    if (!base || !token) return { ok: false as const, erro: "Credenciais UazAPI ausentes" };

    const tentativas = ["/webhook", "/instance/webhook", "/instance/info", "/instance/status"];
    const resultados: Record<string, unknown> = {};
    for (const path of tentativas) {
      try {
        const res = await fetch(`${base}${path}`, { headers: { token } });
        const texto = await res.text();
        resultados[path] = { status: res.status, corpo: texto.slice(0, 3000) };
      } catch (e) {
        resultados[path] = { erro: e instanceof Error ? e.message : String(e) };
      }
    }
    return { ok: true as const, resultados };
  });
