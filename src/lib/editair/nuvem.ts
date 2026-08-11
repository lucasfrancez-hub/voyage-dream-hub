import { supabase } from "@/integrations/supabase/client";

/**
 * O EditAir Desktop abre local-first, SEM login: por isso nenhuma sessão do
 * Supabase existe no navegador embutido e os serverFn de IA (que exigem
 * `requireSupabaseAuth`) respondem "Unauthorized: No authorization header provided".
 *
 * Toda função de nuvem (IA) deve chamar `temSessaoNuvem()` antes e, se não houver
 * sessão, abrir o login. A chave da IA NUNCA vem para o renderer: ela continua no
 * backend; o frontend só envia o token da sessão do usuário.
 */
export async function temSessaoNuvem(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session?.access_token;
  } catch {
    return false;
  }
}

export async function emailDaSessaoNuvem(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}
