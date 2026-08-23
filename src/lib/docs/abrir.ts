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

const TITULOS: Record<TipoDoc, string> = {
  reserva: "Plano de viagem",
  bilhete: "Bilhete eletrônico",
  pedido: "Plano de viagem",
};

export async function abrirDocumento(
  tipo: TipoDoc,
  id: string | number,
  opcoes: { semValores?: boolean } = {},
): Promise<void> {
  // Sem pop-up: o documento abre em uma janela flutuante dentro do app
  // (mesmo padrão do comprovante de boleto).
  const url = await linkDocumento(tipo, id, opcoes);
  if (!url) {
    toast.error("Não foi possível gerar o link do documento.");
    return;
  }
  window.dispatchEvent(
    new CustomEvent(DOC_EVENT, { detail: { url, titulo: TITULOS[tipo] } }),
  );
}

