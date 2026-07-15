import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Widget ClickSign carregado do CDN oficial.
// Doc: https://developers.clicksign.com/docs/introducao-ao-widget-embedded

type ClickSignWidgetInstance = {
  endpoint?: string;
  origin?: string;
  mount: (id: string) => void;
  unmount?: () => void;
  on: (event: "loaded" | "signed" | "resized" | "refused", cb: (payload?: unknown) => void) => void;
};

declare global {
  interface Window {
    Clicksign?: new (requestSignatureKey: string) => ClickSignWidgetInstance;
    clicksign?: new (requestSignatureKey: string) => ClickSignWidgetInstance;
  }
}

const SCRIPT_URL = "https://cdn-public-library.clicksign.com/embedded/embedded.min-1.0.0.js";
const CONTAINER_ID = "clicksign-embedded-container";

function loadScriptOnce(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Clicksign || window.clicksign) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar widget ClickSign")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar widget ClickSign"));
    document.head.appendChild(s);
  });
}

export function ClickSignEmbedded({
  open,
  onOpenChange,
  requestSignatureKey,
  endpoint,
  onSigned,
  onRefused,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  requestSignatureKey: string | null;
  endpoint: string | null;
  onSigned: () => void;
  onRefused?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState<number>(720);
  const widgetRef = useRef<ClickSignWidgetInstance | null>(null);

  useEffect(() => {
    if (!open || !requestSignatureKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        await loadScriptOnce();
        if (cancelled) return;
        const Ctor = window.Clicksign ?? window.clicksign;
        if (!Ctor) throw new Error("Widget ClickSign não disponível");
        // Esperar container aparecer no DOM (Dialog renderiza async)
        await new Promise<void>((resolve) => {
          const tryFind = () => {
            if (document.getElementById(CONTAINER_ID)) return resolve();
            requestAnimationFrame(tryFind);
          };
          tryFind();
        });
        if (cancelled) return;
        const w = new Ctor(requestSignatureKey);
        if (endpoint) w.endpoint = endpoint;
        w.origin = window.location.origin;
        w.on("loaded", () => setLoading(false));
        w.on("resized", (h) => {
          if (typeof h === "number") setHeight(Math.max(480, h));
        });
        w.on("signed", () => {
          onSigned();
        });
        w.on("refused", () => {
          onRefused?.();
        });
        w.mount(CONTAINER_ID);
        widgetRef.current = w;
      } catch (e) {
        console.error("[ClickSignEmbedded]", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro desconhecido");
      }
    })();

    return () => {
      cancelled = true;
      try {
        widgetRef.current?.unmount?.();
      } catch {
        /* noop */
      }
      widgetRef.current = null;
    };
  }, [open, requestSignatureKey, endpoint, onSigned, onRefused]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-2 border-b border-border">
          <DialogTitle className="text-base">Assinatura da autorização de débito</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Complete a verificação biométrica, foto do documento e permita o acesso à localização para concluir a assinatura.
          </p>
        </DialogHeader>
        <div className="relative bg-background" style={{ minHeight: 480 }}>
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-brand-orange" />
                Carregando ambiente seguro da ClickSign…
              </div>
            </div>
          )}
          {error && (
            <div className="p-6 text-sm text-red-600">
              Não foi possível abrir a assinatura: {error}
            </div>
          )}
          <div id={CONTAINER_ID} style={{ height, width: "100%" }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
