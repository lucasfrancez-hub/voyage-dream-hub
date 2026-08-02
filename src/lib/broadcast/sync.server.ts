/**
 * broadcastService — ÚNICO módulo autorizado a falar com a UazAPI.
 * Escopo: broadcast/disparo em massa (grupos, canais/newsletters, campanhas
 * e comunicações programadas). Sincroniza grupos e canais da linha comercial.
 *
 * ⛔ PROIBIDO usar qualquer função deste arquivo no fluxo do chatbot
 * (recebimento, respostas, mídias, cards, transferência, status de conversa).
 * O chatbot usa exclusivamente a Meta Cloud API em `@/lib/whatsapp/send.server`.
 * Guarda automática: `npm run check:whatsapp`.
 * SERVER-ONLY.
 */


type SyncCounts = { groups: number; channels: number };

async function uazPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const base = process.env.UAZAPI_URL!.replace(/\/+$/, "");
  const token = process.env.UAZAPI_TOKEN!;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`UazAPI ${path} ${res.status}: ${raw.slice(0, 200)}`);
  try { return JSON.parse(raw); } catch { return null; }
}

function pick<T = unknown>(obj: unknown, ...keys: string[]): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k] as T;
  return undefined;
}

function toArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    for (const k of ["groups", "chats", "data", "response", "channels", "newsletters", "list"]) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
  }
  return [];
}

export async function syncBroadcastDestinos(): Promise<SyncCounts> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const counts: SyncCounts = { groups: 0, channels: 0 };
  const now = new Date().toISOString();

  // ==== Grupos ====
  try {
    const raw = await uazPost("/group/list", {});
    const list = toArray(raw);
    for (const g of list) {
      const jid = pick<string>(g, "jid", "id", "chatid");
      if (!jid || !jid.includes("@g.us")) continue;
      const nome = pick<string>(g, "name", "subject", "title") ?? "Grupo";
      const foto = pick<string>(g, "picture", "imageurl", "profilePicUrl");
      const parts = pick<number>(g, "size", "participantsCount", "membersCount") ?? null;
      const isAdmin = Boolean(pick(g, "isAdmin", "iAmAdmin", "youAreAdmin"));
      await supabaseAdmin.from("wa_broadcast_destinos").upsert(
        {
          jid,
          tipo: "group",
          nome,
          foto_url: foto ?? null,
          participantes: parts,
          is_admin: isAdmin,
          pode_postar: true,
          ultima_sync: now,
        },
        { onConflict: "jid" },
      );
      counts.groups += 1;
    }
  } catch (err) {
    console.error("[broadcast/sync] grupos:", err);
  }

  // ==== Canais / Newsletters ====
  for (const path of ["/channel/list", "/newsletter/list"]) {
    try {
      const raw = await uazPost(path, {});
      const list = toArray(raw);
      for (const c of list) {
        const jid = pick<string>(c, "jid", "id", "chatid");
        if (!jid) continue;
        if (!(jid.includes("@newsletter") || jid.includes("@broadcast") || jid.includes("channel"))) continue;
        const nome = pick<string>(c, "name", "subject", "title") ?? "Canal";
        const foto = pick<string>(c, "picture", "imageurl", "profilePicUrl");
        const parts = pick<number>(c, "subscribers", "membersCount", "size") ?? null;
        const isAdmin = Boolean(pick(c, "isAdmin", "isOwner", "youAreAdmin", "iAmOwner"));
        await supabaseAdmin.from("wa_broadcast_destinos").upsert(
          {
            jid,
            tipo: "channel",
            nome,
            foto_url: foto ?? null,
            participantes: parts,
            is_admin: isAdmin,
            pode_postar: isAdmin,
            ultima_sync: now,
          },
          { onConflict: "jid" },
        );
        counts.channels += 1;
      }
      if (counts.channels > 0) break; // primeiro endpoint que retornou dados
    } catch (err) {
      console.warn("[broadcast/sync] canais", path, ":", err);
    }
  }

  return counts;
}

// ============================================================================
// Adicionar destino por link (grupo ou canal)
// ============================================================================

type AddResult = { destino: { jid: string; tipo: "group" | "channel"; nome: string; foto_url: string | null; participantes: number | null; is_admin: boolean } };

/**
 * Aceita link de grupo (https://chat.whatsapp.com/CODE) ou canal
 * (https://whatsapp.com/channel/CODE). Faz join/follow via UazAPI e
 * upserta em wa_broadcast_destinos.
 */
