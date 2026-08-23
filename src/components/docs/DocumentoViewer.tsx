/**
 * Visualizador in-app dos documentos (plano de viagem / bilhete / pedido).
 * Abre em uma janela flutuante com iframe — sem pop-up de navegador,
 * no mesmo padrão do comprovante de boleto.
 */
import { useEffect, useRef, useState } from "react";
import { Copy, Printer, Share2, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const DOC_EVENT = "viaair:documento";

export type DocEventDetail = { url: string; titulo?: string };

export function DocumentoViewer() {
  const [doc, setDoc] = useState<DocEventDetail | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const onDoc = (e: Event) => {
      const detail = (e as CustomEvent<DocEventDetail>).detail;
      if (detail?.url) setDoc(detail);
    };
    window.addEventListener(DOC_EVENT, onDoc as EventListener);
    return () => window.removeEventListener(DOC_EVENT, onDoc as EventListener);
  }, []);

  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDoc(null);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [doc]);

  if (!doc) return null;

  const imprimir = () => {
    try {
      frameRef.current?.contentWindow?.focus();
      frameRef.current?.contentWindow?.print();
    } catch {
      toast.error("Não foi possível imprimir aqui — use o botão de abrir.");
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(doc.url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const compartilhar = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: doc.titulo ?? "Documento VIA AIR", url: doc.url });
        return;
      } catch {
        /* usuário cancelou */
      }
    }
    window.location.href = `https://wa.me/?text=${encodeURIComponent(doc.url)}`;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-6">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[rgb(3,16,23)] shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <span className="truncate text-sm font-medium text-white/90">
            {doc.titulo ?? "Documento"}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={imprimir} title="Imprimir / salvar PDF">
              <Printer className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={compartilhar} title="Compartilhar">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={copiar} title="Copiar link">
              <Copy className="h-4 w-4" />
            </Button>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10"
              title="Abrir em nova aba"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <Button size="sm" variant="ghost" onClick={() => setDoc(null)} title="Fechar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <iframe
          ref={frameRef}
          src={doc.url}
          title={doc.titulo ?? "Documento"}
          className="h-full w-full flex-1 bg-white"
        />
      </div>
    </div>
  );
}
