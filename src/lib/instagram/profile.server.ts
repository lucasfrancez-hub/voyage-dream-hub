/**
 * Perfil do contato do Instagram (nome, @ e foto).
 *
 * A DM pode nascer de vários caminhos (mensagem recebida, resposta privada a um
 * comentário, envio manual). Em todos eles precisamos do @ e da foto, então a
 * busca fica centralizada aqui e é chamada sempre que faltar algum dado.
 */

type EnsureInput = {
  conversationId: string;
  accountRowId: string;
  contactIgId: string;
  /** Força nova busca mesmo que já tenhamos nome/@. */
  force?: boolean;
};

export async function ensureInstagramContactProfile(input: EnsureInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: conv } = await supabaseAdmin
    .from("instagram_conversations")
    .select("id, contact_name, contact_username, contact_profile_pic")
    .eq("id", input.conversationId)
    .maybeSingle();

  let nome = conv?.contact_name ?? null;
  let username = conv?.contact_username ?? null;
  let foto = conv?.contact_profile_pic ?? null;

  const completo = Boolean(nome && username && foto);
  if (completo && !input.force) return { name: nome, username, profile_pic: foto, fetched: false };

  const { data: account } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, ig_user_id, page_id, access_token")
    .eq("id", input.accountRowId)
    .maybeSingle();
  const token = (account as { access_token?: string } | null)?.access_token ?? null;
  if (!token) return { name: nome, username, profile_pic: foto, fetched: false };

  try {
    const { fetchContactProfile } = await import("./api.server");
    const perfil = await fetchContactProfile({
      igUserId: (account?.ig_user_id ?? account?.page_id ?? "") as string,
      token,
      contactIgId: input.contactIgId,
    });
    nome = perfil.name ?? nome;
    username = perfil.username ?? username;
    foto = perfil.profile_pic ?? foto;
  } catch (e) {
    console.error("[instagram] perfil do contato falhou:", (e as Error).message);
    return { name: nome, username, profile_pic: foto, fetched: false };
  }

  await supabaseAdmin
    .from("instagram_conversations")
    .update({ contact_name: nome, contact_username: username, contact_profile_pic: foto })
    .eq("id", input.conversationId);

  // Espelho no inbox do chat (wa_conversations) também recebe nome/@ e foto.
  try {
    const waPhone = `ig:${input.contactIgId}`;
    const { data: mirror } = await supabaseAdmin
      .from("wa_conversations")
      .select("id, meta, display_name")
      .eq("wa_phone", waPhone)
      .maybeSingle();
    if (mirror) {
      const meta = (mirror.meta ?? {}) as Record<string, unknown>;
      const nomeAtual = mirror.display_name ?? "";
      const genérico = !nomeAtual || nomeAtual.startsWith("Instagram ") || nomeAtual === "sem nome";
      await supabaseAdmin
        .from("wa_conversations")
        .update({
          ...(genérico && (nome || username) ? { display_name: nome ?? `@${username}` } : {}),
          meta: {
            ...meta,
            channel: "instagram",
            ig_contact_id: input.contactIgId,
            ...(username ? { ig_username: username } : {}),
            ...(foto ? { ig_profile_pic: foto } : {}),
          },
        })
        .eq("id", mirror.id);
    }
  } catch (e) {
    console.error("[instagram] espelho do perfil falhou:", (e as Error).message);
  }

  return { name: nome, username, profile_pic: foto, fetched: true };
}
