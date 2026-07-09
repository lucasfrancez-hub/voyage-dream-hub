import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, Ticket } from "lucide-react";
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

const SITE_URL = "https://viaair.tur.br";

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Buscar", href: `${SITE_URL}/#buscar` },
  { label: "Destinos", href: `${SITE_URL}/#destinos` },
  { label: "Serviços", href: `${SITE_URL}/#servicos` },
  { label: "Corporativo", href: `${SITE_URL}/#corporativo` },
  { label: "Sobre", href: `${SITE_URL}/#sobre` },
  { label: "Contato", href: `${SITE_URL}/#contato` },
];

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
      href={backHref ?? SITE_URL}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-orange"
    >
      <ArrowLeft className="h-4 w-4" /> {backLabel}
    </a>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <img src={viaAirLogo.url} alt="Via Air" className="h-9 w-auto" />
        </Link>

        <nav className="hidden lg:flex items-center gap-7">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm text-muted-foreground hover:text-brand-orange transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/minhas-reservas"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-3 py-2 text-xs sm:text-sm font-semibold text-brand-orange hover:bg-brand-orange hover:text-white transition"
          >
            <Ticket className="h-4 w-4" />
            <span className="hidden sm:inline">Minhas reservas</span>
            <span className="sm:hidden">Reservas</span>
          </Link>
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:opacity-90 transition"
          >
            <MessageCircle className="h-4 w-4" /> <span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>
      </div>
      <div className="border-t border-border/40 bg-background/40">
        <div className="mx-auto max-w-7xl px-6 h-10 flex items-center">
          {backEl}
        </div>
      </div>
    </header>
  );
}
