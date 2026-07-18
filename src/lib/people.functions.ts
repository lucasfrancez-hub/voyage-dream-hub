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
  marital_status: string | null;
  birth_place: string | null;
  rg_issuer: string | null;
  rg_issued_at: string | null;
  birth_certificate: string | null;
  mother_name: string | null;
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
  operator: string | null;
  travel_card_type: string | null;
  security_code_hint: string | null;
  last4: string | null;
  expiry: string | null;
  is_travel_card: boolean;
  created_at: string;
  updated_at: string;
};

export type PersonPhone = {
  id: string;
  person_id: string;
  kind: string;
  number: string;
  is_primary: boolean;
  notes: string | null;
  sort_order: number;
};

export type PersonEmail = {
  id: string;
  person_id: string;
  kind: string;
  address: string;
  is_primary: boolean;
  notes: string | null;
  sort_order: number;
};

export type PersonTag = {
  id: string;
  person_id: string;
  label: string;
  color: string | null;
};

export type PersonAttachment = {
  id: string;
  person_id: string;
  description: string;
  mime_type: string | null;
  storage_path: string;
  size_bytes: number | null;
  uploaded_by_name: string | null;
  created_at: string;
};

export type PersonCustomField = {
  id: string;
  person_id: string;
  field_key: string;
  field_value: string | null;
  sort_order: number;
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
  marital_status: z.string().trim().max(30).nullish(),
  birth_place: z.string().trim().max(120).nullish(),
  rg_issuer: z.string().trim().max(60).nullish(),
  rg_issued_at: z.string().trim().max(10).nullish(),
  birth_certificate: z.string().trim().max(120).nullish(),
  mother_name: z.string().trim().max(200).nullish(),
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

export const searchPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().trim().max(120).default("") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const q = data.q.trim();
    let query = context.supabase
      .from("people")
      .select("id, name, cpf, cnpj, email, phone, mobile_phone, birth_date, zip, address, number, district, city, state, rg")
      .order("name", { ascending: true })
      .limit(15);
    if (q) {
      const digits = q.replace(/\D+/g, "");
      const parts: string[] = [`name.ilike.%${q}%`, `email.ilike.%${q}%`];
      if (digits.length >= 3) {
        parts.push(`cpf.ilike.%${digits}%`);
        parts.push(`cnpj.ilike.%${digits}%`);
      }
      query = query.or(parts.join(","));
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string; name: string; cpf: string | null; cnpj: string | null;
      email: string | null; phone: string | null; mobile_phone: string | null;
      birth_date: string | null; zip: string | null; address: string | null;
      number: string | null; district: string | null; city: string | null;
      state: string | null; rg: string | null;
    }>;
  });

export const listPersonCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ person_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { data: cards, error } = await context.supabase
      .from("people_cards")
      .select("id, person_id, nickname, holder_name, brand, operator, travel_card_type, security_code_hint, last4, expiry, is_travel_card, created_at, updated_at")
      .eq("person_id", data.person_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (cards ?? []) as PersonCardRow[];
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

    const [cardsRes, phonesRes, emailsRes, tagsRes, attachRes, customRes] = await Promise.all([
      context.supabase.from("people_cards")
        .select("id, person_id, nickname, holder_name, brand, operator, travel_card_type, security_code_hint, last4, expiry, is_travel_card, created_at, updated_at")
        .eq("person_id", data.id).order("created_at", { ascending: false }),
      context.supabase.from("people_phones")
        .select("id, person_id, kind, number, is_primary, notes, sort_order")
        .eq("person_id", data.id).order("sort_order", { ascending: true }),
      context.supabase.from("people_emails")
        .select("id, person_id, kind, address, is_primary, notes, sort_order")
        .eq("person_id", data.id).order("sort_order", { ascending: true }),
      context.supabase.from("people_tags")
        .select("id, person_id, label, color")
        .eq("person_id", data.id).order("label", { ascending: true }),
      context.supabase.from("people_attachments")
        .select("id, person_id, description, mime_type, storage_path, size_bytes, uploaded_by_name, created_at")
        .eq("person_id", data.id).order("created_at", { ascending: false }),
      context.supabase.from("people_custom_fields")
        .select("id, person_id, field_key, field_value, sort_order")
        .eq("person_id", data.id).order("sort_order", { ascending: true }),
    ]);
    for (const r of [cardsRes, phonesRes, emailsRes, tagsRes, attachRes, customRes]) {
      if (r.error) throw new Error(r.error.message);
    }
    return {
      person: person as PersonRow,
      cards: (cardsRes.data ?? []) as PersonCardRow[],
      phones: (phonesRes.data ?? []) as PersonPhone[],
      emails: (emailsRes.data ?? []) as PersonEmail[],
      tags: (tagsRes.data ?? []) as PersonTag[],
      attachments: (attachRes.data ?? []) as PersonAttachment[],
      custom_fields: (customRes.data ?? []) as PersonCustomField[],
    };
  });

