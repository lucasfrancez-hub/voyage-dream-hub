/**
 * Validação de cartão por 3D Secure (Stripe) — SERVER ONLY.
 *
 * Regras:
 *  - Autorização temporária de R$ 1,00 com captura manual; NUNCA capturamos.
 *  - Só é aprovado quando a Stripe devolve three_d_secure.result === "authenticated".
 *  - A aprovação vale 15 minutos e apenas para a reserva vinculada.
 *  - Nada de PAN/CVV: guardamos só bandeira, 4 últimos dígitos e fingerprint.
 */
import type Stripe from "stripe";
import { stripeClient, VALIDADE_3DS_MINUTOS } from "./stripe.server";

export type ResultadoValidacao3DS = {
  ok: boolean;
  status: string;
  resultado3ds: string | null;
  fluxo: string | null;
  bandeira: string | null;
  final: string | null;
  autenticadoEm: string | null;
  expiraEm: string | null;
  autorizacaoCancelada: boolean;
  erro?: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Cria a autorização temporária de R$ 1,00 exigindo desafio 3DS. */
export async function criarValidacao3DS(reservaId: string) {
  const stripe = stripeClient();
  const intent = await stripe.paymentIntents.create({
    amount: 100,
    currency: "brl",
    payment_method_types: ["card"],
    capture_method: "manual",
    payment_method_options: { card: { request_three_d_secure: "challenge" } },
    metadata: { reservation_id: reservaId, purpose: "card_3ds_validation" },
    description: `Validação 3DS - Reserva ${reservaId}`,
  });

  const db = await admin();
  await db.from("card_3ds_validations").upsert(
    {
      reservation_id: reservaId,
      stripe_payment_intent_id: intent.id,
      status: "pending",
    },
    { onConflict: "stripe_payment_intent_id" },
  );

  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

function detalhesCartao(intent: Stripe.PaymentIntent) {
  const charge = intent.latest_charge as Stripe.Charge | null;
  const card = charge?.payment_method_details?.card ?? null;
  const tds = card?.three_d_secure ?? null;
  return {
    card,
    resultado: (tds?.result as string | undefined) ?? null,
    fluxo:
      (tds?.authentication_flow as string | undefined) ??
      (tds?.version ? `3DS ${tds.version}` : null),
  };
}

/** Consulta a Stripe, valida o 3DS, cancela a autorização e grava o resultado. */
export async function verificarValidacao3DS(
  reservaId: string,
  paymentIntentId: string,
): Promise<ResultadoValidacao3DS> {
  const stripe = stripeClient();
  const db = await admin();

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });
  } catch (e) {
    return {
      ok: false,
      status: "erro",
      resultado3ds: null,
      fluxo: null,
      bandeira: null,
      final: null,
      autenticadoEm: null,
      expiraEm: null,
      autorizacaoCancelada: false,
      erro:
        e instanceof Error
          ? `Não foi possível consultar a autorização na Stripe: ${e.message}`
          : "Não foi possível consultar a autorização na Stripe.",
    };
  }

  // Impede reaproveitar a autenticação de outra reserva.
  if ((intent.metadata?.["reservation_id"] ?? "") !== reservaId) {
    await cancelarSeAberto(stripe, intent);
    return {
      ok: false,
      status: "reserva_incompativel",
      resultado3ds: null,
      fluxo: null,
      bandeira: null,
      final: null,
      autenticadoEm: null,
      expiraEm: null,
      autorizacaoCancelada: true,
      erro: "Esta validação pertence a outra reserva. Refaça a verificação.",
    };
  }

  const { card, resultado, fluxo } = detalhesCartao(intent);
  const autenticado = resultado === "authenticated" && intent.status === "requires_capture";
  const cancelada = await cancelarSeAberto(stripe, intent);

  const agora = new Date();
  const expira = new Date(agora.getTime() + VALIDADE_3DS_MINUTOS * 60_000);

  const registro = {
    reservation_id: reservaId,
    stripe_payment_intent_id: intent.id,
    status: autenticado ? "authenticated" : "failed",
    three_ds_result: resultado,
    authentication_flow: fluxo,
    card_brand: card?.brand ?? null,
    card_last4: card?.last4 ?? null,
    card_fingerprint: card?.fingerprint ?? null,
    authenticated_at: autenticado ? agora.toISOString() : null,
    expires_at: autenticado ? expira.toISOString() : null,
  };
  await db
    .from("card_3ds_validations")
    .upsert(registro, { onConflict: "stripe_payment_intent_id" });

  if (autenticado) {
    return {
      ok: true,
      status: "authenticated",
      resultado3ds: resultado,
      fluxo,
      bandeira: card?.brand ?? null,
      final: card?.last4 ?? null,
      autenticadoEm: agora.toISOString(),
      expiraEm: expira.toISOString(),
      autorizacaoCancelada: cancelada,
    };
  }

  return {
    ok: false,
    status: intent.status,
    resultado3ds: resultado,
    fluxo,
    bandeira: card?.brand ?? null,
    final: card?.last4 ?? null,
    autenticadoEm: null,
    expiraEm: null,
    autorizacaoCancelada: cancelada,
    erro: mensagemFalha(intent, resultado),
  };
}

