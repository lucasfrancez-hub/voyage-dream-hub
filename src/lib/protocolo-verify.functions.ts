import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function normalize(h: string) {
  return (h || "").trim().toLowerCase().replace(/[^0-9a-f]/g, "");
}

export const registerProtocolHash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    hash: string;
    protocolo_id: string;
    numero?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
    message_count?: number;
    opened_at?: string | null;
    closed_at?: string | null;
    generated_at?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const hash = normalize(data.hash);
    if (hash.length !== 64) throw new Error("Hash inválido");
    const email =
      (context.claims as { email?: string } | null)?.email ??
      context.userId ??
      "sistema";
    const { error } = await context.supabase
      .from("protocol_verifications")
      .upsert(
        {
          hash,
          protocolo_id: data.protocolo_id,
          numero: data.numero ?? null,
          contact_name: data.contact_name ?? null,
          contact_phone: data.contact_phone ?? null,
          message_count: data.message_count ?? 0,
          opened_at: data.opened_at ?? null,
          closed_at: data.closed_at ?? null,
          generated_at: data.generated_at ?? new Date().toISOString(),
          generated_by: email,
        },
        { onConflict: "hash" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const verifyProtocolHash = createServerFn({ method: "POST" })
  .inputValidator((input: { hash: string }) => input)
  .handler(async ({ data }) => {
    const hash = normalize(data.hash);
    if (hash.length !== 64) return { valid: false as const };
    // A função no banco não é mais executável por anon/authenticated:
    // só este endpoint (que exige o hash completo de 64 chars) pode chamá-la.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("verify_protocol_hash", {
      _hash: hash,
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (error || !row) return { valid: false as const };
    // Mascarar telefone (mostra últimos 4 dígitos)
    const phone = (row.contact_phone ?? "").replace(/\D/g, "");
    const maskedPhone = phone
      ? `+${phone.slice(0, 2)} ••• ${phone.slice(-4)}`
      : null;
    // Mascarar e-mail do gerador
    const gen = row.generated_by ?? "";
    const maskedBy = gen.includes("@")
      ? gen.replace(/^(.).*?(.?)@(.*)$/, (_m, a, b, d) => `${a}•••${b}@${d}`)
      : gen;
    return {
      valid: true as const,
      numero: row.numero,
      contact_name: row.contact_name,
      contact_phone: maskedPhone,
      message_count: row.message_count,
      opened_at: row.opened_at,
      closed_at: row.closed_at,
      generated_at: row.generated_at,
      generated_by: maskedBy,
    };
  });