export const upsertPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => personSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const payload: any = emptyToNull(data);
    if (!payload.id) {
      // Evita duplicar: tenta localizar cadastro existente por CPF, CNPJ ou e-mail
      // antes de inserir. Assim, ao salvar cartão a partir do pedido, associamos
      // ao mesmo cadastro do pagador.
      const cpfDigits = payload.cpf ? String(payload.cpf).replace(/\D+/g, "") : "";
      const cnpjDigits = payload.cnpj ? String(payload.cnpj).replace(/\D+/g, "") : "";
      const emailNorm = payload.email ? String(payload.email).trim().toLowerCase() : "";
      const ors: string[] = [];
      if (cpfDigits) {
        ors.push(`cpf.eq.${cpfDigits}`);
        if (cpfDigits.length === 11) {
          ors.push(`cpf.eq.${cpfDigits.slice(0,3)}.${cpfDigits.slice(3,6)}.${cpfDigits.slice(6,9)}-${cpfDigits.slice(9)}`);
        }
      }
      if (cnpjDigits) ors.push(`cnpj.eq.${cnpjDigits}`);
      if (emailNorm) ors.push(`email.ilike.${emailNorm}`);
      if (ors.length) {
        const { data: existing } = await context.supabase
          .from("people")
          .select("id")
          .or(ors.join(","))
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          payload.id = existing.id;
        }
      }
    }
    if (!payload.id) {
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
        operator: z.string().trim().max(40).nullish(),
        travel_card_type: z.string().trim().max(10).nullish(),
        security_code_hint: z.string().trim().max(6).nullish(),
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
      operator: data.operator || brand || null,
      travel_card_type: data.travel_card_type || null,
      security_code_hint: data.security_code_hint || null,
      last4,
      expiry: data.expiry || null,
      is_travel_card: data.is_travel_card || !!data.travel_card_type,
      number_ciphertext,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updatePersonCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        nickname: z.string().trim().max(60).nullish(),
        holder_name: z.string().trim().max(200).nullish(),
        number: z.string().trim().max(25).nullish(),
        expiry: z.string().trim().max(7).nullish(),
        operator: z.string().trim().max(40).nullish(),
        security_code_hint: z.string().trim().max(6).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const patch: Record<string, unknown> = {
      nickname: data.nickname ?? null,
      holder_name: data.holder_name ?? null,
      expiry: data.expiry ?? null,
      operator: data.operator ?? null,
      security_code_hint: data.security_code_hint ?? null,
    };
    if (data.number && data.number.trim()) {
      const clean = digits(data.number);
      if (clean.length < 12) throw new Error("Número de cartão inválido");
      const { encryptCardNumber } = await import("@/lib/card-crypto.server");
      patch.number_ciphertext = encryptCardNumber(clean);
      patch.last4 = clean.slice(-4);
      patch.brand = detectBrand(clean);
    }
    const { error } = await context.supabase
      .from("people_cards")
      .update(patch)
      .eq("id", data.id);
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

/* ---------------- Phones ---------------- */

export const savePersonPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      person_id: z.string().uuid(),
      kind: z.string().trim().max(30).default("personal"),
      number: z.string().trim().min(3).max(30),
      is_primary: z.boolean().default(false),
      notes: z.string().trim().max(200).nullish(),
      sort_order: z.number().int().default(0),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const payload: any = { ...data, notes: data.notes || null };
    const { error } = await context.supabase.from("people_phones").upsert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePersonPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { error } = await context.supabase.from("people_phones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Emails ---------------- */

export const savePersonEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      person_id: z.string().uuid(),
      kind: z.string().trim().max(30).default("personal"),
      address: z.string().trim().email("E-mail inválido").max(200),
      is_primary: z.boolean().default(false),
      notes: z.string().trim().max(200).nullish(),
      sort_order: z.number().int().default(0),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const payload: any = { ...data, notes: data.notes || null };
    const { error } = await context.supabase.from("people_emails").upsert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePersonEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { error } = await context.supabase.from("people_emails").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Tags ---------------- */

export const savePersonTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      person_id: z.string().uuid(),
      label: z.string().trim().min(1).max(60),
      color: z.string().trim().max(20).nullish(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { error } = await context.supabase.from("people_tags").upsert({
      ...data, color: data.color || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePersonTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { error } = await context.supabase.from("people_tags").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Custom fields ---------------- */

export const savePersonCustomField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      person_id: z.string().uuid(),
      field_key: z.string().trim().min(1).max(80),
      field_value: z.string().trim().max(1000).nullish(),
      sort_order: z.number().int().default(0),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { error } = await context.supabase.from("people_custom_fields").upsert({
      ...data, field_value: data.field_value || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePersonCustomField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { error } = await context.supabase.from("people_custom_fields").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Attachments ---------------- */

export const addPersonAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      person_id: z.string().uuid(),
      description: z.string().trim().min(1).max(200),
      mime_type: z.string().trim().max(80).nullish(),
      size_bytes: z.number().int().nullish(),
      data_base64: z.string().min(1),
      filename: z.string().trim().max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const buf = Buffer.from(data.data_base64, "base64");
    const safe = data.filename.replace(/[^\w.\-]+/g, "_");
    const path = `${data.person_id}/${Date.now()}_${safe}`;
    const up = await supabaseAdmin.storage
      .from("people-attachments")
      .upload(path, buf, {
        contentType: data.mime_type || "application/octet-stream",
        upsert: false,
      });
    if (up.error) throw new Error(up.error.message);
    const { data: prof } = await context.supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const { error } = await context.supabase.from("people_attachments").insert({
      person_id: data.person_id,
      description: data.description,
      mime_type: data.mime_type || null,
      storage_path: path,
      size_bytes: data.size_bytes ?? buf.byteLength,
      uploaded_by: context.userId,
      uploaded_by_name: (prof?.full_name as string | null) ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePersonAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { data: row } = await context.supabase.from("people_attachments").select("storage_path").eq("id", data.id).maybeSingle();
    if (row?.storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("people-attachments").remove([row.storage_path as string]);
    }
    const { error } = await context.supabase.from("people_attachments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPersonAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureInternal(context);
    const { data: row, error } = await context.supabase
      .from("people_attachments")
      .select("storage_path")
      .eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Anexo não encontrado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage
      .from("people-attachments")
      .createSignedUrl(row.storage_path as string, 300);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl };
  });

/* ---------------- Sales / financials ---------------- */

export type PersonSaleRow = {
  id: string;
  order_number: string | null;
  trip_title: string | null;
  supplier_name: string | null;
  status: string | null;
  total_price: number | null;
  created_at: string;
  going_date: string | null;
  paid: number;
  pending: number;
};

export type PersonFinancialSummary = {
  orders_count: number;
  total_gross: number;
  total_paid: number;
  total_pending: number;
  last_order_at: string | null;
  first_sale_at: string | null;
  last_sale_at: string | null;
  last_departure_at: string | null;
  last_return_at: string | null;
};

export const getPersonSalesAndFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ sales: PersonSaleRow[]; summary: PersonFinancialSummary }> => {
    await ensureInternal(context);
    // A aba de pessoas também é acessível ao papel interno "user", enquanto
    // as políticas de pedidos/pagamentos são mais restritas. Depois de validar
    // o papel acima, fazemos esta leitura interna no servidor para que a venda
    // vinculada por person_id/CPF não desapareça por causa dessas políticas.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Busca a pessoa para permitir fallback por CPF/e-mail em pedidos antigos
    // que ainda não têm person_id preenchido.
    const { data: person, error: personError } = await supabaseAdmin
      .from("people")
      .select("cpf, email")
      .eq("id", data.id)
      .maybeSingle();
    if (personError) throw new Error(personError.message);
    if (!person) throw new Error("Pessoa não encontrada");
    const cpfDigits = String(person?.cpf ?? "").replace(/\D+/g, "");
    const emailNorm = String(person?.email ?? "").trim().toLowerCase();

    const cpfCandidates = new Set<string>();
    if (cpfDigits) {
      cpfCandidates.add(cpfDigits);
      cpfCandidates.add(String(person.cpf ?? ""));
      if (cpfDigits.length === 11) {
        cpfCandidates.add(`${cpfDigits.slice(0,3)}.${cpfDigits.slice(3,6)}.${cpfDigits.slice(6,9)}-${cpfDigits.slice(9)}`);
      }
    }

    // Lemos os campos mínimos e normalizamos no servidor. Assim CPF com
    // pontos, traços, espaços ou somente números sempre produz o mesmo vínculo.
    const { data: candidateOrders, error } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, trip_title, supplier_name, status, total_price, created_at, package_snapshot, person_id, cpf, payer_cpf, email, payer_email")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const normalizeCpf = (value: unknown) => String(value ?? "").replace(/\D+/g, "");
    const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
    const directlyMatched = (candidateOrders ?? []).filter((order: any) =>
      order.person_id === data.id
      || (cpfDigits && (normalizeCpf(order.cpf) === cpfDigits || normalizeCpf(order.payer_cpf) === cpfDigits))
      || (emailNorm && (normalizeEmail(order.email) === emailNorm || normalizeEmail(order.payer_email) === emailNorm))
    );

    // Também considera a pessoa como passageira, mesmo quando outra pessoa é
    // a pagadora/dona do pedido.
    let passengerOrderIds: string[] = [];
    if (cpfCandidates.size > 0) {
      const { data: passengerLinks, error: passengerError } = await supabaseAdmin
        .from("order_passengers")
        .select("order_id, cpf")
        .in("cpf", [...cpfCandidates].filter(Boolean));
      if (passengerError) throw new Error(passengerError.message);
      passengerOrderIds = (passengerLinks ?? [])
        .filter((row: any) => normalizeCpf(row.cpf) === cpfDigits)
        .map((row: any) => row.order_id);
    }

    const matchedIds = new Set([...directlyMatched.map((order: any) => order.id), ...passengerOrderIds]);
    const list = (candidateOrders ?? []).filter((order: any) => matchedIds.has(order.id));
    const ids = list.map((o) => o.id);
    let payments: any[] = [];
    if (ids.length > 0) {
      const { data: pays, error: pErr } = await supabaseAdmin
        .from("order_payments")
        .select("order_id, amount, status")
        .in("order_id", ids);
      if (pErr) throw new Error(pErr.message);
      payments = pays ?? [];
    }
    const paidMap: Record<string, number> = {};
    const pendMap: Record<string, number> = {};
    const snapshotDate = (snapshot: unknown, key: "going_date" | "return_date") => {
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
      const value = (snapshot as Record<string, unknown>)[key];
      return typeof value === "string" ? value : null;
    };
    for (const p of payments) {
      const amt = Number(p.amount) || 0;
      if (String(p.status).toLowerCase() === "paid") paidMap[p.order_id] = (paidMap[p.order_id] ?? 0) + amt;
      else pendMap[p.order_id] = (pendMap[p.order_id] ?? 0) + amt;
    }
    const sales: PersonSaleRow[] = list.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      trip_title: o.trip_title,
      supplier_name: o.supplier_name,
      status: o.status,
      total_price: o.total_price != null ? Number(o.total_price) : null,
      created_at: o.created_at,
      going_date: snapshotDate(o.package_snapshot, "going_date"),
      paid: paidMap[o.id] ?? 0,
      pending: pendMap[o.id] ?? 0,
    }));
    const total_gross = sales.reduce((s, r) => s + (r.total_price ?? 0), 0);
    const total_paid = sales.reduce((s, r) => s + r.paid, 0);
    const total_pending = sales.reduce((s, r) => s + r.pending, 0);
    const sortedByCreated = [...sales].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const departures = list.map((o) => snapshotDate(o.package_snapshot, "going_date")).filter((v): v is string => v !== null).sort();
    const returns = list.map((o) => snapshotDate(o.package_snapshot, "return_date")).filter((v): v is string => v !== null).sort();
    return {
      sales,
      summary: {
        orders_count: sales.length,
        total_gross,
        total_paid,
        total_pending,
        last_order_at: sales[0]?.created_at ?? null,
        first_sale_at: sortedByCreated[0]?.created_at ?? null,
        last_sale_at: sortedByCreated[sortedByCreated.length - 1]?.created_at ?? null,
        last_departure_at: departures[departures.length - 1] ?? null,
        last_return_at: returns[returns.length - 1] ?? null,
      },
    };
  });
