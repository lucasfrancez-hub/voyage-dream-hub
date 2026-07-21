import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Integração com a API v3 pública do Monde.
 * Docs: https://web.monde.com.br/api/v3/documentation
 *
 * Autenticação: HTTP Basic, credencial única salva em MONDE_V3_BASIC
 * (valor base64 pronto, já no formato "agencia|user:pass").
 */

const BASE_URL = "https://web.monde.com.br/api/v3";
const PAGE_SIZE = 50; // máximo permitido pela API
const PAGES_PER_BATCH = 4; // 4 páginas por chamada => 200 pessoas / ~4s

type MondePersonV3 = {
  id: string;
  person_kind: "individual" | "company";
  external_id: string | null;
  name: string;
  legal_name: string | null;
  gender: string | null;
  birthdate: string | null;
  cpf_cnpj: string | null;
  rg_ie: string | null;
  passport_number: string | null;
  passport_expiration_date: string | null;
  foreigner: boolean;
  foreign_identity_document: string | null;
  email: string | null;
  phone_number: string | null;
  mobile_number: string | null;
  business_phone: string | null;
  website: string | null;
  observations: string | null;
  marital_status: string | null;
  birthplace: { id: string; name: string } | null;
  rg_emitter: string | null;
  rg_issue_date: string | null;
  birth_certificate: string | null;
  mother_name: string | null;
  city_inscription: string | null;
  tax_identification_number: string | null;
  seller: { id: string; name: string } | null;
  charge_billet_fee: boolean;
  address: {
    postal_code: string | null;
    street: string | null;
    street_number: string | null;
    neighborhood: string | null;
    additional_info: string | null;
    city_ibge: string | null;
    city_name: string | null;
    state_code: string | null;
    country_code: string | null;
  } | null;
  code: number | null;
};

async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Apenas administradores podem sincronizar com o Monde.");
}

async function mondeGet(path: string, query?: Record<string, string>) {
  const basic = process.env.MONDE_V3_BASIC;
  if (!basic) throw new Error("MONDE_V3_BASIC não configurado.");
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const res = await fetch(`${BASE_URL}${path}${qs}`, {
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      res.status === 401
        ? "Credencial do Monde inválida (401)."
        : `Monde v3 HTTP ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  return res.json();
}

function mapPersonToRow(p: MondePersonV3): Record<string, any> {
  const isCompany = p.person_kind === "company";
  const cpfCnpj = (p.cpf_cnpj ?? "").replace(/\D+/g, "");
  const addr = p.address ?? null;
  return {
    monde_id: p.id,
    kind: isCompany ? "PJ" : "PF",
    name: p.name || "(sem nome)",
    legal_name: p.legal_name,
    gender: p.gender,
    birth_date: !isCompany ? p.birthdate : null,
    foundation_date: isCompany ? p.birthdate : null,
    cpf: !isCompany && cpfCnpj.length === 11 ? cpfCnpj : null,
    cnpj: isCompany && cpfCnpj.length === 14 ? cpfCnpj : null,
    rg: p.rg_ie,
    passport_number: p.passport_number,
    passport_expiration: p.passport_expiration_date,
    state_registration: isCompany ? p.rg_ie : null,
    municipal_registration: p.city_inscription,
    email: p.email,
    phone: p.phone_number,
    mobile_phone: p.mobile_number,
    business_phone: p.business_phone,
    website: p.website,
    zip: addr?.postal_code ?? null,
    address: addr?.street ?? null,
    number: addr?.street_number ?? null,
    complement: addr?.additional_info ?? null,
    district: addr?.neighborhood ?? null,
    city: addr?.city_name ?? null,
    state: addr?.state_code ?? null,
    country: addr?.country_code ?? null,
    is_foreign: !!p.foreigner,
    notes: p.observations,
    seller_name: p.seller?.name ?? null,
    charge_boleto_fee: !!p.charge_billet_fee,
    marital_status: p.marital_status,
    birth_place: p.birthplace?.name ?? null,
    rg_issuer: p.rg_emitter,
    rg_issued_at: p.rg_issue_date,
    birth_certificate: p.birth_certificate,
    mother_name: p.mother_name,
  };
}

export type MondeSyncState = {
  id: string;
  last_synced_at: string | null;
  last_page: number | null;
  total_records: number | null;
  imported_count: number;
  updated_count: number;
  status: string;
  error: string | null;
  updated_at: string;
};

export const getMondeSyncState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MondeSyncState | null> => {
    await ensureAdmin(context);
    const { data } = await context.supabase
      .from("monde_sync_state")
      .select("*")
      .eq("id", "people")
      .maybeSingle();
    return (data as MondeSyncState | null) ?? null;
  });

export type MondeSyncProgress = {
  page: number;
  pages_processed: number;
  total_pages: number;
  total_records: number;
  imported_in_batch: number;
  done: boolean;
};

/**
 * Sincroniza um lote de páginas a partir de `start_page`.
 * Retorna progresso; o frontend chama em loop até `done: true`.
 */
export const syncMondePeopleBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        start_page: z.number().int().min(1).default(1),
        reset: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<MondeSyncProgress> => {
    await ensureAdmin(context);

    if (data.reset || data.start_page === 1) {
      await context.supabase
        .from("monde_sync_state")
        .upsert({
          id: "people",
          status: "running",
          error: null,
          imported_count: data.reset ? 0 : undefined,
          updated_count: data.reset ? 0 : undefined,
          updated_at: new Date().toISOString(),
        } as any);
    }

    let page = data.start_page;
    let totalPages = 1;
    let totalRecords = 0;
    let importedInBatch = 0;
    let pagesProcessed = 0;

    try {
      for (let i = 0; i < PAGES_PER_BATCH; i++) {
        const json = await mondeGet("/people", {
          page: String(page),
          size: String(PAGE_SIZE),
        });
        const rows: MondePersonV3[] = Array.isArray(json?.data) ? json.data : [];
        totalPages = Number(json?.pagination?.total_pages ?? 1);
        totalRecords = Number(json?.pagination?.total ?? 0);

        if (rows.length > 0) {
          const mapped = rows.map(mapPersonToRow);
          const { error, count } = await context.supabase
            .from("people")
            .upsert(mapped, { onConflict: "monde_id", count: "exact" });
          if (error) throw new Error(`Erro salvando pessoas: ${error.message}`);
          importedInBatch += count ?? mapped.length;
        }

        pagesProcessed++;
        if (page >= totalPages) break;
        page++;
      }

      const done = page >= totalPages;
      const nextPage = done ? page : page + 1;

      // atualiza estado agregado
      const { data: prev } = await context.supabase
        .from("monde_sync_state")
        .select("imported_count")
        .eq("id", "people")
        .maybeSingle();
      const prevImported = (prev as any)?.imported_count ?? 0;

      await context.supabase.from("monde_sync_state").upsert({
        id: "people",
        last_page: done ? null : nextPage,
        total_records: totalRecords,
        imported_count: prevImported + importedInBatch,
        status: done ? "idle" : "running",
        last_synced_at: done ? new Date().toISOString() : undefined,
        error: null,
        updated_at: new Date().toISOString(),
      } as any);

      return {
        page,
        pages_processed: pagesProcessed,
        total_pages: totalPages,
        total_records: totalRecords,
        imported_in_batch: importedInBatch,
        done,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await context.supabase.from("monde_sync_state").upsert({
        id: "people",
        status: "error",
        error: msg,
        updated_at: new Date().toISOString(),
      } as any);
      throw e;
    }
  });
