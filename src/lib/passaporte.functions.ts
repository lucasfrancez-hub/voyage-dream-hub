import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mapPassport,
  passportPaymentSchema,
  passportStepSchema,
  proximoVencimento,
  PASSAPORTE_PRECO_CARTAO,
  PASSAPORTE_PRECO_PIX,
  type PassportPublic,
} from "./passaporte.server";

const SELECT = "*";

/** Busca pública da solicitação pelo token do link. */
export const getPassportRequest = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(6).max(64) }).parse(input))
  .handler(async ({ data }): Promise<PassportPublic | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("passport_requests")
      .select(SELECT)
      .eq("token", data.token)
      .maybeSingle();
    return row ? mapPassport(row as Record<string, any>) : null;
  });

/** Salva o progresso de uma etapa do formulário público. */
export const savePassportStep = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => passportStepSchema.parse(input))
  .handler(async ({ data }): Promise<PassportPublic> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.dadosPessoais) {
      patch.dados_pessoais = data.dadosPessoais;
      const nome = String(data.dadosPessoais["nomeCompleto"] ?? "").trim();
      if (nome) patch.applicant_name = nome;
    }
    if (data.documentos) {
      patch.documentos = data.documentos;
      const cpf = String(data.documentos["cpf"] ?? "").trim();
      if (cpf) patch.applicant_cpf = cpf;
    }
    if (data.complementares) {
      patch.complementares = data.complementares;
      const email = String(data.complementares["email"] ?? "").trim();
      if (email) patch.applicant_email = email;
      const tel = String(data.complementares["telefone"] ?? "").trim();
      if (tel) patch.applicant_phone = tel;
    }
    patch.status = "em_preenchimento";

    const { data: row, error } = await supabaseAdmin
      .from("passport_requests")
      .update(patch as never)
      .eq("token", data.token)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return mapPassport(row as Record<string, any>);
  });

/** Finaliza a solicitação e cria a cobrança (Pix ou cartão). */
export const submitPassportPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => passportPaymentSchema.parse(input))
  .handler(async ({ data }): Promise<PassportPublic> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureAsaasCustomer, createAsaasDirectCharge } = await import("./asaas.server");

    const { data: current, error: findErr } = await supabaseAdmin
      .from("passport_requests")
      .select(SELECT)
      .eq("token", data.token)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!current) throw new Error("Solicitação não encontrada.");

    const row = current as Record<string, any>;
    if (row.asaas_payment_id) return mapPassport(row);

    const isPix = data.metodo === "PIX";
    const valor = isPix ? PASSAPORTE_PRECO_PIX : PASSAPORTE_PRECO_CARTAO;
    const parcelas = isPix ? null : Math.min(Math.max(data.parcelas ?? 1, 1), 10);

    if (data.metodo === "CREDIT_CARD") {
      if (!data.cartaoTitular || !data.cartaoNumero || !data.cartaoMes || !data.cartaoAno || !data.cartaoCvv) {
        throw new Error("Preencha todos os dados do cartão.");
      }
    }

    const customerId = await ensureAsaasCustomer({
      name: data.nome,
      cpfCnpj: data.cpf,
      email: data.email,
      phone: data.telefone ?? null,
      postalCode: data.cep,
      address: data.endereco ?? null,
      addressNumber: data.numero,
      complement: data.complemento ?? null,
      province: data.bairro ?? null,
      city: data.cidade ?? null,
      state: data.estado ?? null,
      externalReference: row.protocolo,
    });

    const charge = await createAsaasDirectCharge({
      customerId,
      billingType: data.metodo,
      value: valor,
      dueDate: proximoVencimento(isPix ? 1 : 3),
      description: `Renovação de passaporte — protocolo ${row.protocolo}`,
      externalReference: row.protocolo,
      installmentCount: parcelas,
      card:
        data.metodo === "CREDIT_CARD"
          ? {
              holderName: data.cartaoTitular!,
              number: data.cartaoNumero!,
              expiryMonth: data.cartaoMes!,
              expiryYear: data.cartaoAno!,
              ccv: data.cartaoCvv!,
            }
          : undefined,
      holder:
        data.metodo === "CREDIT_CARD"
          ? {
              name: data.nome,
              email: data.email,
              cpfCnpj: data.cpf,
              postalCode: data.cep,
              addressNumber: data.numero,
              addressComplement: data.complemento ?? null,
              phone: data.telefone ?? null,
            }
          : undefined,
    });

    const pago = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(String(charge.status));

    const { data: updated, error } = await supabaseAdmin
      .from("passport_requests")
      .update({
        status: "enviado",
        submitted_at: new Date().toISOString(),
        payment_method: data.metodo,
        amount: valor,
        installments: parcelas,
        payment_status: pago ? "paid" : String(charge.status ?? "pending").toLowerCase(),
        paid_at: pago ? new Date().toISOString() : null,
        asaas_payment_id: charge.paymentId,
        invoice_url: charge.invoiceUrl,
        pix_payload: charge.pixPayload,
        pix_qr_base64: charge.pixEncodedImage,
        applicant_name: data.nome,
        applicant_cpf: data.cpf,
        applicant_email: data.email,
        applicant_phone: data.telefone ?? null,
        complementares: {
          ...(row.complementares ?? {}),
          cep: data.cep,
          logradouro: data.endereco ?? "",
          numero: data.numero,
          complemento: data.complemento ?? "",
          bairro: data.bairro ?? "",
          cidade: data.cidade ?? "",
          uf: data.estado ?? "",
          email: data.email,
          telefone: data.telefone ?? "",
        },
      })
      .eq("token", data.token)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return mapPassport(updated as Record<string, any>);
  });

