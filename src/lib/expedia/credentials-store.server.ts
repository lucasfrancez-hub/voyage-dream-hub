/**
 * Credenciais da conta Expedia TAAP para re-login automático.
 *
 * A senha nunca é gravada em texto puro nem devolvida ao navegador: fica
 * cifrada em AES-256-GCM (mesma chave dos cartões) e só é decifrada dentro do
 * robô de login, no servidor.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptCardNumber, decryptCardNumber } from "@/lib/card-crypto.server";

export type ExpediaCredentialRow = {
  id: string;
  label: string;
  account_email: string;
  status: string;
  last_login_at: string | null;
  last_error: string | null;
  created_at: string;
};

export async function listExpediaCredentials(): Promise<ExpediaCredentialRow[]> {
  const { data, error } = await supabaseAdmin
    .from("expedia_credentials")
    .select("id,label,account_email,status,last_login_at,last_error,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExpediaCredentialRow[];
}

export async function saveExpediaCredential(input: {
  label: string;
  email: string;
  password: string;
  userId: string | null;
}): Promise<{ id: string }> {
  // Só uma conta ativa por vez — evita ambiguidade no re-login automático.
  await supabaseAdmin.from("expedia_credentials").update({ status: "REPLACED" }).eq("status", "ACTIVE");
  const { data, error } = await supabaseAdmin
    .from("expedia_credentials")
    .insert({
      label: input.label || "Expedia TAAP",
      account_email: input.email,
      password_encrypted: encryptCardNumber(input.password),
      status: "ACTIVE",
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function deleteExpediaCredential(id: string) {
  const { error } = await supabaseAdmin.from("expedia_credentials").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getActiveExpediaCredential(): Promise<{
  id: string;
  label: string;
  email: string;
  password: string;
} | null> {
  const { data, error } = await supabaseAdmin
    .from("expedia_credentials")
    .select("id,label,account_email,password_encrypted")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.password_encrypted) return null;
  try {
    return {
      id: data.id,
      label: data.label,
      email: data.account_email,
      password: decryptCardNumber(data.password_encrypted),
    };
  } catch {
    return null;
  }
}

export async function markExpediaCredential(id: string, ok: boolean, errorMessage?: string | null) {
  await supabaseAdmin
    .from("expedia_credentials")
    .update({
      status: ok ? "ACTIVE" : "LOGIN_FAILED",
      last_login_at: ok ? new Date().toISOString() : undefined,
      last_error: ok ? null : (errorMessage ?? "Falha no login automático").slice(0, 400),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}
