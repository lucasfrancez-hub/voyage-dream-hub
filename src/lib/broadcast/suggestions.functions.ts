/**
 * Server functions da tela de sugestões de broadcast.
 * Acesso: admin ou marketing.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureMarketing(ctx: { supabase: any; userId: string }) {
  const { data: admin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (admin) return;
  const { data: mkt } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "marketing" });
  if (!mkt) throw new Error("Forbidden: apenas admin ou marketing");
}

export const listSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("broadcast_suggestions")
      .select("id, origin, destination, package_id, suggested_channels, suggested_time, suggested_day, reasoning, status, campaign_id, created_at, packages(id, slug, title, image_url, price_per_person, going_date, nights)")
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { suggestions: data ?? [] };
  });

export const gerarSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureMarketing(context);
    const { generateBroadcastSuggestions } = await import("./suggestions.server");
    return await generateBroadcastSuggestions(context.userId);
  });

export const descartarSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("broadcast_suggestions")
      .update({ status: "dismissed" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Aprova a sugestão criando uma campanha rascunho com o pacote associado.
 * A campanha entra em `/chat/broadcast` pra você agendar destinos e revisar.
 */
export const aprovarSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sug, error: sugErr } = await supabaseAdmin
      .from("broadcast_suggestions")
      .select("*, packages(id, slug, title)")
      .eq("id", data.id)
      .maybeSingle();
    if (sugErr) throw new Error(sugErr.message);
    if (!sug) throw new Error("Sugestão não encontrada");
    if (sug.status !== "pending") throw new Error("Sugestão já foi processada");

    const pkg = sug.packages as { id: string; slug: string; title: string } | null;
    if (!pkg) throw new Error("Pacote da sugestão foi removido");

    // Calcula scheduled_at pro próximo horário sugerido (dia útil mais próximo às HH:mm)
    const [hh, mm] = String(sug.suggested_time || "10:00").split(":").map(Number);
    const scheduled = new Date();
    scheduled.setHours(hh || 10, mm || 0, 0, 0);
    if (scheduled.getTime() < Date.now() + 30 * 60 * 1000) {
      // Se já passou (ou faltam <30min), joga pra amanhã
      scheduled.setDate(scheduled.getDate() + 1);
    }
    // Pula domingo
    if (scheduled.getDay() === 0) scheduled.setDate(scheduled.getDate() + 1);

    const canal = (sug.suggested_channels as string[])[0] || "whatsapp";
    const nome = `[Sugestão IA] ${sug.origin} → ${sug.destination}`;

    const { data: camp, error: campErr } = await supabaseAdmin
      .from("wa_broadcast_campanhas")
      .insert({
        nome,
        status: "rascunho",
        scheduled_at: scheduled.toISOString(),
        destino_ids: [],
        observacoes_marketing: `Canal sugerido: ${canal}. Pacote: ${pkg.title} (/${pkg.slug}). Motivo: ${sug.reasoning}`,
        criado_por: context.userId,
        aprovada_por: context.userId,
      })
      .select("id")
      .single();
    if (campErr) throw new Error(campErr.message);

    // Mensagem inicial referenciando o pacote — o usuário revisa/edita em /chat/broadcast
    const linkPacote = `https://pedidos.viaair.tur.br/pacotes/${pkg.slug}`;
    await supabaseAdmin.from("wa_broadcast_mensagens").insert({
      campanha_id: camp.id,
      ordem: 0,
      tipo: "text",
      texto: `✈️ *${pkg.title}*\n\n${sug.reasoning}\n\nConfira: ${linkPacote}`,
    });

    await supabaseAdmin
      .from("broadcast_suggestions")
      .update({ status: "approved", campaign_id: camp.id, approved_by: context.userId })
      .eq("id", data.id);

    return { ok: true, campaign_id: camp.id };
  });
