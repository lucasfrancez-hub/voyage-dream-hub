import * as React from "react";
import { Users, Maximize2, Layers, ChevronRight, Check } from "lucide-react";
import { cabines, familias, brl, type Cabine } from "@/lib/cruise-preview/mock";
import { Btn, Card, Modal, Pill, SectionTitle, Tabs, cx } from "../kit";

function DetalheRapido({ c, onClose }: { c: Cabine | null; onClose: () => void }) {
  const [foto, setFoto] = React.useState(0);
  React.useEffect(() => setFoto(0), [c?.id]);
  return (
    <Modal open={!!c} onClose={onClose} wide>
      {c && (
        <div className="grid md:grid-cols-2">
          <div>
            <img src={c.fotos[foto]} alt="" className="h-64 w-full object-cover md:h-full" />
            <div className="flex gap-2 p-3">
              {c.fotos.map((f, i) => (
                <button key={f} onClick={() => setFoto(i)}>
                  <img src={f} alt="" className={cx("h-12 w-16 rounded-lg object-cover", i === foto ? "ring-2 ring-primary" : "opacity-60")} />
                </button>
              ))}
            </div>
          </div>
          <div className="p-6">
            <Pill tone="solid">{c.familia}</Pill>
            <h3 className="mt-3 text-2xl font-bold">{c.nome}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{c.descricao}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-accent/50 py-3"><Maximize2 className="mx-auto h-4 w-4 text-primary" /><div className="mt-1 font-semibold">{c.area}</div></div>
              <div className="rounded-xl bg-accent/50 py-3"><Users className="mx-auto h-4 w-4 text-primary" /><div className="mt-1 font-semibold">{c.ocupacao}</div></div>
              <div className="rounded-xl bg-accent/50 py-3"><Layers className="mx-auto h-4 w-4 text-primary" /><div className="mt-1 font-semibold">Decks {c.decks}</div></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">{c.amenidades.map((a) => <Pill key={a}>{a}</Pill>)}</div>
            <div className="mt-5 rounded-2xl border border-border p-4">
              <div className="text-xs text-muted-foreground">A partir de</div>
              <div className="text-3xl font-bold text-primary">{brl(c.preco)}</div>
              <div className="text-xs text-muted-foreground">por pessoa + {brl(c.taxas)} de taxas</div>
              <Btn className="mt-3 w-full">Reservar esta cabine</Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* MODELO A — Abas por família + grade de cards com foto grande. */
export function A() {
  const [fam, setFam] = React.useState<string>("Interna");
  const [sel, setSel] = React.useState<Cabine | null>(null);
  const lista = cabines.filter((c) => c.familia === fam);
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Cabines" title="Escolha sua acomodação" sub={`${cabines.length} categorias em 4 famílias`} />
      <Tabs value={fam} onChange={setFam} items={familias.map((f) => ({ key: f, label: f, badge: cabines.filter((c) => c.familia === f).length }))} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <Card key={c.id} className="group overflow-hidden transition hover:-translate-y-1 hover:border-primary/50">
            <div className="relative h-44">
              <img src={c.fotos[0]} alt="" className="h-full w-full object-cover" />
              <Pill className="absolute right-3 top-3">{c.disponiveis} disp.</Pill>
            </div>
            <div className="p-4">
              <div className="font-bold">{c.nome}</div>
              <div className="mt-1 text-xs text-muted-foreground">{c.area} • {c.ocupacao}</div>
              <div className="mt-3 text-2xl font-bold text-primary">{brl(c.preco)}</div>
              <div className="text-[11px] text-muted-foreground">por pessoa + taxas</div>
              <div className="mt-3 flex gap-2">
                <Btn size="sm" variant="outline" onClick={() => setSel(c)}>Detalhes</Btn>
                <Btn size="sm">Reservar</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <DetalheRapido c={sel} onClose={() => setSel(null)} />
    </div>
  );
}

/* MODELO B — Comparador em tabela por família, com linha expansível. */
export function B() {
  const [fam, setFam] = React.useState<string>("Suíte");
  const [sel, setSel] = React.useState<Cabine | null>(null);
  const [comparar, setComparar] = React.useState<string[]>([]);
  const lista = cabines.filter((c) => c.familia === fam);
  const toggle = (id: string) => setComparar((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-3)));
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle eyebrow="Cabines" title="Compare categoria por categoria" />
        <Tabs variant="segment" value={fam} onChange={setFam} items={familias.map((f) => ({ key: f, label: f }))} />
      </div>
      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 border-b border-border px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground md:grid">
          <div>Categoria</div><div>Área</div><div>Ocupação</div><div>A partir de</div><div />
        </div>
        {lista.map((c) => (
          <div key={c.id} className="grid grid-cols-1 items-center gap-3 border-b border-border px-5 py-4 last:border-0 hover:bg-accent/30 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={comparar.includes(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--brand-orange)]" />
              <img src={c.fotos[0]} alt="" className="h-11 w-16 rounded-lg object-cover" />
              <div><div className="font-semibold">{c.nome}</div><div className="text-[11px] text-muted-foreground">Decks {c.decks}</div></div>
            </div>
            <div className="text-sm text-muted-foreground">{c.area}</div>
            <div className="text-sm text-muted-foreground">{c.ocupacao}</div>
            <div className="font-bold text-primary">{brl(c.preco)}</div>
            <button onClick={() => setSel(c)} className="justify-self-start rounded-full border border-border p-2 hover:border-primary md:justify-self-end">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ))}
      </Card>
      {comparar.length > 0 && (
        <Card className="mt-5 p-5">
          <div className="mb-3 text-sm font-bold">Comparativo ({comparar.length}/3)</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {comparar.map((id) => {
              const c = cabines.find((x) => x.id === id)!;
              return (
                <div key={id} className="rounded-2xl border border-border p-4">
                  <img src={c.fotos[1]} alt="" className="h-24 w-full rounded-xl object-cover" />
                  <div className="mt-2 font-semibold">{c.nome}</div>
                  <div className="text-xs text-muted-foreground">{c.area} • {c.ocupacao}</div>
                  <div className="mt-2 text-lg font-bold text-primary">{brl(c.preco)}</div>
                  <div className="mt-2 space-y-1">{c.amenidades.slice(0, 4).map((a) => (
                    <div key={a} className="flex gap-1.5 text-[11px] text-muted-foreground"><Check className="h-3 w-3 text-primary" />{a}</div>))}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <DetalheRapido c={sel} onClose={() => setSel(null)} />
    </div>
  );
}

/* MODELO C — Navegação em dois níveis: famílias em cards grandes → categorias em drawer. */
export function C() {
  const [fam, setFam] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<Cabine | null>(null);
  const capa: Record<string, string> = Object.fromEntries(familias.map((f) => [f, cabines.find((c) => c.familia === f)!.fotos[0]]));
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Cabines" title="Comece pela família de cabine" sub="Interna, Externa, Varanda ou Suíte — depois refine a categoria." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {familias.map((f) => {
          const grupo = cabines.filter((c) => c.familia === f);
          const min = Math.min(...grupo.map((c) => c.preco));
          return (
            <button key={f} onClick={() => setFam(f)} className="group relative h-72 overflow-hidden rounded-3xl border border-border text-left">
              <img src={capa[f]} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="text-2xl font-bold">{f}</div>
                <div className="text-xs text-white/70">{grupo.length} categorias</div>
                <div className="mt-2 text-sm">a partir de <b className="text-primary">{brl(min)}</b></div>
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Ver categorias <ChevronRight className="h-3.5 w-3.5" /></div>
              </div>
            </button>
          );
        })}
      </div>

      <Modal open={!!fam} onClose={() => setFam(null)} side="right">
        {fam && (
          <div className="p-6">
            <Pill tone="solid">{fam}</Pill>
            <h3 className="mt-3 text-2xl font-bold">Categorias {fam}</h3>
            <div className="mt-5 space-y-3">
              {cabines.filter((c) => c.familia === fam).map((c) => (
                <button key={c.id} onClick={() => setSel(c)} className="w-full text-left">
                  <Card className="flex gap-3 p-3 transition hover:border-primary/60">
                    <img src={c.fotos[0]} alt="" className="h-20 w-28 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{c.nome}</div>
                      <div className="text-xs text-muted-foreground">{c.area} • {c.ocupacao}</div>
                      <div className="mt-1 text-lg font-bold text-primary">{brl(c.preco)}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 self-center text-muted-foreground" />
                  </Card>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
      <DetalheRapido c={sel} onClose={() => setSel(null)} />
    </div>
  );
}
