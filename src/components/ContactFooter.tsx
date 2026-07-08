import { MessageCircle, Mail, Phone, Instagram } from "lucide-react";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";
import { WHATSAPP_PHONE, whatsappUrl, NOTIFICATION_EMAIL } from "@/lib/checkout-config";

const PHONE_DISPLAY = "(44) 99951-4838";
const INSTAGRAM = "@viaairs";
const INSTAGRAM_URL = "https://instagram.com/viaairs";
const CNPJ = "56.339.877/0001-66";
const CITY_STATE = "Paranavaí • Paraná";

export function ContactFooter({
  intro = "Envie sua ideia de viagem e nosso time monta um orçamento personalizado para você.",
  whatsappMessage = "Olá! Quero um orçamento personalizado de viagem.",
}: {
  intro?: string;
  whatsappMessage?: string;
}) {
  return (
    <footer className="border-t border-border bg-background">
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-24 text-center">
        <span className="text-brand-orange text-xs md:text-sm font-semibold uppercase tracking-[0.25em]">
          Fale com a gente
        </span>
        <h2 className="mt-3 font-display text-4xl md:text-6xl font-bold">Pronto para embarcar?</h2>
        <p className="mt-4 mx-auto max-w-2xl text-muted-foreground">{intro}</p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={whatsappUrl(whatsappMessage)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-7 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition"
          >
            <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
          </a>
          <a
            href={`mailto:${NOTIFICATION_EMAIL}`}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-7 py-3 font-semibold hover:border-brand-orange transition"
          >
            <Mail className="h-4 w-4" /> Enviar e-mail
          </a>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto text-sm text-muted-foreground">
          <a
            href={`tel:+55${WHATSAPP_PHONE.replace(/\D/g, "")}`}
            className="inline-flex items-center justify-center gap-2 hover:text-brand-orange transition"
          >
            <Phone className="h-4 w-4 text-brand-orange" /> {PHONE_DISPLAY}
          </a>
          <a
            href={`mailto:${NOTIFICATION_EMAIL}`}
            className="inline-flex items-center justify-center gap-2 hover:text-brand-orange transition"
          >
            <Mail className="h-4 w-4 text-brand-orange" /> {NOTIFICATION_EMAIL}
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 hover:text-brand-orange transition"
          >
            <Instagram className="h-4 w-4 text-brand-orange" /> {INSTAGRAM}
          </a>
        </div>
      </section>

      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={viaAirLogo.url} alt="Via Air" className="h-6 w-auto opacity-80" />
          </div>
          <div>
            {CNPJ} • {CITY_STATE} • © {new Date().getFullYear()} Via Air. Todos os direitos reservados.
          </div>
        </div>
      </div>
    </footer>
  );
}
