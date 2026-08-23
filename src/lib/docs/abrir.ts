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
  const url = await linkDocumento(tipo, id, opcoes);
  if (!url) {
    toast.error("Não foi possível gerar o link do documento.");
    return;
  }
  const aba = window.open(url, "_blank", "noopener,noreferrer");
  if (!aba) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link do documento copiado — cole no navegador.");
    } catch {
      toast.error("Permita abrir novas abas para ver o documento.");
    }
  }
}
