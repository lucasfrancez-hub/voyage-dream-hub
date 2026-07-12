export function paymentMethodLabel(pm: string | null | undefined): {
  label: string;
  className: string;
} {
  if (!pm) return { label: "—", className: "bg-muted text-muted-foreground" };
  const v = pm.toLowerCase();
  if (v.startsWith("credit_card")) {
    const match = v.match(/(\d+)x/);
    const suffix = match ? ` ${match[1]}x` : "";
    return {
      label: `Cartão${suffix}`,
      className: "bg-blue-500/15 text-blue-400",
    };
  }
  if (v === "pix") {
    return { label: "PIX", className: "bg-emerald-500/15 text-emerald-500" };
  }
  if (v === "whatsapp") {
    return { label: "WhatsApp", className: "bg-emerald-500/15 text-emerald-500" };
  }
  if (v === "boleto") {
    return { label: "Boleto", className: "bg-amber-500/15 text-amber-500" };
  }
  return { label: pm, className: "bg-muted text-muted-foreground" };
}

export const ORDER_STATUSES = [
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Finalizado" },
  { value: "rejected", label: "Rejeitado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

export function statusLabel(status: string | null | undefined): {
  label: string;
  className: string;
} {
  const s = (status || "pending").toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "bg-yellow-500/15 text-yellow-500" },
    paid: { label: "Finalizado", className: "bg-green-500/15 text-green-500" },
    approved: { label: "Finalizado", className: "bg-green-500/15 text-green-500" },
    rejected: { label: "Rejeitado", className: "bg-red-500/15 text-red-500" },
    cancelled: { label: "Cancelado", className: "bg-red-500/15 text-red-500" },
    canceled: { label: "Cancelado", className: "bg-red-500/15 text-red-500" },
  };
  return map[s] ?? { label: s, className: "bg-muted text-muted-foreground" };
}

// Status por ITEM (aéreo/hospedagem/outros): fluxo solicitado → reservado → confirmado.
export const ITEM_STATUSES = [
  { value: "pending", label: "Solicitado" },
  { value: "reserved", label: "Reservado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

export function itemStatusBadge(status: string | null | undefined): {
  label: string;
  className: string;
} {
  const s = (status || "pending").toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    pending:   { label: "SOLICITADO", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
    reserved:  { label: "RESERVADO",  className: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
    confirmed: { label: "CONFIRMADO", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
    cancelled: { label: "CANCELADO",  className: "bg-red-500/15 text-red-500 border-red-500/30" },
  };
  return map[s] ?? { label: s.toUpperCase(), className: "bg-muted text-muted-foreground border-border" };
}
