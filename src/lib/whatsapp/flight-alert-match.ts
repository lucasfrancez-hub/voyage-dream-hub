/**
 * Detecta se um texto recebido bate com o TÍTULO de um botão do robô de
 * alteração de voo (UazAPI e alguns clientes Meta devolvem só o texto do botão,
 * sem o `interactive.button_reply.id`).
 */
export function matchFlightAlertButton(text: string): "reschedule" | "refund" | "ack" | null {
  const t = text.trim().toLowerCase();
  if (t === "remarcar voo" || t === "remarcar") return "reschedule";
  if (t === "solicitar reembolso" || t === "reembolso") return "refund";
  if (t === "ok, ciente" || t === "ok ciente" || t === "ciente") return "ack";
  return null;
}
