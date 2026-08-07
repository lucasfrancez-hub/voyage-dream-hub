/**
 * Server functions para o sistema de disparos em massa (broadcast).
 * Acesso restrito a admin e marketing.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureMarketing(ctx: { supabase: any; userId: string }): Promise<"admin" | "marketing"> {
  const { data: admin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (admin) return "admin";
  const { data: mkt } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "marketing" });
  if (mkt) return "marketing";
  throw new Error("Forbidden: apenas admin ou marketing");
}

export const broadcastMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (admin) return { role: "admin" as const };
    const { data: mkt } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "marketing" });
    if (mkt) return { role: "marketing" as const };
    return { role: null };
  });

// ==================== Pacotes prontos (para inserir em campanhas) ====================

export const listPacotesProntos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin?: string; destination?: string; search?: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    const { listBroadcastPackages } = await import("./package-message.server");
    const pacotes = await listBroadcastPackages(data);
    return { pacotes };
  });

// ==================== Destinos ====================

export const listDestinos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("wa_broadcast_destinos")
      .select("*")
      .order("tipo", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return { destinos: data ?? [] };
  });

export const syncDestinos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureMarketing(context);
    const { syncBroadcastDestinos } = await import("./sync.server");
    const counts = await syncBroadcastDestinos();
    return counts;
  });

export const adicionarDestinoPorLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { link: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    const { addBroadcastDestinoByLink } = await import("./sync.server");
    return await addBroadcastDestinoByLink(data.link);
  });

export const excluirDestino = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("wa_broadcast_destinos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateDestinoTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; tags: string[]; ativo?: boolean }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { tags: data.tags };
    if (typeof data.ativo === "boolean") patch.ativo = data.ativo;
    const { error } = await (supabaseAdmin.from("wa_broadcast_destinos") as unknown as { update: (p: unknown) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } }).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== Upload de mídia ====================

const PUBLIC_BASE = "https://pedidos.viaair.tur.br";

export const uploadBroadcastMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { filename: string; contentType: string; dataBase64: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    const clean = data.filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
    const ext = clean.includes(".") ? clean.split(".").pop() : "bin";
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

    const binary = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0));
    if (binary.byteLength > 25 * 1024 * 1024) throw new Error("Arquivo maior que 25MB");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("broadcast-media")
      .upload(path, binary, { contentType: data.contentType || "application/octet-stream", upsert: true });
    if (error) throw new Error(error.message);

    return { url: `${PUBLIC_BASE}/api/public/broadcast-media/${path}`, filename: clean };
  });

// ==================== Campanhas ====================

type BlocoInput = {
  tipo: "text" | "image" | "video" | "document" | "buttons";
  texto?: string | null;
  midia_url?: string | null;
  midia_filename?: string | null;
  midia_caption?: string | null;
  botoes?: unknown;
  scheduled_at?: string | null;
};


export const listCampanhas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("wa_broadcast_campanhas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { campanhas: data ?? [] };
  });

export const getCampanha = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [c, m, e] = await Promise.all([
      supabaseAdmin.from("wa_broadcast_campanhas").select("*").eq("id", data.id).maybeSingle(),
      supabaseAdmin.from("wa_broadcast_mensagens").select("*").eq("campanha_id", data.id).order("ordem"),
      supabaseAdmin.from("wa_broadcast_envios").select("id,destino_id,mensagem_id,status,error,sent_at,delivered_at,read_at").eq("campanha_id", data.id),
    ]);
    if (c.error) throw new Error(c.error.message);
    return { campanha: c.data, mensagens: m.data ?? [], envios: e.data ?? [] };
  });

export const salvarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    nome: string;
    destino_ids: string[];
    scheduled_at?: string | null;
    observacoes_marketing?: string | null;
    status?: "rascunho" | "agendada";
    mensagens: BlocoInput[];
  }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    if (!data.nome.trim()) throw new Error("Nome obrigatório");
    if (data.destino_ids.length === 0) throw new Error("Selecione ao menos um destino");
    if (data.mensagens.length === 0) throw new Error("Adicione ao menos uma mensagem");

    // Trava horário comercial 09:00-21:00 (Brasília) para agendamento
    if (data.status === "agendada" && data.scheduled_at) {
      const dt = new Date(data.scheduled_at);
      const hourBRT = Number(
        new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(dt),
      );
      if (hourBRT < 9 || hourBRT >= 21) {
        throw new Error("Só é permitido agendar entre 09:00 e 21:00 (horário de Brasília)");
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: destinosSelecionados, error: destinosError } = await supabaseAdmin
      .from("wa_broadcast_destinos")
      .select("id, tipo")
      .in("id", data.destino_ids);
    if (destinosError) throw new Error(destinosError.message);
    const somenteCanais =
      (destinosSelecionados?.length ?? 0) > 0 &&
      (destinosSelecionados ?? []).every((destino) => destino.tipo === "channel");
    const mensagens = somenteCanais
      ? data.mensagens.filter((mensagem) => mensagem.tipo !== "image" && mensagem.tipo !== "video")
      : data.mensagens;
    if (mensagens.length === 0) throw new Error("Adicione ao menos uma mensagem de texto para o canal");

    const payload = {
      nome: data.nome.trim(),
      destino_ids: data.destino_ids,
      scheduled_at: data.scheduled_at ?? null,
      observacoes_marketing: data.observacoes_marketing ?? null,
      status: data.status ?? "rascunho",
      criado_por: context.userId,
    };

    let campanhaId = data.id;
    if (campanhaId) {
      const { error } = await supabaseAdmin.from("wa_broadcast_campanhas").update(payload).eq("id", campanhaId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("wa_broadcast_mensagens").delete().eq("campanha_id", campanhaId);
    } else {
      const { data: novo, error } = await supabaseAdmin.from("wa_broadcast_campanhas").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      campanhaId = novo.id;
    }

    if (!campanhaId) throw new Error("Não foi possível salvar a campanha");

    const blocos = mensagens.map((m, i) => ({
      campanha_id: campanhaId,
      ordem: i,
      tipo: m.tipo,
      texto: m.texto ?? null,
      midia_url: m.midia_url ?? null,
      midia_filename: m.midia_filename ?? null,
      midia_caption: m.midia_caption ?? null,
      scheduled_at: m.scheduled_at ?? null,
      botoes: (m.botoes ?? null) as never,
    }));

    const { error: mErr } = await supabaseAdmin.from("wa_broadcast_mensagens").insert(blocos as never);
    if (mErr) throw new Error(mErr.message);

    return { id: campanhaId };
  });

export const cancelarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wa_broadcast_campanhas")
      .update({ status: "cancelada" })
      .eq("id", data.id)
      .in("status", ["rascunho", "agendada"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("wa_broadcast_campanhas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Dispara agora (envio imediato) — apenas admin
export const dispararAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const role = await ensureMarketing(context);
    if (role !== "admin") throw new Error("Apenas admin pode disparar imediatamente");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wa_broadcast_campanhas")
      .update({ status: "agendada", scheduled_at: new Date().toISOString(), aprovada_por: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== Publicar pacote no WhatsApp (imediato) ====================

/**
 * Envia a arte do pacote (feed 1080x1440) + texto para canais/grupos do WhatsApp
 * escolhidos na hora. Canais não aceitam mídia no disparo, então recebem só o
 * texto (o WhatsApp já gera o preview do link).
 */
