import type { Json } from "@/integrations/supabase/types";

/**
 * Cria (uma única vez) o pedido correspondente a uma solicitação de passaporte
 * assim que o pagamento é confirmado. Idempotente: se o passaporte já tem
 * order_id, apenas devolve o pedido existente.
 */
export async function sincronizarPedidoPassaporte(
  requestId: string,
): Promise<{ created: boolean; orderId: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error } = await supabaseAdmin
    .from("passport_requests")
    .select(
      "id, order_id, protocolo, service_type, status, payment_status, payment_method, amount, installments, invoice_url, paid_at, applicant_name, applicant_cpf, applicant_email, applicant_phone, dados_pessoais, documentos, complementares, pf_protocolo",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    console.error("[passaporte-order] leitura falhou", error.message);
    return { created: false, orderId: null };
  }
  if (!row) return { created: false, orderId: null };
  if ((row as any).order_id) return { created: false, orderId: (row as any).order_id as string };
  if (String(row.payment_status ?? "").toLowerCase() !== "paid") {
    return { created: false, orderId: null };
  }

  const parcelas = Number(row.installments ?? 1) || 1;
  const metodo = String(row.payment_method ?? "PIX").toUpperCase();
  const paymentMethod =
    metodo === "CREDIT_CARD" ? `credit_card_${parcelas}x` : "pix";

  const dados = (row.dados_pessoais ?? {}) as Record<string, any>;
  const complementares = (row.complementares ?? {}) as Record<string, any>;

  const nome =
    (row.applicant_name || dados.nome || dados.nome_completo || "Cliente").toString();
  const email = (row.applicant_email || complementares.email || "").toString().toLowerCase();
  const telefone = (row.applicant_phone || complementares.telefone || "").toString();

  const snapshot = {
    kind: "passaporte",
    passport_request_id: row.id,
    protocolo: row.protocolo,
    pf_protocolo: row.pf_protocolo ?? null,
    service_type: row.service_type,
    description: `Passaporte — protocolo ${row.protocolo}`,
    total: Number(row.amount ?? 0),
    installments: parcelas,
    payment_method: metodo,
    invoice_url: row.invoice_url ?? null,
    paid_at: row.paid_at ?? null,
    dados_pessoais: dados,
    documentos: row.documentos ?? {},
    complementares,
  };

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("orders")
    .insert({
      package_id: null,
      package_snapshot: snapshot as unknown as Json,
      full_name: nome,
      email: email || null,
      phone: telefone || null,
      cpf: row.applicant_cpf ?? null,
      adults: 1,
      children: 0,
      payment_method: paymentMethod,
      total_price: Number(row.amount ?? 0),
      status: "confirmed",
      notes: `Solicitação de passaporte ${row.protocolo}`,
    } as never)
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[passaporte-order] insert falhou", insErr?.message);
    return { created: false, orderId: null };
  }

  const { error: linkErr } = await supabaseAdmin
    .from("passport_requests")
    .update({ order_id: inserted.id } as never)
    .eq("id", row.id)
    .is("order_id", null);

  if (linkErr) {
    console.error("[passaporte-order] vínculo falhou", linkErr.message);
  }

  console.info("[passaporte-order] pedido criado", {
    requestId: row.id,
    orderId: inserted.id,
    protocolo: row.protocolo,
  });

  return { created: true, orderId: inserted.id };
}
