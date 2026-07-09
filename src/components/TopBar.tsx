import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";
import { WHATSAPP_PHONE } from "@/lib/checkout-config";

type TopBarProps = {
  backHref?: string;
  backLabel?: string;
  backTo?: string;
  backParams?: Record<string, string>;
  whatsappMessage?: string;
  rightExtra?: ReactNode;
};

export function TopBar({
  backHref,
  backTo,
  backParams,
  backLabel = "Voltar ao site",
  whatsappMessage = "Olá! Vim pelo site da Via Air e gostaria de ajuda.",
}: TopBarProps) {
  const waUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(whatsappMessage)}`;

  const backEl = backTo ? (
    <Link
      to={backTo as never}
      params={backParams as never}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-orange"
    >
      <ArrowLeft className="h-4 w-4" /> {backLabel}
    </Link>
  ) : (
    <a
      href={backHref ?? "https://viaair.tur.br"}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-orange"
    >
      <ArrowLeft className="h-4 w-4" /> {backLabel}
    </a>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <img src={viaAirLogo.url} alt="Via Air" className="h-9 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
          {backEl}
        </div>
      </div>
    </header>
  );
}
