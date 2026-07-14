import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { Plane, Hotel, Ticket, Phone, Mail, MessageCircle, Printer, Calendar, Users, MapPin, Star } from "lucide-react";
import { getPublicQuote, type PublicQuote, type PublicQuoteItem } from "@/lib/quote.functions";
import { formatBRL } from "@/lib/format";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

type Search = { print?: string };

export const Route = createFileRoute("/orcamento/$token")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    print: typeof s.print === "string" ? s.print : undefined,
  }),
  loader: async ({ params }) => {
    try {
      return await getPublicQuote({ data: { token: params.token } });
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Orçamento nº ${loaderData.orderNumber} — Via Air` : "Orçamento — Via Air" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Orçamento personalizado da Via Air Turismo." },
    ],
  }),
  component: QuotePage,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <div className="text-2xl font-bold mb-2">Orçamento não encontrado</div>
        <div className="text-sm text-muted-foreground">O link pode estar incorreto ou expirado. Fale com sua agência.</div>
      </div>
    </div>
  ),
  errorComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="text-sm text-muted-foreground">Não foi possível carregar o orçamento agora.</div>
    </div>
  ),
});

function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [d] = iso.split("T");
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  if (!y || !m || !dd) return d;
  return `${dd}/${m}/${y}`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso || !iso.includes("T")) return "";
  const t = iso.split("T")[1] ?? "";
  return t.slice(0, 5);
}

function StarsRow({ n }: { n: number }) {
  const count = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      ))}
    </span>
  );
}

function computeInstallments(total: number, cfg: PublicQuote["config"]) {
  const rows: { label: string; each: number; total: number; highlight?: boolean }[] = [];
  if (cfg.pix.enabled) {
    const disc = total * (cfg.pix.discount_pct / 100);
    rows.push({
      label: `Pix — ${cfg.pix.discount_pct}% de desconto`,
      each: total - disc,
      total: total - disc,
      highlight: true,
    });
  }
  if (cfg.card.enabled) {
    const max = cfg.card.max_installments;
    const interestFrom = cfg.card.interest_from;
    for (let n = 1; n <= max; n++) {
      const withInterest = interestFrom != null && n >= interestFrom;
      rows.push({
        label: n === 1
          ? "Cartão à vista"
          : `${n}x ${withInterest ? "com juros da operadora" : "sem juros"}`,
        each: total / n,
        total: total,
      });
    }
  }
  if (cfg.boleto.enabled) {
    const max = cfg.boleto.max_installments;
    for (let n = 1; n <= max; n++) {
      rows.push({
        label: n === 1 ? "Boleto à vista" : `Boleto em ${n}x`,
        each: total / n,
        total: total,
      });
    }
  }
  return rows;
}

function FlightCard({ item }: { item: PublicQuoteItem }) {
  const isReturn = item.direction === "return";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className={`px-4 py-2 text-xs font-bold uppercase tracking-wider text-white ${isReturn ? "bg-sky-600" : "bg-orange-500"}`}>
        {isReturn ? "Volta" : "Ida"}
        {item.airline ? ` · ${item.airline}` : ""}
        {item.flight_number ? ` ${item.flight_number}` : ""}
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-center">
            <div className="text-3xl font-black tracking-tight text-slate-900">{item.from_iata || "—"}</div>
            <div className="text-xs text-slate-500 mt-0.5 max-w-[9rem] truncate">{item.from_city || ""}</div>
            <div className="text-sm font-semibold text-slate-700 mt-1">{formatTime(item.departure_at)}</div>
            <div className="text-[11px] text-slate-500">{formatDateBR(item.departure_at)}</div>
          </div>

          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div className="flex-1 h-px bg-gradient-to-r from-slate-200 via-orange-300 to-slate-200" />
            <Plane className="h-5 w-5 text-orange-500 shrink-0" />
            <div className="flex-1 h-px bg-gradient-to-r from-slate-200 via-orange-300 to-slate-200" />
          </div>

          <div className="text-center">
            <div className="text-3xl font-black tracking-tight text-slate-900">{item.to_iata || "—"}</div>
            <div className="text-xs text-slate-500 mt-0.5 max-w-[9rem] truncate">{item.to_city || ""}</div>
            <div className="text-sm font-semibold text-slate-700 mt-1">{formatTime(item.arrival_at)}</div>
            <div className="text-[11px] text-slate-500">{formatDateBR(item.arrival_at)}</div>
          </div>
        </div>
        {item.notes && (
          <div className="mt-3 text-xs text-slate-600 whitespace-pre-wrap border-t border-slate-100 pt-2">{item.notes}</div>
        )}
      </div>
    </div>
  );
}

function HotelCard({ item }: { item: PublicQuoteItem }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-emerald-600 flex items-center gap-2">
        <Hotel className="h-3.5 w-3.5" /> Hospedagem
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-bold text-slate-900">
              {item.hotel_name || item.title} {item.hotel_stars ? <StarsRow n={item.hotel_stars} /> : null}
            </div>
            {item.meal_plan && <div className="text-sm text-slate-600 mt-1">Regime: {item.meal_plan}</div>}
          </div>
          <div className="text-right text-xs text-slate-600">
            {item.check_in && (
              <div><Calendar className="h-3 w-3 inline mr-1 text-emerald-600" /> Check-in {formatDateBR(item.check_in)}</div>
            )}
            {item.check_out && (
              <div><Calendar className="h-3 w-3 inline mr-1 text-emerald-600" /> Check-out {formatDateBR(item.check_out)}</div>
            )}
            {item.nights ? <div className="font-semibold text-slate-800 mt-1">{item.nights} noite{item.nights > 1 ? "s" : ""}</div> : null}
          </div>
        </div>
        {item.notes && (
          <div className="mt-3 text-xs text-slate-600 whitespace-pre-wrap border-t border-slate-100 pt-2">{item.notes}</div>
        )}
      </div>
    </div>
  );
}

function ServiceCard({ item }: { item: PublicQuoteItem }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-violet-600 flex items-center gap-2">
        <Ticket className="h-3.5 w-3.5" /> {item.category || "Serviço"}
      </div>
      <div className="p-4">
        <div className="text-base font-semibold text-slate-900">{item.title}</div>
        {(item.date_from || item.date_to) && (
          <div className="text-xs text-slate-600 mt-1">
            {item.date_from && <>De {formatDateBR(item.date_from)}</>}
            {item.date_to && <> até {formatDateBR(item.date_to)}</>}
          </div>
        )}
        {item.notes && (
          <div className="mt-3 text-xs text-slate-600 whitespace-pre-wrap border-t border-slate-100 pt-2">{item.notes}</div>
        )}
      </div>
    </div>
  );
}

function QuotePage() {
  const q = Route.useLoaderData();
  const { print } = Route.useSearch();

  useEffect(() => {
    if (print === "1" && typeof window !== "undefined") {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [print]);

  const installments = useMemo(() => computeInstallments(q.totalPrice, q.config), [q.totalPrice, q.config]);
  const validUntil = q.config.valid_until ? formatDateBR(q.config.valid_until) : null;
  const waMsg = encodeURIComponent(
    `Olá! Vim pelo orçamento nº ${q.orderNumber}${q.tripTitle ? ` — ${q.tripTitle}` : ""}.`,
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10 no-print">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <img src={viaAirLogo.url} alt="Via Air" className="h-8 object-contain" />
          <nav className="hidden sm:flex items-center gap-5 text-xs font-medium text-slate-600">
            <a href="#servico" className="hover:text-orange-600">Serviço</a>
            <a href="#resumo" className="hover:text-orange-600">Resumo</a>
            <a href="#valores" className="hover:text-orange-600">Valores</a>
            <a href="#pagamento" className="hover:text-orange-600">Pagamento</a>
            <a href="#contato" className="hover:text-orange-600">Contato</a>
          </nav>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5"
          >
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-10">
        {/* Hero */}
        <section>
          <div className="text-[11px] uppercase tracking-widest text-orange-600 font-bold">Orçamento personalizado</div>
          <h1 className="mt-1 text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
            Olá {q.customerFirstName}, seu orçamento está pronto
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="font-mono font-semibold text-slate-800">Nº {q.orderNumber}</span>
            {q.destination && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-orange-500" /> {q.destination}</span>
            )}
            {(q.travelers.adults + q.travelers.children > 0) && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-orange-500" />
                {q.travelers.adults} adulto{q.travelers.adults !== 1 ? "s" : ""}
                {q.travelers.children > 0 && `, ${q.travelers.children} criança${q.travelers.children !== 1 ? "s" : ""}`}
              </span>
            )}
          </div>
          {validUntil && (
            <div className="mt-2 inline-block rounded-full bg-amber-50 text-amber-800 text-[11px] font-semibold px-2.5 py-1 border border-amber-200">
              Válido até {validUntil}
            </div>
          )}
          <div className="mt-3 text-[11px] text-red-600 font-medium">*Reservas ainda não efetivadas — sujeitas à disponibilidade.</div>
        </section>

        {/* Serviços */}
        <section id="servico" className="space-y-4">
          <SectionTitle>Serviço</SectionTitle>
          <div className="grid grid-cols-1 gap-3">
            {q.items.map((it, idx) => {
              if (it.kind === "flight") return <FlightCard key={idx} item={it} />;
              if (it.kind === "hotel") return <HotelCard key={idx} item={it} />;
              return <ServiceCard key={idx} item={it} />;
            })}
            {q.items.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Nenhum item cadastrado.
              </div>
            )}
          </div>
        </section>

        {/* Resumo */}
        <section id="resumo">
          <SectionTitle>Resumo</SectionTitle>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <ResumoStat label="Passageiros" value={`${q.travelers.adults + q.travelers.children}`} />
            <ResumoStat label="Aéreos" value={String(q.items.filter((i) => i.kind === "flight").length)} />
            <ResumoStat label="Hotéis" value={String(q.items.filter((i) => i.kind === "hotel").length)} />
            <ResumoStat label="Serviços" value={String(q.items.filter((i) => i.kind === "other").length)} />
          </div>
        </section>

        {/* Valores */}
        <section id="valores">
          <SectionTitle>Valores</SectionTitle>
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-300 font-semibold">Total do orçamento</div>
              <div className="text-4xl font-black mt-1">{formatBRL(q.totalPrice)}</div>
            </div>
            <div className="text-xs text-slate-300 max-w-xs">
              Valor está sujeito a alterações conforme disponibilidade no momento da reserva.
            </div>
          </div>
        </section>

        {/* Pagamento */}
        {installments.length > 0 && (
          <section id="pagamento">
            <SectionTitle>Formas de pagamento</SectionTitle>
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">Modalidade</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Valor da parcela</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((row, idx) => (
                    <tr key={idx} className={`border-t border-slate-100 ${row.highlight ? "bg-emerald-50/60" : ""}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {row.highlight && <span className="mr-2 rounded bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 font-bold">MELHOR</span>}
                        {row.label}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{formatBRL(row.each)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{formatBRL(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {q.config.notes && (
              <div className="mt-3 text-xs text-slate-600 whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-200 p-3">
                {q.config.notes}
              </div>
            )}
          </section>
        )}

        {/* Contato */}
        <section id="contato">
          <SectionTitle>Contato</SectionTitle>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <img src={viaAirLogo.url} alt="Via Air" className="h-10 object-contain" />
            <div className="text-sm text-slate-700 space-y-1">
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-orange-500" /> {q.agency.email}</div>
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-orange-500" /> {q.agency.phone}</div>
            </div>
            <a
              href={`https://wa.me/${q.agency.whatsapp}?text=${waMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              className="no-print sm:ml-auto inline-flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-4 py-2.5"
            >
              <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
            </a>
          </div>
        </section>

        <footer className="text-center text-[11px] text-slate-400 pt-6 pb-10">
          {q.agency.name} · Emitido em {new Date(q.createdAt).toLocaleDateString("pt-BR")}
        </footer>
      </main>

      {/* Floating WhatsApp on mobile */}
      <a
        href={`https://wa.me/${q.agency.whatsapp}?text=${waMsg}`}
        target="_blank"
        rel="noopener noreferrer"
        className="no-print fixed bottom-5 right-5 inline-flex items-center justify-center h-12 w-12 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl sm:hidden"
        aria-label="WhatsApp"
      >
        <MessageCircle className="h-5 w-5" />
      </a>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="h-px flex-1 bg-slate-200" />
      <h2 className="text-sm font-bold uppercase tracking-widest text-slate-700">{children}</h2>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function ResumoStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}
