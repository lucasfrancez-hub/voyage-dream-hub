import * as React from "react";
import { Clock, Check, Sparkles } from "lucide-react";
import { atracoes } from "@/lib/cruise-preview/mock";
import { Btn, Card, Modal, Pill, SectionTitle, Tabs, cx } from "../kit";

const cats = ["Todas", ...Array.from(new Set(atracoes.map((a) => a.categoria)))];

/* MODELO A — Grade com filtro por categoria e modal de detalhe. */
export function A() {
  const [cat, setCat] = React.useState("Todas");
  const [sel, setSel] = React.useState<number | null>(null);
  const lista = atracoes.filter((a) => cat === "Todas" || a.categoria === cat);
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Atrações" title="O que fazer a bordo" sub={`${atracoes.length} experiências disponíveis`} />
      <Tabs value={cat} onChange={setCat} items={cats.map((c) => ({ key: c, label: c }))} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((a) => (
          <button key={a.nome} onClick={() => setSel(atracoes.indexOf(a))} className="text-left">
            <Card className="group h-full overflow-hidden transition hover:border-primary/50">
              <div className="relative h-40">
                <img src={a.foto} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <Pill className="absolute left-3 top-3" tone={a.incluso ? "solid" : "default"}>{a.incluso ? "Incluso" : "Pago"}</Pill>
              </div>
              <div className="p-4">
                <div className="text-[11px] uppercase tracking-widest text-primary">{a.categoria}</div>
                <div className="mt-0.5 font-bold">{a.nome}</div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.desc}</p>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" />{a.horario} • Deck {a.deck}</div>
              </div>
            </Card>
          </button>
        ))}
      </div>
      <Modal open={sel !== null} onClose={() => setSel(null)}>
        {sel !== null && (
          <div>
            <img src={atracoes[sel].foto} alt="" className="h-60 w-full object-cover" />
            <div className="p-6">
              <h3 className="text-2xl font-bold">{atracoes[sel].nome}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{atracoes[sel].desc}</p>
              <div className="mt-4 flex gap-2"><Pill>Deck {atracoes[sel].deck}</Pill><Pill>{atracoes[sel].horario}</Pill></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* MODELO B — Mosaico editorial (bento) com destaque para as principais. */
export function B() {
  const [sel, setSel] = React.useState<number | null>(null);
  const span = (i: number) => (i === 0 ? "sm:col-span-2 sm:row-span-2" : i === 3 ? "sm:col-span-2" : "");
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Atrações" title="Um navio para explorar" />
      <div className="grid auto-rows-[170px] gap-3 sm:grid-cols-4">
        {atracoes.map((a, i) => (
          <button key={a.nome} onClick={() => setSel(i)}
            className={cx("group relative overflow-hidden rounded-2xl border border-border text-left", span(i))}>
            <img src={a.foto} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <div className="text-[10px] uppercase tracking-widest text-primary">{a.categoria}</div>
              <div className={cx("font-bold", i === 0 ? "text-2xl" : "text-sm")}>{a.nome}</div>
              <div className="mt-1 max-h-0 overflow-hidden text-xs text-white/80 transition-all duration-300 group-hover:max-h-16">{a.desc}</div>
            </div>
          </button>
        ))}
      </div>
      <Modal open={sel !== null} onClose={() => setSel(null)} side="bottom">
        {sel !== null && (
          <div className="mx-auto max-w-3xl p-6">
            <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
              <img src={atracoes[sel].foto} alt="" className="h-40 w-full rounded-2xl object-cover" />
              <div>
                <Pill tone="solid">{atracoes[sel].categoria}</Pill>
                <h3 className="mt-2 text-2xl font-bold">{atracoes[sel].nome}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{atracoes[sel].desc}</p>
                <div className="mt-3 flex gap-2"><Pill>Deck {atracoes[sel].deck}</Pill><Pill>{atracoes[sel].horario}</Pill></div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* MODELO C — Lista comparativa com painel fixo (incluso x pago). */
export function C() {
  const [sel, setSel] = React.useState(0);
  const [filtro, setFiltro] = React.useState("todos");
  const lista = atracoes.filter((a) => filtro === "todos" || (filtro === "incluso" ? a.incluso : !a.incluso));
  const a = atracoes[sel];
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle eyebrow="Atrações" title="Incluso ou pago à parte?" />
        <Tabs variant="segment" value={filtro} onChange={setFiltro} items={[
          { key: "todos", label: "Todas" }, { key: "incluso", label: "Inclusas" }, { key: "pago", label: "Pagas" }]} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <Card className="divide-y divide-border overflow-hidden">
          {lista.map((x) => (
            <button key={x.nome} onClick={() => setSel(atracoes.indexOf(x))}
              className={cx("flex w-full items-center gap-3 p-3 text-left transition", atracoes[sel] === x ? "bg-primary/10" : "hover:bg-accent/50")}>
              <img src={x.foto} alt="" className="h-12 w-16 rounded-lg object-cover" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{x.nome}</div>
                <div className="text-[11px] text-muted-foreground">{x.categoria} • Deck {x.deck}</div>
              </div>
              <span className={cx("ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold",
                x.incluso ? "bg-primary/20 text-primary" : "bg-accent text-muted-foreground")}>
                {x.incluso ? "INCLUSO" : "PAGO"}</span>
            </button>
          ))}
        </Card>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <img src={a.foto} alt="" className="h-44 w-full object-cover" />
            <div className="p-5">
              <div className="text-[11px] uppercase tracking-widest text-primary">{a.categoria}</div>
              <h3 className="text-xl font-bold">{a.nome}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.desc}</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Deck</span><b>{a.deck}</b></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Funcionamento</span><b>{a.horario}</b></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Reserva</span><b>{a.incluso ? "Não necessária" : "Recomendada"}</b></div>
              </div>
              {a.incluso ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary"><Check className="h-4 w-4" />Já incluso na sua tarifa</div>
              ) : (
                <Btn className="mt-4 w-full"><Sparkles className="h-4 w-4" />Adicionar ao orçamento</Btn>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
