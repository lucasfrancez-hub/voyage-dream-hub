/**
 * Widget PÚBLICO do motor de busca aéreo — feito pra rodar dentro de um
 * <iframe> no site do cliente (WordPress). Só o formulário: ao buscar,
 * abre pedidos.viaair.tur.br/voar já com os parâmetros preenchidos.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, ArrowLeftRight, CalendarDays, Users, Search, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AirportAutocomplete } from "@/components/search/AirportAutocomplete";
import { DateRangeField } from "@/components/search/DateRangeField";

const PUBLIC_SITE_URL = "https://pedidos.viaair.tur.br";

export const Route = createFileRoute("/embed/motor-busca")({
  head: () => ({
    meta: [
      { title: "Buscar passagens · VIA AIR" },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  component: EmbedMotorBusca,
});

function EmbedMotorBusca() {
  const [form, setForm] = useState({
    departureIata: "",
    arrivalIata: "",
    departureDate: "",
    returnDate: "",
    adults: 1,
    children: 0,
    infants: 0,
  });

  const canSearch =
    form.departureIata.length === 3 && form.arrivalIata.length === 3 && !!form.departureDate;
  const paxTotal = Number(form.adults) + Number(form.children) + Number(form.infants);

  function open(url: string) {
    // Dentro do iframe: tenta levar a página inteira do site; se o navegador
    // bloquear, abre em nova aba.
    try {
      if (window.top && window.top !== window.self) window.top.location.href = url;
      else window.location.href = url;
    } catch {
      window.open(url, "_blank", "noopener");
    }
  }

  function go() {
    if (!canSearch) return;
    const q = new URLSearchParams({
      o: form.departureIata,
      d: form.arrivalIata,
      ida: form.departureDate,
      ad: String(form.adults),
      ch: String(form.children),
      inf: String(form.infants),
    });
    if (form.returnDate) q.set("volta", form.returnDate);
    open(`${PUBLIC_SITE_URL}/voar?${q.toString()}`);
  }

  return (
    <div className="w-full p-0">
      <style>{`html,body,#root{background:transparent !important;margin:0;padding:0;}`}</style>

      <div className="rounded-[28px] border border-border/50 bg-card/80 p-5 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {OTHER_MODES.map((m) => (
            <button
              key={m.k}
              type="button"
              onClick={() => (m.k === "aereo" ? undefined : open(`${PUBLIC_SITE_URL}/voar?m=${m.k}`))}
              className={
                m.k === "aereo"
                  ? "inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
                  : "inline-flex items-center gap-1.5 rounded-full border border-border/50 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
              }
            >
              <m.icon className="h-3.5 w-3.5" /> {m.l}
            </button>
          ))}
        </div>


        <div className="grid grid-cols-12 items-end gap-3">
          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <MapPin className="h-3 w-3 text-primary" /> Origem
            </Label>
            <AirportAutocomplete
              publicMode
              value={form.departureIata}
              isDeparture
              placeholder="Cidade ou IATA"
              className="h-12 rounded-xl border-border/40 bg-muted/40 px-4 text-base font-semibold uppercase"
              onSelect={(iata) => setForm((f) => ({ ...f, departureIata: iata }))}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <ArrowLeftRight className="h-3 w-3 text-primary" /> Destino
            </Label>
            <AirportAutocomplete
              publicMode
              value={form.arrivalIata}
              isDeparture={false}
              placeholder="Cidade ou IATA"
              className="h-12 rounded-xl border-border/40 bg-muted/40 px-4 text-base font-semibold uppercase"
              onSelect={(iata) => setForm((f) => ({ ...f, arrivalIata: iata }))}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <CalendarDays className="h-3 w-3 text-primary" /> Ida e volta
            </Label>
            <DateRangeField
              departureDate={form.departureDate}
              returnDate={form.returnDate}
              onChange={(departureDate, returnDate) =>
                setForm((f) => ({ ...f, departureDate, returnDate }))
              }
            />
          </div>

          <div className="col-span-12 md:col-span-2">
            <Button
              size="lg"
              className="h-12 w-full rounded-xl font-bold shadow-xl shadow-primary/25"
              disabled={!canSearch}
              onClick={go}
            >
              <Search className="mr-2 h-4 w-4" /> Buscar
            </Button>
          </div>

          <div className="col-span-12 mt-1 flex flex-wrap items-center gap-5 border-t border-border/40 pt-4">
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-5 w-5" /> {paxTotal} passageiro(s)
            </span>
            <div className="flex items-center gap-4">
              {[
                { k: "adults" as const, l: "Adultos", min: 1 },
                { k: "children" as const, l: "Crianças", min: 0 },
                { k: "infants" as const, l: "Bebês", min: 0 },
              ].map((p) => (
                <div key={p.k} className="flex flex-col">
                  <span className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    {p.l}
                  </span>
                  <Input
                    className="h-8 w-16 rounded-lg border-border/50 bg-muted/40 px-2 text-center"
                    type="number"
                    min={p.min}
                    max={9}
                    value={form[p.k]}
                    onChange={(e) => setForm((f) => ({ ...f, [p.k]: Number(e.target.value) }))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
