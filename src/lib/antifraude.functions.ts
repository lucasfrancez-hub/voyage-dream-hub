/**
 * Central de verificação antifraude — consulta dados internos da VIA AIR.
 * Busca por CPF, telefone ou nome e cruza: cadastro (people), pedidos,
 * conversas WhatsApp e score do motor antifraude comportamental.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  tipo: z.enum(["cpf", "telefone", "nome"]),
  valor: z.string().trim().min(3, "Informe ao menos 3 caracteres").max(120),
});

export interface AntifraudePessoa {
  id: string;
  nome: string;
  cpf: string | null;
  rg: string | null;
  nascimento: string | null;
  mae: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  criadoEm: string;
}

export interface AntifraudePedido {
  id: string;
  numero: string | null;
  status: string | null;
  total: number | null;
  criadoEm: string;
}

export interface AntifraudeConversa {
  conversationId: string;
  telefone: string;
  nome: string | null;
  ultimaMensagemEm: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  transferedToHuman: boolean;
}

export interface AntifraudeResultado {
  pessoas: AntifraudePessoa[];
  pedidos: AntifraudePedido[];
  conversas: AntifraudeConversa[];
}

export const consultarAntifraude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => inputSchema.parse(raw))
  .handler(async ({ data }): Promise<AntifraudeResultado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const digits = data.valor.replace(/\D/g, "");
    const resultado: AntifraudeResultado = { pessoas: [], pedidos: [], conversas: [] };

    // ---- 1. Cadastro (people) ----
    let pessoaQuery = supabaseAdmin
      .from("people")
      .select(
        "id, name, cpf, rg, birth_date, mother_name, email, phone, mobile_phone, address, number, district, city, state, zip, created_at",
      )
      .limit(10);

    if (data.tipo === "cpf") {
      pessoaQuery = pessoaQuery.or(`cpf.ilike.%${digits}%,cnpj.ilike.%${digits}%`);
    } else if (data.tipo === "telefone") {
      const tail = digits.slice(-9);
      pessoaQuery = pessoaQuery.or(
        `phone.ilike.%${tail}%,mobile_phone.ilike.%${tail}%,business_phone.ilike.%${tail}%`,
      );
    } else {
      pessoaQuery = pessoaQuery.ilike("name", `%${data.valor}%`);
    }

    const { data: pessoas } = await pessoaQuery;
    for (const p of pessoas ?? []) {
      const endereco = [p.address, p.number, p.district].filter(Boolean).join(", ") || null;
      resultado.pessoas.push({
        id: p.id,
        nome: p.name,
        cpf: p.cpf,
        rg: p.rg,
        nascimento: p.birth_date,
        mae: p.mother_name,
        email: p.email,
        telefone: p.phone,
        celular: p.mobile_phone,
        endereco,
        cidade: p.city,
        uf: p.state,
        cep: p.zip,
        criadoEm: p.created_at,
      });
    }

    const pessoaIds = resultado.pessoas.map((p) => p.id);

    // ---- 2. Pedidos vinculados às pessoas encontradas ----
    if (pessoaIds.length > 0) {
      const { data: pedidos } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, status, total_price, created_at")
        .in("person_id", pessoaIds)
        .order("created_at", { ascending: false })
        .limit(20);
      for (const o of pedidos ?? []) {
        resultado.pedidos.push({
          id: o.id,
          numero: o.order_number,
          status: o.status,
          total: o.total_price,
          criadoEm: o.created_at,
        });
      }
    }

    // ---- 3. Conversas WhatsApp + score antifraude ----
    if (data.tipo === "telefone" && digits.length >= 8) {
      const tail = digits.slice(-9);
      const { data: conversas } = await supabaseAdmin
        .from("wa_conversations")
        .select("id, wa_phone, contact_name, last_message_at, risk_score, risk_level, transferred_to_human")
        .ilike("wa_phone", `%${tail}%`)
        .order("last_message_at", { ascending: false })
        .limit(5);
      for (const c of conversas ?? []) {
        resultado.conversas.push({
          conversationId: c.id,
          telefone: c.wa_phone,
          nome: c.contact_name,
          ultimaMensagemEm: c.last_message_at,
          riskScore: c.risk_score,
          riskLevel: c.risk_level,
          transferedToHuman: Boolean(c.transferred_to_human),
        });
      }
    } else if (data.tipo === "nome") {
      const { data: conversas } = await supabaseAdmin
        .from("wa_conversations")
        .select("id, wa_phone, contact_name, last_message_at, risk_score, risk_level, transferred_to_human")
        .ilike("contact_name", `%${data.valor}%`)
        .order("last_message_at", { ascending: false })
        .limit(5);
      for (const c of conversas ?? []) {
        resultado.conversas.push({
          conversationId: c.id,
          telefone: c.wa_phone,
          nome: c.contact_name,
          ultimaMensagemEm: c.last_message_at,
          riskScore: c.risk_score,
          riskLevel: c.risk_level,
          transferedToHuman: Boolean(c.transferred_to_human),
        });
      }
    }

    return resultado;
  });