export async function addBroadcastDestinoByLink(link: string): Promise<AddResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const raw = link.trim();
  if (!raw) throw new Error("Link vazio");

  // ---- Grupo ----
  const groupMatch = raw.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,})/i);
  if (groupMatch) {
    const invitecode = groupMatch[1];
    const joined = (await uazPost("/group/join", { invitecode: raw })) as {
      response?: string;
      group?: Record<string, unknown>;
      error?: string;
    } | null;
    // A resposta pode vir com o grupo ou vazia se já era membro. Buscamos
    // sempre o info depois pra ter dados frescos.
    let g: Record<string, unknown> | undefined = joined?.group;
    if (!g) {
      // inviteInfo aceita o código
      try {
        const info = (await uazPost("/group/inviteInfo", { invitecode })) as { response?: Record<string, unknown>; group?: Record<string, unknown> } | null;
        g = info?.group ?? info?.response;
      } catch { /* noop */ }
    }
    const jid = pick<string>(g, "jid", "id", "chatid");
    if (!jid) throw new Error(`Não consegui entrar no grupo (${joined?.error ?? "resposta sem jid"})`);
    const nome = pick<string>(g, "name", "subject", "title") ?? "Grupo";
    const foto = pick<string>(g, "picture", "imageurl", "profilePicUrl") ?? null;
    const parts = pick<number>(g, "size", "participantsCount", "membersCount") ?? null;
    const isAdmin = Boolean(pick(g, "isAdmin", "iAmAdmin", "youAreAdmin"));
    const now = new Date().toISOString();
    await supabaseAdmin.from("wa_broadcast_destinos").upsert(
      { jid, tipo: "group", nome, foto_url: foto, participantes: parts, is_admin: isAdmin, pode_postar: true, ultima_sync: now },
      { onConflict: "jid" },
    );
    return { destino: { jid, tipo: "group", nome, foto_url: foto, participantes: parts, is_admin: isAdmin } };
  }

  // ---- Canal ----
  const channelMatch = raw.match(/(?:whatsapp\.com\/channel|wa\.me\/channel)\/([A-Za-z0-9_-]{10,})/i);
  if (channelMatch) {
    const key = channelMatch[1];
    // 1) resolve info a partir da chave de convite
    const info = (await uazPost("/newsletter/link", { key })) as { response?: Record<string, unknown>; error?: string } | null;
    const nl = info?.response ?? {};
    const jid = pick<string>(nl, "jid", "id") ?? "";
    const jidFull = jid.includes("@") ? jid : (jid ? `${jid}@newsletter` : "");
    if (!jidFull) throw new Error(`Canal não encontrado (${info?.error ?? "resposta sem jid"})`);
    const nome = pick<string>(nl, "name", "subject", "title") ?? "Canal";
    const foto = pick<string>(nl, "picture", "imageurl", "profilePicUrl") ?? null;
    const parts = pick<number>(nl, "subscribers", "membersCount", "size") ?? null;
    const isOwner = Boolean(pick(nl, "isOwner", "iAmOwner", "owner"));
    // 2) tenta seguir o canal (idempotente — se já segue, tudo bem)
    try { await uazPost("/newsletter/follow", { jid: jidFull }); } catch (e) { console.warn("[broadcast] follow canal:", e); }
    const now = new Date().toISOString();
    await supabaseAdmin.from("wa_broadcast_destinos").upsert(
      { jid: jidFull, tipo: "channel", nome, foto_url: foto, participantes: parts, is_admin: isOwner, pode_postar: isOwner, ultima_sync: now },
      { onConflict: "jid" },
    );
    return { destino: { jid: jidFull, tipo: "channel", nome, foto_url: foto, participantes: parts, is_admin: isOwner } };
  }

  throw new Error("Link não reconhecido. Use um convite de grupo (chat.whatsapp.com/...) ou canal (whatsapp.com/channel/...).");
}

/**
 * Envia UM bloco de mensagem para UM destino (grupo/canal).
 * Retorna { id, error }. Suporta text/image/video/document/buttons.
 */
export async function sendBroadcastBlock(
  destinoJid: string,
  bloco: {
    tipo: "text" | "image" | "video" | "document" | "buttons";
    texto?: string | null;
    midia_url?: string | null;
    midia_filename?: string | null;
    midia_caption?: string | null;
    botoes?: unknown;
  },
): Promise<{ id: string | null; error?: string }> {
  const base = process.env.UAZAPI_URL!.replace(/\/+$/, "");
  const token = process.env.UAZAPI_TOKEN!;

  async function call(path: string, body: Record<string, unknown>): Promise<{ id: string | null; error?: string }> {
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ number: destinoJid, ...body }),
      });
      const raw = await res.text();
      let data: { id?: string; messageid?: string; message?: { id?: string }; error?: string; response?: string } = {};
      try { data = JSON.parse(raw); } catch { /* noop */ }
      if (!res.ok) return { id: null, error: data.error ?? data.response ?? `HTTP ${res.status}` };
      return { id: data.id ?? data.messageid ?? data.message?.id ?? null };
    } catch (err) {
      return { id: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (bloco.tipo === "text") {
    return call("/send/text", { text: (bloco.texto ?? "").slice(0, 4090), linkPreview: true });
  }
  if (bloco.tipo === "buttons") {
    return call("/send/buttons", {
      text: bloco.texto ?? "",
      choices: Array.isArray(bloco.botoes) ? bloco.botoes : [],
    });
  }
  // Mídia
  const type = bloco.tipo === "image" ? "image" : bloco.tipo === "video" ? "video" : "document";
  return call("/send/media", {
    type,
    file: bloco.midia_url ?? "",
    text: bloco.midia_caption ?? bloco.texto ?? "",
    docName: bloco.midia_filename ?? undefined,
  });
}
