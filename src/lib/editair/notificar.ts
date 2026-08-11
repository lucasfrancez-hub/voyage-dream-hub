/**
 * Notificação de conclusão: toast discreto e, no Desktop, notificação nativa
 * quando a janela não está em foco.
 */
import { toast } from "sonner";

export function avisarConclusao(mensagem: string, detalhe?: string) {
  toast.success(mensagem, detalhe ? { description: detalhe } : undefined);
  notificarNativo("EditAir", mensagem);
}

export function avisarFalha(mensagem: string, aoRepetir?: () => void) {
  toast.error(mensagem, aoRepetir ? { action: { label: "Tentar novamente", onClick: aoRepetir } } : undefined);
}

function notificarNativo(titulo: string, corpo: string) {
  if (typeof window === "undefined") return;
  // só incomoda quando o usuário não está olhando
  if (typeof document !== "undefined" && document.hasFocus()) return;
  const api = (window as unknown as { editair?: { notificar?: (t: string, c: string) => void } }).editair;
  if (api?.notificar) {
    try {
      api.notificar(titulo, corpo);
      return;
    } catch (e) {
      console.warn("[editair] notificação nativa falhou", e);
    }
  }
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(titulo, { body: corpo });
    }
  } catch (e) {
    console.warn("[editair] Notification indisponível", e);
  }
}
