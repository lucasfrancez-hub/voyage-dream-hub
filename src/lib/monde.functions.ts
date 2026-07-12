import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Integração leve com a API v2 pública do Monde.
 * A API pública só expõe: people, tasks, task-categories, task-historics, cities.
 * Vendas NÃO são expostas — usamos /people para importar cliente/passageiro.
 * Docs: https://github.com/monde-sistemas/monde-api
 */

export type MondePerson = {
  id: string;
  name: string;
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  businessPhone: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  zip: string | null;
  passportNumber: string | null;
  passportExpiration: string | null;
  gender: string | null;
  kind: string | null;
  code: number | null;
};

function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D+/g, "");
}

function mapPerson(row: any): MondePerson {
  const a = row?.attributes ?? {};
  return {
    id: String(row?.id ?? ""),
    name: a.name ?? "",
    cpf: a.cpf ?? null,
    cnpj: a.cnpj ?? null,
    rg: a.rg ?? null,
    birthDate: a["birth-date"] ?? null,
    email: a.email ?? null,
    phone: a.phone ?? null,
    mobilePhone: a["mobile-phone"] ?? null,
    businessPhone: a["business-phone"] ?? null,
    address: a.address ?? null,
    number: a.number ?? null,
    complement: a.complement ?? null,
    district: a.district ?? null,
    zip: a.zip ?? null,
    passportNumber: a["passport-number"] ?? null,
    passportExpiration: a["passport-expiration"] ?? null,
    gender: a.gender ?? null,
    kind: a.kind ?? null,
    code: typeof a.code === "number" ? a.code : null,
  };
}

async function mondeAuth(): Promise<{ token: string; baseUrl: string }> {
  const baseUrl = (process.env.MONDE_API_BASE_URL ?? "https://web.monde.com.br").replace(/\/+$/, "");
  const login = process.env.MONDE_API_LOGIN;
  const password = process.env.MONDE_API_PASSWORD;
  if (!login || !password) {
    throw new Error("Credenciais do Monde não configuradas (MONDE_API_LOGIN / MONDE_API_PASSWORD).");
  }
  const res = await fetch(`${baseUrl}/api/v2/tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: { type: "tokens", attributes: { login, password } },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      res.status === 401
        ? "Falha de autenticação no Monde (usuário/senha inválidos ou usuário não é admin)."
        : `Erro autenticando no Monde (HTTP ${res.status}). ${text.slice(0, 200)}`,
    );
  }
  const json: any = await res.json();
  const token = json?.data?.attributes?.token;
  if (!token) throw new Error("Resposta inesperada do Monde: token ausente.");
  return { token, baseUrl };
}

async function mondeGet(path: string, query?: Record<string, string>): Promise<any> {
  const { token, baseUrl } = await mondeAuth();
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const res = await fetch(`${baseUrl}${path}${qs}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Monde HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Busca pessoas no Monde. Aceita CPF (só dígitos), nome ou e-mail.
 * A API v2 do Monde suporta filter[name], filter[cpf], filter[email] (formato JSON:API).
 * Retorna no máximo 20 resultados.
 */
export const searchMondePeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().trim().min(2, "Digite ao menos 2 caracteres"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MondePerson[]> => {
    const q = data.query.trim();
    const digits = onlyDigits(q);

    // Se parece com CPF/CNPJ (>=11 dígitos), busca por documento.
    const filters: Record<string, string> = {
      "page[size]": "20",
    };
    if (digits.length >= 11) {
      // tenta cpf primeiro; se vazio, tenta cnpj
      filters["filter[cpf]"] = digits;
    } else if (q.includes("@")) {
      filters["filter[email]"] = q;
    } else {
      filters["filter[name]"] = q;
    }

    let json = await mondeGet("/api/v2/people", filters);
    let rows: any[] = Array.isArray(json?.data) ? json.data : [];

    // Fallback: se buscou por CPF e não achou, tenta CNPJ
    if (rows.length === 0 && digits.length >= 11) {
      const j2 = await mondeGet("/api/v2/people", {
        "page[size]": "20",
        "filter[cnpj]": digits,
      });
      rows = Array.isArray(j2?.data) ? j2.data : [];
    }

    return rows.map(mapPerson);
  });

/**
 * Busca uma pessoa por ID (útil quando o usuário já tem o ID do Monde).
 */
export const getMondePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<MondePerson> => {
    const json = await mondeGet(`/api/v2/people/${encodeURIComponent(data.id)}`);
    if (!json?.data) throw new Error("Pessoa não encontrada no Monde.");
    return mapPerson(json.data);
  });
