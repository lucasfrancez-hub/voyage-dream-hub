/**
 * Abre o documento (plano de viagem / bilhete) em uma aba do navegador,
 * fora do painel admin — evita ficar "preso" dentro do app instalado (PWA).
 */
import { toast } from "sonner";
import { criarLinkComprovante } from "./comprovante.functions";

export type TipoDoc = "reserva" | "bilhete" | "pedido";

export async function linkDocumento(
  tipo: TipoDoc,
  id: string | number,
  opcoes: { semValores?: boolean } = {},
): Promise<string | null> {
  try {
    const r = await criarLinkComprovante({ data: { tipo, id: String(id) } });
    if (!r?.ok) return null;
    const url = new URL(r.caminho, window.location.origin);
    if (opcoes.semValores) url.searchParams.set("valores", "0");
    return url.toString();
  } catch {
    return null;
  }
}

export async function abrirDocumento(
  tipo: TipoDoc,
  id: string | number,
  opcoes: { semValores?: boolean } = {},
): Promise<void> {
  // A aba precisa ser aberta ANTES do await: Safari/iOS (e o app instalado)
  // bloqueiam window.open chamado depois de uma requisição.
  const aba = window.open("about:blank", "_blank", "noopener,noreferrer");
  const url = await linkDocumento(tipo, id, opcoes);
  if (!url) {
    aba?.close();
    toast.error("Não foi possível gerar o link do documento.");
    return;
  }
  if (aba && !aba.closed) {
    aba.location.replace(url);
    return;
  }
  const nova = window.open(url, "_blank", "noopener,noreferrer");
  if (nova) return;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link do documento copiado — cole no navegador.");
  } catch {
    toast.error("Permita abrir novas abas para ver o documento.");
  }
}