/* ---------------- Admin ---------------- */

export type PassportAdminRow = PassportPublic & {
  createdAt: string;
  applicantEmail: string | null;
  applicantPhone: string | null;
  pfProtocoloAt: string | null;
  pfNotes: string | null;
  applicantCpf: string | null;
  paidAt: string | null;
  submittedAt: string | null;
  asaasPaymentId: string | null;
};

const mapAdmin = (row: Record<string, any>): PassportAdminRow => ({
  ...mapPassport(row),
  createdAt: row.created_at,
  applicantEmail: row.applicant_email ?? null,
  applicantPhone: row.applicant_phone ?? null,
  pfProtocoloAt: row.pf_protocolo_at ?? null,
  pfNotes: row.pf_notes ?? null,
  applicantCpf: row.applicant_cpf ?? null,
  paidAt: row.paid_at ?? null,
  submittedAt: row.submitted_at ?? null,
  asaasPaymentId: row.asaas_payment_id ?? null,
});

export const listPassportRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PassportAdminRow[]> => {
    const { data, error } = await context.supabase
      .from("passport_requests")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => mapAdmin(r as Record<string, any>));
  });

export const createPassportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        nome: z.string().max(120).optional().nullable(),
        telefone: z.string().max(20).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PassportAdminRow> => {
    const { data: row, error } = await context.supabase
      .from("passport_requests")
      .insert({
        applicant_name: data.nome?.trim() || null,
        applicant_phone: data.telefone?.trim() || null,
        created_by: context.userId,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return mapAdmin(row as Record<string, any>);
  });

export const updatePassportAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        pfProtocolo: z.string().max(60).optional().nullable(),
        pfNotes: z.string().max(1000).optional().nullable(),
        status: z.string().max(40).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PassportAdminRow> => {
    const patch: Record<string, unknown> = {};
    if (data.pfProtocolo !== undefined) {
      patch.pf_protocolo = data.pfProtocolo?.trim() || null;
      patch.pf_protocolo_at = data.pfProtocolo?.trim() ? new Date().toISOString() : null;
    }
    if (data.pfNotes !== undefined) patch.pf_notes = data.pfNotes?.trim() || null;
    if (data.status) patch.status = data.status;

    const { data: row, error } = await context.supabase
      .from("passport_requests")
      .update(patch as never)
      .eq("id", data.id)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return mapAdmin(row as Record<string, any>);
  });
