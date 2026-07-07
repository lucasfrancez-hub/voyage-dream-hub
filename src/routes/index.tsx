import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plane, MapPin, Phone, Mail, Instagram, MessageCircle, Star, Compass, ShieldCheck, Headphones, Menu, X, CreditCard, Landmark, QrCode, Heart, Sparkles, Globe2 } from "lucide-react";
import heroCollage from "@/assets/hero-collage.png.asset.json";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";
import ceoPhoto from "@/assets/ceo-viaair.jpg.asset.json";
import destBeach from "@/assets/dest-beach.jpg";
import destEurope from "@/assets/dest-europe.jpg";
import destMountain from "@/assets/dest-mountain.jpg";
import { FlightSearchWidget } from "@/components/FlightSearchWidget";

export const Route = createFileRoute("/")({
  component: Home,
});

const nav = [
  { href: "#buscar", label: "Buscar" },
  { href: "#destinos", label: "Destinos" },
  { href: "#servicos", label: "Serviços" },
  { href: "#sobre", label: "Sobre" },
  { href: "#contato", label: "Contato" },
];

function Home() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/70 border-b border-border">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3">
            <img src={viaAirLogo.url} alt="Via Air" className="h-9 w-auto" />
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="text-muted-foreground hover:text-brand-orange transition">
                {n.label}
              </a>
            ))}
          </nav>
          <a
            href="#contato"
            className="hidden md:inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition"
          >
            Fale conosco
          </a>
          <button className="md:hidden text-foreground" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden border-t border-border bg-background/95 px-6 py-4 space-y-3">
            {nav.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block text-muted-foreground hover:text-brand-orange">
                {n.label}
              </a>
            ))}
            <a href="#contato" onClick={() => setOpen(false)} className="inline-flex rounded-full bg-gradient-brand px-5 py-2 text-sm font-medium text-primary-foreground">
              Fale conosco
            </a>
          </div>
        )}
      </header>

      {/* Hero */}
      <section id="buscar" className="relative pt-16">
        {/* Cover image — proporção controlada */}
        <div className="relative w-full h-[45vh] min-h-[280px] max-h-[520px] overflow-hidden">
          <img
            src={heroCollage.url}
            alt="Colagem de destinos de viagem Via Air"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
          <div className="absolute inset-0 flex items-end">
            <div className="mx-auto max-w-7xl px-6 pb-10 w-full">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-orange/40 bg-background/50 px-4 py-1.5 text-xs uppercase tracking-widest text-brand-orange">
                <Star className="h-3.5 w-3.5" /> Agência de viagens
              </span>
              <h1 className="mt-4 font-display text-4xl md:text-6xl font-extrabold leading-[1.05] max-w-3xl">
                Sua próxima <span className="text-gradient-brand">viagem</span> começa aqui.
              </h1>
              <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-xl">
                Passagens aéreas, pacotes, hotéis e experiências sob medida&nbsp;
              </p>
            </div>
          </div>
        </div>

        {/* Widget slot */}
        <div className="mx-auto max-w-7xl px-6 -mt-10 relative z-10">
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl p-4 md:p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <Plane className="h-4 w-4 text-brand-orange" />
              Encontre sua passagem
            </div>
            <FlightSearchWidget />
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="py-24 bg-background">
        <div className="mx-auto max-w-7xl px-6 grid md:grid-cols-3 gap-8">
          {[
            { icon: Headphones, title: "Atendimento humano", desc: "Consultores dedicados, do orçamento ao pós-viagem, por WhatsApp." },
            { icon: ShieldCheck, title: "Segurança e confiança", desc: "Emitimos com as principais companhias e operadoras do mercado." },
            { icon: Compass, title: "Roteiros sob medida", desc: "Montamos experiências pensadas para o seu estilo e orçamento." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-8 hover:border-brand-orange/50 transition group">
              <div className="h-12 w-12 rounded-xl bg-muted/50 border border-border flex items-center justify-center mb-6">
                <f.icon className="h-6 w-6 text-brand-orange" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">{f.title}</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Destinos */}
      <section id="destinos" className="py-24 bg-card/40 border-y border-border">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
            <div>
              <span className="text-brand-orange text-sm uppercase tracking-widest">Destinos em destaque</span>
              <h2 className="mt-2 text-4xl md:text-5xl font-bold text-foreground">Inspire-se para a próxima aventura</h2>
            </div>
            <a href="#contato" className="text-brand-orange hover:underline">Ver todos os destinos →</a>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { img: destBeach, name: "Caribe & Nordeste", tag: "A partir de R$ 2.890" },
              { img: destEurope, name: "Europa Clássica", tag: "A partir de R$ 5.490" },
              { img: destMountain, name: "Neve & Aventura", tag: "A partir de R$ 6.190" },
            ].map((d) => (
              <a key={d.name} href="#contato" className="group relative rounded-2xl overflow-hidden aspect-[4/5] block">
                <img src={d.img} alt={d.name} loading="lazy" width={1024} height={1280} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute bottom-0 p-6">
                  <div className="flex items-center gap-2 text-xs text-brand-orange uppercase tracking-widest">
                    <MapPin className="h-3.5 w-3.5" /> {d.tag}
                  </div>
                  <h3 className="mt-2 text-2xl font-semibold text-foreground">{d.name}</h3>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Serviços */}
      <section id="servicos" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <span className="text-brand-orange text-sm uppercase tracking-widest">O que fazemos</span>
            <h2 className="mt-2 text-4xl md:text-5xl font-bold text-foreground">Tudo para sua viagem em um só lugar</h2>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { t: "Passagens aéreas", d: "Nacionais e internacionais com as melhores tarifas." },
              { t: "Pacotes completos", d: "Aéreo + hotel + traslados + passeios." },
              { t: "Hotéis e resorts", d: "Curadoria de hospedagens em todo o mundo." },
              { t: "Cruzeiros", d: "As principais operadoras marítimas do mundo." },
              { t: "Lua de mel", d: "Roteiros românticos e experiências únicas." },
              { t: "Viagens corporativas", d: "Gestão completa para empresas." },
              { t: "Seguro viagem", d: "Cobertura internacional com as melhores seguradoras." },
              { t: "Assessoria de vistos", d: "Orientação e apoio na documentação." },
              { t: "Locação de carros", d: "Aluguel no Brasil e exterior com as melhores locadoras." },
              { t: "Fretamento aéreo", d: "Voos exclusivos para grupos, eventos e ocasiões especiais." },
            ].map((s) => (
              <div key={s.t} className="rounded-xl border border-border bg-card p-6 hover:border-brand-orange/50 transition">
                <h3 className="font-semibold text-foreground">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pilares Via Air */}
      <section className="py-24 bg-card/40 border-y border-border">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl mb-12">
            <span className="text-brand-orange text-sm uppercase tracking-widest">Nossos pilares</span>
            <h2 className="mt-2 text-4xl md:text-5xl font-bold text-foreground">O que sustenta cada viagem Via Air</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Heart, t: "Paixão por viajar", d: "Amamos o que fazemos — e isso se reflete em cada detalhe do seu roteiro." },
              { icon: Sparkles, t: "Experiência premium", d: "Curadoria refinada, parceiros selecionados e um padrão de excelência." },
              { icon: ShieldCheck, t: "Confiança", d: "Transparência, segurança e clareza do primeiro contato ao pós-viagem." },
              { icon: Globe2, t: "Mundo sem limites", d: "Conectamos você a destinos, culturas e experiências únicas ao redor do mundo." },
            ].map((p) => (
              <div key={p.t} className="rounded-2xl border border-border bg-card p-8">
                <div className="h-12 w-12 rounded-xl bg-muted/50 border border-border flex items-center justify-center mb-6">
                  <p.icon className="h-6 w-6 text-brand-orange" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{p.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Sobre */}
      <section id="sobre" className="py-24 bg-brand-blue/10 border-y border-brand-blue/20">
        <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-brand-orange text-sm uppercase tracking-widest">Sobre a Via Air</span>
            <h2 className="mt-2 text-4xl md:text-5xl font-bold text-foreground">Feita por quem ama viajar, para quem quer viver a experiência.</h2>
            <p className="mt-6 text-muted-foreground leading-relaxed">
              A Via Air é uma agência de viagens especializada em transformar sonhos em roteiros reais. Cada cliente é único — e cada viagem é planejada com carinho, atenção aos detalhes e o suporte que só uma equipe apaixonada pode oferecer.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-6">
              {[
                { n: "10+", l: "anos de estrada" },
                { n: "5K+", l: "clientes felizes" },
                { n: "80+", l: "destinos" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="text-3xl font-display font-bold text-brand-orange">{s.n}</div>
                  <div className="text-sm text-muted-foreground mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative aspect-[4/5] rounded-3xl overflow-hidden">
            <img src={ceoPhoto.url} alt="CEO da Via Air" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
            <div className="absolute bottom-0 p-6">
              <span className="text-xs uppercase tracking-widest text-brand-orange">Fundador & CEO</span>
              <h3 className="mt-1 text-2xl font-semibold text-foreground">Uma vida dedicada a viajar</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-md">
                Sempre vivi do turismo — e viajando. Meu maior prazer é conhecer novas culturas, lugares e pessoas. Cada roteiro da Via Air nasce dessa vivência e do desejo de compartilhar o melhor do mundo com os nossos clientes.
              </p>
            </div>
            <div className="absolute inset-0 ring-1 ring-inset ring-border rounded-3xl" />
          </div>
        </div>
      </section>

      {/* Formas de pagamento */}
      <section className="py-24 bg-card/40 border-y border-border">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl mb-12">
            <span className="text-brand-orange text-sm uppercase tracking-widest">Formas de pagamento</span>
            <h2 className="mt-2 text-4xl md:text-5xl font-bold text-foreground">Pague do jeito que fica melhor pra você</h2>
            <p className="mt-4 text-muted-foreground">Todas as opções <span className="text-brand-orange font-semibold">sem juros</span>.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: QrCode, t: "Pix", d: "Pagamento instantâneo com confirmação imediata." },
              { icon: CreditCard, t: "Cartão de crédito", d: "Parcele sua viagem no cartão sem juros." },
              { icon: Landmark, t: "Boleto com análise de crédito", d: "Parcele em boletos sem juros após análise de crédito, em até 12x.\n\nEmbarque permitido antes da quitação." },
              { icon: Landmark, t: "Boleto até a data da viagem", d: "Divida em boletos sem juros até embarcar, sem análise de crédito.\n\nNecessário quitação 30 dias antes do embarque" },
            ].map((p) => (
              <div key={p.t} className="rounded-2xl border border-border bg-card p-6">
                <div className="h-11 w-11 rounded-xl bg-muted/50 border border-border flex items-center justify-center mb-4">
                  <p.icon className="h-5 w-5 text-brand-orange" />
                </div>
                <h3 className="font-semibold text-foreground">{p.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contato / CTA */}
      <section id="contato" className="py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <span className="text-brand-orange text-sm uppercase tracking-widest">Fale com a gente</span>
          <h2 className="mt-2 text-4xl md:text-6xl font-bold text-foreground">Pronto para embarcar?</h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Envie sua ideia de viagem e nosso time monta um orçamento personalizado para você.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href="https://wa.me/5544999514838"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-8 py-4 font-medium text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition"
            >
              <MessageCircle className="h-5 w-5" /> Falar no WhatsApp
            </a>
            <a
              href="mailto:comercial@voeair.com"
              className="inline-flex items-center gap-2 rounded-full border border-border px-8 py-4 font-medium hover:border-brand-orange transition"
            >
              <Mail className="h-5 w-5 text-brand-orange" /> Enviar e-mail
            </a>
          </div>
          <div className="mt-12 grid sm:grid-cols-3 gap-6 text-sm">
            <div className="flex items-center justify-center gap-2 text-muted-foreground"><Phone className="h-4 w-4 text-brand-orange" /> (44) 99951-4838</div>
            <div className="flex items-center justify-center gap-2 text-muted-foreground"><Mail className="h-4 w-4 text-brand-orange" /> comercial@voeair.com</div>
            <div className="flex items-center justify-center gap-2 text-muted-foreground"><Instagram className="h-4 w-4 text-brand-orange" /> @viaairs</div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={viaAirLogo.url} alt="Via Air" className="h-6 w-auto" />
          </div>
          <div>© {new Date().getFullYear()} Via Air. Todos os direitos reservados.</div>
        </div>
      </footer>
    </div>
  );
}
