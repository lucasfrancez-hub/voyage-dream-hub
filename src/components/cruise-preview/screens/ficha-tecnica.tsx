import * as React from "react";
import { Ship, Ruler, Users, Sparkles, ChevronDown } from "lucide-react";
import { fichaTecnica, cruise, img } from "@/lib/cruise-preview/mock";
import { Card, Pill, SectionTitle, Tabs, cx } from "../kit";

const icones = [Ship, Ruler, Users, Sparkles];

/* MODELO A — Tabela por grupos, leitura direta. */
export function A() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <SectionTitle eyebrow="Ficha técnica" title={cruise.navio} sub="Todas as especificações do navio." />
      <div className="space-y-5">
        {fichaTecnica.map((g) => (
          <Card key={g.grupo} className="overflow-hidden">
            <div className="border-b border-border bg-accent/30 px-5 py-3 text-sm font-bold">{g.grupo}</div>
            {g.itens.map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border px-5 py-3 text-sm last:border-0">
                <span className="text-muted-foreground">{k}</span><b>{v}</b>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* MODELO B — Cartões-número (dashboard visual) + abas por grupo. */
export function B() {
  const [g, setG] = React.useState(fichaTecnica[0].grupo);
  const grupo = fichaTecnica.find((x) => x.grupo === g)!;
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <SectionTitle eyebrow="Ficha técnica" title="Os números do navio" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["5.331", "hóspedes"], ["2.066", "cabines"], ["323 m", "comprimento"], ["18", "decks"]].map(([v, l], i) => {
          const I = icones[i];
          return (
            <Card key={l} className="p-5">
              <I className="h-5 w-5 text-primary" />
              <div className="mt-2 text-2xl font-bold">{v}</div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{l}</div>
            </Card>
          );
        })}
      </div>
      <Tabs variant="segment" value={g} onChange={setG} items={fichaTecnica.map((x) => ({ key: x.grupo, label: x.grupo }))} />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {grupo.itens.map(([k, v]) => (
          <Card key={k} className="p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{k}</div>
            <div className="mt-1 text-lg font-semibold">{v}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* MODELO C — Acordeão compacto ao lado da foto do navio (ideal para mobile). */
export function C() {
  const [open, setOpen] = React.useState<string | null>(fichaTecnica[0].grupo);
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
        <div className="md:sticky md:top-20 md:self-start">
          <img src={img("ficha-ship", 1000, 900)} alt="" className="h-72 w-full rounded-3xl object-cover" />
          <h2 className="mt-4 text-2xl font-bold">{cruise.navio}</h2>
          <div className="mt-2 flex flex-wrap gap-2"><Pill>{cruise.operadora}</Pill><Pill>Bandeira {cruise.bandeira}</Pill><Pill>2018 / reforma 2024</Pill></div>
        </div>
        <div className="space-y-2">
          {fichaTecnica.map((g) => {
            const on = open === g.grupo;
            return (
              <Card key={g.grupo} className={cx("overflow-hidden", on && "border-primary/50")}>
                <button onClick={() => setOpen(on ? null : g.grupo)} className="flex w-full items-center px-5 py-4 text-left text-sm font-bold">
                  {g.grupo}
                  <ChevronDown className={cx("ml-auto h-4 w-4 transition", on && "rotate-180 text-primary")} />
                </button>
                {on && (
                  <div className="px-5 pb-4">
                    {g.itens.map(([k, v]) => (
                      <div key={k} className="flex justify-between border-t border-border py-2.5 text-sm">
                        <span className="text-muted-foreground">{k}</span><b>{v}</b>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
