import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, Ticket, Ship, Package as PackageIcon, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";
import { WHATSAPP_PHONE } from "@/lib/checkout-config";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
  { label: "Página inicial", href: SITE_URL },
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
  const [open, setOpen] = useState(false);
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
        <div className="flex items-center gap-2 min-w-0">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="lg:hidden inline-flex items-center justify-center h-10 w-10 rounded-full border border-border/60 bg-background/60 text-foreground hover:text-brand-orange hover:border-brand-orange/50 transition shrink-0"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[85%] max-w-sm p-0">
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60">
                <SheetTitle className="flex items-center gap-3">
                  <img src={viaAirLogo.url} alt="Via Air" className="h-8 w-auto" />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col p-3">
                <Link
                  to="/ingressos"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground hover:bg-brand-orange/10 hover:text-brand-orange transition"
                >
                  <Ticket className="h-4 w-4" /> Ingressos
                </Link>
                <Link
                  to="/pacotes"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground hover:bg-brand-orange/10 hover:text-brand-orange transition"
                >
                  <PackageIcon className="h-4 w-4" /> Pacotes
                </Link>
                <div className="my-2 h-px bg-border/60" />
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  >
                    {item.label}
                  </a>
                ))}
                <div className="my-2 h-px bg-border/60" />
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl bg-brand-orange px-4 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </nav>
            </SheetContent>
          </Sheet>
          <a href="https://viaair.tur.br" className="flex items-center gap-3 shrink-0">
            <img src={viaAirLogo.url} alt="Via Air" className="h-9 w-auto" />
          </a>
        </div>

        <nav className="hidden lg:flex items-center gap-6">
          <Link to="/ingressos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-orange transition-colors">
            <Ticket className="h-3.5 w-3.5" /> Ingressos
          </Link>
          <Link to="/cruzeiros" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-orange transition-colors">
            <Ship className="h-3.5 w-3.5" /> Cruzeiros
          </Link>
          <Link to="/pacotes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-orange transition-colors">
            <PackageIcon className="h-3.5 w-3.5" /> Pacotes
          </Link>
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
