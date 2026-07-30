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
  .inputValidator((d: { id: string; date?: string; time?: string; channel?: string }) => d)
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

    // Overrides do usuário têm precedência; senão usa o sugerido pela IA.
    const finalTime = data.time || sug.suggested_time || "10:00";
    const finalDay = data.date || sug.suggested_day || "";
    const [hh, mm] = String(finalTime).split(":").map(Number);
    const suggestedDay = String(finalDay);
    const now = new Date();
    const brazilCalendar = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const allowedDays = suggestedDay.toLowerCase().includes("terça")
      ? [2, 4]
      : suggestedDay.toLowerCase().includes("quarta")
        ? [3, 5]
        : [1, 2, 3, 4, 5];
    let scheduled: Date | null = /^\d{4}-\d{2}-\d{2}$/.test(suggestedDay)
      ? new Date(`${suggestedDay}T${String(hh || 10).padStart(2, "0")}:${String(mm || 0).padStart(2, "0")}:00-03:00`)
      : null;

    if (!scheduled || scheduled.getTime() < now.getTime() + 30 * 60 * 1000) {
      scheduled = null;
      for (let offset = 0; offset <= 14; offset++) {
        const day = new Date(brazilCalendar);
        day.setUTCDate(day.getUTCDate() + offset);
        if (!allowedDays.includes(day.getUTCDay())) continue;
        const isoDay = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
        const candidate = new Date(`${isoDay}T${String(hh || 10).padStart(2, "0")}:${String(mm || 0).padStart(2, "0")}:00-03:00`);
        if (candidate.getTime() >= now.getTime() + 30 * 60 * 1000) {
          scheduled = candidate;
          break;
        }
      }
    }
    if (!scheduled) throw new Error("Não foi possível calcular a data sugerida");

    const canal = data.channel || (sug.suggested_channels as string[])[0] || "whatsapp";

    // Destinos: já deixa marcados os canais/grupos de WhatsApp ativos
    const { data: destinosDisponiveis } = await supabaseAdmin
      .from("wa_broadcast_destinos")
      .select("id, tipo, ativo");
    const destinos = (destinosDisponiveis ?? []).filter(
      (d: { tipo: string; ativo?: boolean | null }) =>
        (d.tipo === "channel" || d.tipo === "group") && d.ativo !== false,
    ) as { id: string; tipo: string }[];
    const destinoIds = destinos.map((d) => d.id);
    const somenteCanais = destinos.length > 0 && destinos.every((d) => d.tipo === "channel");

    // Mensagem no mesmo formato do botão "Pacote pronto" (legenda completa + imagem)
    const { buildBroadcastPackageMessage } = await import("./package-message.server");
    const msg = await buildBroadcastPackageMessage(pkg.id);
    const linkPacote = `https://pedidos.viaair.tur.br/w/${pkg.slug}`;
    const caption = msg?.caption || `✈️ *${pkg.title}*\n\n${sug.reasoning}\n\nConfira: ${linkPacote}`;
    const usaImagem = Boolean(msg?.image_url) && !somenteCanais;

    const nome = `[Sugestão IA] ${sug.origin} → ${sug.destination}`;

    const { data: camp, error: campErr } = await supabaseAdmin
      .from("wa_broadcast_campanhas")
      .insert({
        nome,
        status: destinoIds.length > 0 ? "agendada" : "rascunho",
        scheduled_at: scheduled.toISOString(),
        destino_ids: destinoIds,
        observacoes_marketing: `Canal sugerido: ${canal}. Pacote: ${pkg.title} (/${pkg.slug}). Motivo: ${sug.reasoning}`,
        criado_por: context.userId,
        aprovada_por: context.userId,
      })
      .select("id")
      .single();
    if (campErr) throw new Error(campErr.message);

    await supabaseAdmin.from("wa_broadcast_mensagens").insert(
      usaImagem
        ? {
            campanha_id: camp.id,
            ordem: 0,
            tipo: "image",
            midia_url: msg!.image_url,
            midia_caption: caption,
          }
        : {
            campanha_id: camp.id,
            ordem: 0,
            tipo: "text",
            texto: caption,
          },
    );

    await supabaseAdmin
      .from("broadcast_suggestions")
      .update({ status: "approved", campaign_id: camp.id, approved_by: context.userId })
      .eq("id", data.id);

    return { ok: true, campaign_id: camp.id, agendada: destinoIds.length > 0 };
  });
