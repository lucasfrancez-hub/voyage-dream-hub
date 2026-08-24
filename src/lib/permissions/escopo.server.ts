/** Alcance de dados do usuário logado (server-only). */
const GESTOR_EMAIL = "lucas@voeair.com";

export async function podeVerTudo(userId: string, email?: string | null): Promise<boolean> {
  if ((email ?? "").toLowerCase() === GESTOR_EMAIL) return true;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const papeis = (data ?? []).map((r: any) => String(r.role));
    return papeis.includes("admin") || papeis.includes("gestor");
  } catch {
    return false;
  }
}

/** ids de passagem (PassHub) criados pelo usuário. */
export async function idsPassagemDoUsuario(userId: string): Promise<Set<number>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("passhub_reserva_extra")
    .select("id_passagem")
    .eq("criado_por", userId);
  return new Set((data ?? []).map((r: any) => Number(r.id_passagem)));
}

/** Registra quem criou a reserva na PassHub. */
export async function marcaDonoReserva(
  idPassagem: number,
  localizador: string | null,
  userId: string,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("passhub_reserva_extra")
      .upsert(
        { id_passagem: idPassagem, localizador, criado_por: userId },
        { onConflict: "id_passagem" },
      );
  } catch (e) {
    console.error("[permissoes] não consegui marcar dono da reserva:", e);
  }
}