function mensagemFalha(intent: Stripe.PaymentIntent, resultado: string | null) {
  if (intent.status === "canceled") return "A autorização foi cancelada ou expirou. Tente novamente.";
  if (intent.status === "requires_payment_method")
    return (
      intent.last_payment_error?.message ??
      "O cartão foi recusado pelo banco. Tente outro cartão."
    );
  if (intent.status === "requires_action")
    return "A autenticação no banco não foi concluída. Refaça a verificação.";
  if (resultado === "attempt_acknowledged")
    return "O banco apenas registrou a tentativa, sem autenticar o portador. Use outro cartão.";
  if (resultado === "not_supported")
    return "Este cartão não suporta 3D Secure. Use outro cartão.";
  if (resultado === "failed") return "A autenticação 3D Secure falhou. Tente outro cartão.";
  return "Não foi possível confirmar a identidade do portador através do 3D Secure.";
}

/** Cancela a autorização de R$ 1,00 — nunca capturamos o valor. */
async function cancelarSeAberto(stripe: Stripe, intent: Stripe.PaymentIntent) {
  const cancelavel = [
    "requires_capture",
    "requires_action",
    "requires_payment_method",
    "requires_confirmation",
    "processing",
  ].includes(intent.status);
  if (!cancelavel) return intent.status === "canceled";
  try {
    await stripe.paymentIntents.cancel(intent.id);
    return true;
  } catch {
    return false;
  }
}

export type Situacao3DS = {
  liberado: boolean;
  status: string | null;
  expirado: boolean;
  resultado3ds: string | null;
  fluxo: string | null;
  bandeira: string | null;
  final: string | null;
  autenticadoEm: string | null;
  expiraEm: string | null;
};

/** Situação atual da reserva (última validação registrada). */
export async function situacao3DS(reservaId: string): Promise<Situacao3DS> {
  const db = await admin();
  const { data } = await db
    .from("card_3ds_validations")
    .select("*")
    .eq("reservation_id", reservaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return {
      liberado: false,
      status: null,
      expirado: false,
      resultado3ds: null,
      fluxo: null,
      bandeira: null,
      final: null,
      autenticadoEm: null,
      expiraEm: null,
    };
  }

  const expirado = !!data.expires_at && new Date(data.expires_at).getTime() <= Date.now();
  const liberado =
    data.status === "authenticated" &&
    data.three_ds_result === "authenticated" &&
    !!data.authenticated_at &&
    !expirado;

  return {
    liberado,
    status: data.status,
    expirado: data.status === "authenticated" && expirado,
    resultado3ds: data.three_ds_result,
    fluxo: data.authentication_flow,
    bandeira: data.card_brand,
    final: data.card_last4,
    autenticadoEm: data.authenticated_at,
    expiraEm: data.expires_at,
  };
}

/**
 * Trava de backend: só deixa emitir quando existe validação 3DS válida.
 * Lança erro quando não houver.
 */
export async function garantirValidacao3DS(reservaId: string) {
  const s = await situacao3DS(reservaId);
  if (s.liberado) return s;
  if (s.expirado) throw new Error("VALIDAÇÃO 3DS EXPIRADA — refaça a verificação do cartão.");
  throw new Error("Emissão bloqueada: o cartão ainda não foi validado com 3D Secure.");
}
