import {
  saveManualOpportunity,
  type ManualOpportunityInput,
  type ManualOpportunityResult,
} from "@/lib/airfare-promos.manual.server";

type QueueRow = {
  id: string;
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  return_date: string | null;
  reference_price: number | null;
  origin_city: string | null;
  destination_city: string | null;
};

async function processClaimedRow(row: QueueRow) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    const result = await saveManualOpportunity({
      origin: row.origin_iata,
      destination: row.destination_iata,
      departureDate: row.departure_date,
      returnDate: row.return_date,
      referencePrice: row.reference_price,
      originCity: row.origin_city,
      destinationCity: row.destination_city,
    });

    if (!result.ok) {
      await supabaseAdmin
        .from("airfare_manual_queue")
        .update({
          status: "error",
          error: "Tarifa não encontrada no motor VIA AIR",
          detail: "Cotação encerrada sem tarifa disponível",
          finished_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      return result;
    }

    await supabaseAdmin
      .from("airfare_manual_queue")
      .update({
        status: "done",
        detail: `${result.originCity} → ${result.destinationCity}`,
        error: null,
        promotion_id: result.promotionId,
        result,
        finished_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao cotar no motor VIA AIR";
    await supabaseAdmin
      .from("airfare_manual_queue")
      .update({ status: "error", error: message, finished_at: new Date().toISOString() })
      .eq("id", row.id);
    throw error;
  }
}

async function claimAndProcess(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("airfare_manual_queue")
    .update({
      status: "running",
      detail: "Cotando no motor VIA AIR…",
      started_at: new Date().toISOString(),
      attempts: 1,
      error: null,
    })
    .eq("id", id)
    .eq("status", "queued")
    .select("id,origin_iata,destination_iata,departure_date,return_date,reference_price,origin_city,destination_city")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  return processClaimedRow(row as QueueRow);
}

export async function enqueueManualOpportunity(
  input: ManualOpportunityInput,
  userId: string,
  processImmediately = true,
): Promise<ManualOpportunityResult | { ok: true; queued: true; id: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const normalized = {
    created_by: userId,
    origin_iata: input.origin.trim().toUpperCase(),
    destination_iata: input.destination.trim().toUpperCase(),
    departure_date: input.departureDate,
    return_date: input.returnDate?.trim() || null,
    reference_price: input.referencePrice ?? null,
    origin_city: input.originCity ?? null,
    destination_city: input.destinationCity ?? null,
    detail: "Aguardando cotação",
  };

  const { data: inserted, error } = await supabaseAdmin
    .from("airfare_manual_queue")
    .insert(normalized)
    .select("id")
    .maybeSingle();

  let id = inserted?.id as string | undefined;
  if (error?.code === "23505") {
    let existingQuery = supabaseAdmin
      .from("airfare_manual_queue")
      .select("id")
      .eq("origin_iata", normalized.origin_iata)
      .eq("destination_iata", normalized.destination_iata)
      .eq("departure_date", normalized.departure_date)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1);
    existingQuery = normalized.return_date == null
      ? existingQuery.is("return_date", null)
      : existingQuery.eq("return_date", normalized.return_date);
    const { data: existing } = await existingQuery.maybeSingle();
    id = existing?.id as string | undefined;
  } else if (error) {
    throw new Error(error.message);
  }
  if (!id) throw new Error("Não foi possível registrar a cotação na fila");

  // O clique precisa estar persistido antes de aguardar sua vez no motor.
  // Assim, uma atualização/fechamento da tela não perde os próximos itens.
  if (!processImmediately) return { ok: true, queued: true, id };

  const result = await claimAndProcess(id);
  if (result) return result;

  const { data: current } = await supabaseAdmin
    .from("airfare_manual_queue")
    .select("status,result,error")
    .eq("id", id)
    .maybeSingle();
  if (current?.status === "done" && current.result) {
    return current.result as unknown as ManualOpportunityResult;
  }
  if (current?.status === "error") return { ok: false as const, reason: "no_fare" as const };
  return { ok: false as const, reason: "no_fare" as const };
}

export async function processManualOpportunity(id: string): Promise<ManualOpportunityResult | null> {
  return claimAndProcess(id);
}

export async function resumeManualQueue(limit = 3) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const stale = new Date(Date.now() - 15 * 60_000).toISOString();
  await supabaseAdmin
    .from("airfare_manual_queue")
    .update({ status: "queued", detail: "Retomando cotação interrompida" })
    .eq("status", "running")
    .lt("updated_at", stale);

  const { data: rows, error } = await supabaseAdmin
    .from("airfare_manual_queue")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  let processed = 0;
  for (const row of rows ?? []) {
    const result = await claimAndProcess(row.id);
    if (result) processed += 1;
  }
  return { processed };
}