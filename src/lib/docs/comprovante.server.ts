/**
 * Documentos públicos (Plano de Viagem / Bilhete Eletrônico) fora do painel.
 * O link carrega um token assinado (HMAC) — sem token válido nada é devolvido.
 */
import type { ComprovanteReservaDados } from "@/components/passhub/ComprovanteReserva";
import type { OrderDetail } from "@/lib/orders.functions";

export type TipoDoc = "reserva" | "bilhete" | "pedido";

function segredo(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_URL || "";
  if (!s) throw new Error("Segredo de assinatura indisponível");
  return s;
}

function base64url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function assinarDoc(tipo: TipoDoc, id: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`viaair-doc:${tipo}:${id}`),
  );
  return base64url(sig).slice(0, 32);
}

export async function tokenValido(tipo: TipoDoc, id: string, token: string): Promise<boolean> {
  const esperado = await assinarDoc(tipo, id);
  if (token.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------ carregamento ------------------------------ */

async function docPassHub(id: number, comBilhete: boolean): Promise<ComprovanteReservaDados> {
  const { passhubReservaDetalhe } = await import("@/lib/passhub/reservas.server");
  const { paraComprovante, comBilhetes, reservaEmitida } = await import(
    "@/lib/passhub/comprovante"
  );
  const reserva = await passhubReservaDetalhe(id);
  if (!reserva) throw new Error("Reserva não encontrada");
  const base = paraComprovante(reserva);
  // O plano de viagem também mostra a seção "Bilhetes emitidos" quando já emitida.
  if (!comBilhete && !reservaEmitida(reserva)) return base;

  const { passhubNumerosBilhete } = await import("@/lib/passhub/bilhete.server");
  let numeros: { passageiro: string; numero: string }[] = [];
  try {
    const bilhete = await passhubNumerosBilhete(id, { localizador: reserva.localizador });
    numeros = bilhete.numeros ?? [];
  } catch {
    numeros = [];
  }
  const comDados = comBilhetes(base, numeros, reserva.emitidaEm ?? null);
  return comBilhete ? { ...comDados, variante: "bilhete" } : comDados;
}

async function docPedido(id: string): Promise<ComprovanteReservaDados> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { pedidoParaComprovante } = await import("@/lib/orders/plano-viagem");

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!order) throw new Error("Pedido não encontrado");

  const [{ data: passengers }, { data: items }] = await Promise.all([
    supabaseAdmin
      .from("order_passengers")
      .select("*")
      .eq("order_id", id)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  const o = order as Record<string, any>;
  const detail = {
    order: {
      id: o.id,
      orderNumber: o.order_number ?? String(o.id).slice(0, 8).toUpperCase(),
      createdAt: o.created_at,
      status: o.status,
      fullName: o.full_name ?? "",
      email: o.email ?? "",
      phone: o.phone ?? "",
      totalPrice: Number(o.total_price ?? 0),
      sellerName: o.seller_name ?? null,
      airlineLocator: o.airline_locator ?? null,
      tripTitle: o.trip_title ?? null,
      packageSnapshot: o.package_snapshot ?? {},
    },
    passengers: passengers ?? [],
    items: (items ?? []).map((i: Record<string, any>) => ({
      id: i.id,
      order_id: i.order_id,
      kind: i.kind,
      status: i.status,
      title: i.title,
      supplier_locator: i.supplier_locator,
      details: i.details ?? {},
      sort_order: i.sort_order,
    })),
    financials: [],
    payments: [],
    itemPassengers: {},
  } as unknown as OrderDetail;

  return pedidoParaComprovante(detail);
}

export async function carregarDocPublico(
  tipo: TipoDoc,
  id: string,
): Promise<ComprovanteReservaDados> {
  if (tipo === "pedido") return docPedido(id);
  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) throw new Error("Documento inválido");
  return docPassHub(num, tipo === "bilhete");
}
