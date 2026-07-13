import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureInternal(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin") && !roles.includes("user")) {
    throw new Error("Sem permissão para acessar o cadastro de pessoas.");
  }
}

export type PersonKind = "PF" | "PJ";

export type PersonRow = {
  id: string;
  code: number;
  kind: PersonKind;
  name: string;
  legal_name: string | null;
  gender: string | null;
  birth_date: string | null;
  foundation_date: string | null;
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  passport_number: string | null;
  passport_expiration: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  business_phone: string | null;
  website: string | null;
  zip: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  is_foreign: boolean;
  notes: string | null;
  seller_name: string | null;
  charge_boleto_fee: boolean;
  monde_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonCardRow = {
  id: string;
  person_id: string;
  nickname: string | null;
  holder_name: string | null;
  brand: string | null;
  last4: string | null;
  expiry: string | null;
  is_travel_card: boolean;
  created_at: string;
  updated_at: string;
};

const personSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["PF", "PJ"]),
  name: z.string().trim().min(1, "Nome é obrigatório").max(200),
  legal_name: z.string().trim().max(200).nullish(),
  gender: z.string().trim().max(20).nullish(),
  birth_date: z.string().trim().max(10).nullish(),
  foundation_date: z.string().trim().max(10).nullish(),
  cpf: z.string().trim().max(20).nullish(),
  cnpj: z.string().trim().max(20).nullish(),
  rg: z.string().trim().max(30).nullish(),
  passport_number: z.string().trim().max(30).nullish(),
  passport_expiration: z.string().trim().max(10).nullish(),
  state_registration: z.string().trim().max(30).nullish(),
  municipal_registration: z.string().trim().max(30).nullish(),
  email: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(30).nullish(),
  mobile_phone: z.string().trim().max(30).nullish(),
  business_phone: z.string().trim().max(30).nullish(),
  website: z.string().trim().max(200).nullish(),
  zip: z.string().trim().max(15).nullish(),
  address: z.string().trim().max(200).nullish(),
  number: z.string().trim().max(20).nullish(),
  complement: z.string().trim().max(120).nullish(),
  district: z.string().trim().max(120).nullish(),
  city: z.string().trim().max(120).nullish(),
  state: z.string().trim().max(60).nullish(),
  country: z.string().trim().max(80).nullish(),
  is_foreign: z.boolean().default(false),
  notes: z.string().trim().max(4000).nullish(),
  seller_name: z.string().trim().max(120).nullish(),
  charge_boleto_fee: z.boolean().default(false),
});

function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: any = { ...obj };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string" && out[k].trim() === "") out[k] = null;
  }
  return out;
}

export const listPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersonRow[]> => {
    await ensureInternal(context);
    const { data, error } = await context.supabase
      .from("people")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as PersonRow[];
  });

export const getPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { data: person, error } = await context.supabase
      .from("people")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!person) throw new Error("Pessoa não encontrada");
    const { data: cards, error: cErr } = await context.supabase
      .from("people_cards")
      .select("id, person_id, nickname, holder_name, brand, last4, expiry, is_travel_card, created_at, updated_at")
      .eq("person_id", data.id)
      .order("created_at", { ascending: false });
    if (cErr) throw new Error(cErr.message);
    return { person: person as PersonRow, cards: (cards ?? []) as PersonCardRow[] };
  });

export const upsertPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => personSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const payload: any = emptyToNull(data);
    if (!payload.id) {
      // resolve created_by info
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("full_name")
        .eq("id", context.userId)
        .maybeSingle();
      payload.created_by = context.userId;
      payload.created_by_name =
        (prof?.full_name as string | null) ??
        ((context.claims as { email?: string } | undefined)?.email ?? null);
    }
    const { data: saved, error } = await context.supabase
      .from("people")
      .upsert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: saved!.id as string };
  });

export const deletePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { error } = await context.supabase.from("people").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function digits(s: string) {
  return s.replace(/\D+/g, "");
}

function detectBrand(num: string): string | null {
  const n = digits(num);
  if (!n) return null;
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011|506699|509)/.test(n)) return "Elo";
  if (/^(606282|3841)/.test(n)) return "Hipercard";
  if (/^(30[0-5]|3[68])/.test(n)) return "Diners";
  return null;
}

export const addPersonCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        person_id: z.string().uuid(),
        nickname: z.string().trim().max(60).nullish(),
        holder_name: z.string().trim().max(200).nullish(),
        number: z.string().trim().min(12).max(25),
        expiry: z.string().trim().max(7).nullish(),
        is_travel_card: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { encryptCardNumber } = await import("@/lib/card-crypto.server");
    const clean = digits(data.number);
    if (clean.length < 12) throw new Error("Número de cartão inválido");
    const brand = detectBrand(clean);
    const last4 = clean.slice(-4);
    const number_ciphertext = encryptCardNumber(clean);
    const { error } = await context.supabase.from("people_cards").insert({
      person_id: data.person_id,
      nickname: data.nickname || null,
      holder_name: data.holder_name || null,
      brand,
      last4,
      expiry: data.expiry || null,
      is_travel_card: data.is_travel_card,
      number_ciphertext,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePersonCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { error } = await context.supabase
      .from("people_cards")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revealPersonCardNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { data: row, error } = await context.supabase
      .from("people_cards")
      .select("number_ciphertext")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Cartão não encontrado");
    const { decryptCardNumber } = await import("@/lib/card-crypto.server");
    return { number: decryptCardNumber((row as any).number_ciphertext) };
  });
