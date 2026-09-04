import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy de imagens do Instagram.
 *
 * As URLs do CDN da Meta são assinadas e expiram em poucos dias — depois disso
 * as fotos de perfil e as miniaturas das publicações somem do inbox.
 * Este proxy tenta a URL salva e, se ela já expirou, busca uma nova na Graph API
 * (perfil do contato ou mídia), atualiza o banco e devolve a imagem.
 *
 * Uso:
 *   /api/public/ig-img?u=<url>&c=<conversation_id>
 *   /api/public/ig-img?u=<url>&m=<ig_media_id>
 */

const HOSTS_OK = /(^|\.)(cdninstagram\.com|fbcdn\.net|instagram\.com)$/i;

function hostPermitido(url: string) {
  try {
    return HOSTS_OK.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function baixar(url: string) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.startsWith("image/") && !tipo.startsWith("video/")) return null;
  return res;
}

async function tokenPadrao() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, ig_user_id, page_id, access_token, is_default")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as
    | { id: string; ig_user_id: string | null; page_id: string | null; access_token: string }
    | null;
}

/** Busca uma URL nova (perfil ou mídia) e persiste no banco. */
async function renovar(params: { conversationId?: string | null; mediaId?: string | null }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (params.conversationId) {
    const { data: conv } = await supabaseAdmin
      .from("instagram_conversations")
      .select("id, account_id, contact_ig_id")
      .eq("id", params.conversationId)
      .maybeSingle();
    if (!conv?.contact_ig_id) return null;
    const { data: conta } = await supabaseAdmin
      .from("instagram_accounts")
      .select("ig_user_id, page_id, access_token")
      .eq("id", conv.account_id)
      .maybeSingle();
    const token = (conta as { access_token?: string } | null)?.access_token;
    if (!token) return null;
    const { fetchContactProfile } = await import("@/lib/instagram/api.server");
    const perfil = await fetchContactProfile({
      igUserId: (conta?.ig_user_id ?? conta?.page_id ?? "") as string,
      token,
      contactIgId: conv.contact_ig_id as string,
    });
    if (!perfil.profile_pic) return null;
    await supabaseAdmin
      .from("instagram_conversations")
      .update({ contact_profile_pic: perfil.profile_pic })
      .eq("id", conv.id);
    return perfil.profile_pic;
  }

  if (params.mediaId) {
    const conta = await tokenPadrao();
    if (!conta?.access_token) return null;
    const { fetchMediaInfo } = await import("@/lib/instagram/api.server");
    const midia = await fetchMediaInfo({ mediaId: params.mediaId, token: conta.access_token });
    if (!midia.thumbnail) return null;
    await supabaseAdmin
      .from("instagram_comments")
      .update({ media_thumbnail: midia.thumbnail })
      .eq("media_id", params.mediaId);
    return midia.thumbnail;
  }

  return null;
}

export const Route = createFileRoute("/api/public/ig-img")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const original = url.searchParams.get("u");
        const conversationId = url.searchParams.get("c");
        const mediaId = url.searchParams.get("m");

        const entregar = (res: Response) =>
          new Response(res.body, {
            status: 200,
            headers: {
              "content-type": res.headers.get("content-type") ?? "image/jpeg",
              "cache-control": "public, max-age=3600",
            },
          });

        try {
          if (original && hostPermitido(original)) {
            const direto = await baixar(original);
            if (direto) return entregar(direto);
          }

          const nova = await renovar({ conversationId, mediaId });
          if (nova && hostPermitido(nova)) {
            const res = await baixar(nova);
            if (res) return entregar(res);
          }
        } catch (error) {
          console.error("[ig-img]", (error as Error).message);
        }

        return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=60" } });
      },
    },
  },
});