export const enviarPacoteWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    destino_ids: string[];
    texto: string;
    slug?: string;
    imagem_base64?: string | null;
  }) => d)
  .handler(async ({ context, data }) => {
    await ensureMarketing(context);
    if (!data.destino_ids?.length) throw new Error("Selecione ao menos um canal ou grupo");
    if (!data.texto?.trim()) throw new Error("Escreva ou gere o texto antes de enviar");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendBroadcastBlock } = await import("./sync.server");

    let imagemUrl: string | null = null;
    if (data.imagem_base64) {
      const binary = Uint8Array.from(atob(data.imagem_base64), (c) => c.charCodeAt(0));
      if (binary.byteLength > 25 * 1024 * 1024) throw new Error("Arte maior que 25MB");
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabaseAdmin.storage
        .from("broadcast-media")
        .upload(path, binary, { contentType: "image/jpeg", upsert: true });
      if (error) throw new Error(error.message);
      imagemUrl = `${PUBLIC_BASE}/api/public/broadcast-media/${path}`;
    }

    const { data: destinos, error: dErr } = await supabaseAdmin
      .from("wa_broadcast_destinos")
      .select("id, nome, jid, tipo")
      .in("id", data.destino_ids);
    if (dErr) throw new Error(dErr.message);

    const texto = data.texto.trim();
    // Canal não aceita imagem + texto junto: manda só o texto e garante a URL do
    // pacote no final, para o WhatsApp montar o preview com a imagem.
    const link = data.slug ? `${PUBLIC_BASE}/w/${data.slug}` : null;
    const textoCanal = link && !texto.includes(link) ? `${texto}\n\n${link}` : texto;
    const resultados: Array<{ nome: string; ok: boolean; error?: string }> = [];

    for (const d of destinos ?? []) {
      const isCanal = d.tipo === "channel";
      const usaImagem = imagemUrl && !isCanal;
      const r = await sendBroadcastBlock(
        d.jid,
        usaImagem
          ? {
              tipo: "image",
              midia_url: imagemUrl,
              midia_filename: `${data.slug ?? "pacote"}.jpg`,
              midia_caption: texto,
            }
          : { tipo: "text", texto: isCanal ? textoCanal : texto },
      );

      resultados.push({ nome: d.nome ?? d.jid, ok: !!r.id, error: r.error ?? undefined });
      await new Promise((res) => setTimeout(res, 800));
    }

    return {
      enviados: resultados.filter((r) => r.ok).length,
      falhas: resultados.filter((r) => !r.ok),
      imagem_url: imagemUrl,
    };
  });
