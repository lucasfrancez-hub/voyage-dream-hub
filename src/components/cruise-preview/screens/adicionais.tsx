import * as React from "react";
import { Plus, Check, ShoppingBag } from "lucide-react";
import { adicionais, brl, type Adicional } from "@/lib/cruise-preview/mock";
import { Btn, Card, Modal, Pill, SectionTitle, Tabs, cx } from "../kit";

const cats = ["Todos", ...Array.from(new Set(adicionais.map((a) => a.cat)))];

/* MODELO A — Catálogo em cards com carrinho lateral. */
export function A() {
  const [cat, setCat] = React.useState("Todos");
  const [sel, setSel] = React.useState<string[]>(["wifi"]);
  const [det, setDet] = React.useState<Adicional | null>(null);
  const lista = adicionais.filter((a) => cat === "Todos" || a.cat === cat);
  const total = adicionais.filter((a) => sel.includes(a.id)).reduce((s, a) => s + a.preco, 0);
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Adicionais" title="Personalize sua viagem" sub={`${adicionais.length} serviços disponíveis`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <Tabs value={cat} onChange={setCat} items={cats.map((c) => ({ key: c, label: c }))} />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {lista.map((a) => {
              const on = sel.includes(a.id);
              return (
                <Card key={a.id} className={cx("overflow-hidden transition", on && "border-primary/70")}>
                  <img src={a.foto} alt="" className="h-36 w-full cursor-pointer object-cover" onClick={() => setDet(a)} />
                  <div className="p-4">
                    <Pill>{a.cat}</Pill>
                    <div className="mt-2 font-bold">{a.nome}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{a.resumo}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div><div className="text-lg font-bold text-primary">{brl(a.preco)}</div>
                        <div className="text-[10px] text-muted-foreground">{a.unidade}</div></div>
                      <Btn size="sm" variant={on ? "outline" : "primary"} className="ml-auto" onClick={() => toggle(a.id)}>
                        {on ? <><Check className="h-3.5 w-3.5" />Adicionado</> : <><Plus className="h-3.5 w-3.5" />Adicionar</>}
                      </Btn>
                    </div>
                    <button onClick={() => setDet(a)} className="mt-2 text-[11px] text-muted-foreground hover:text-primary">Ver detalhes</button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-bold"><ShoppingBag className="h-4 w-4 text-primary" />Seus adicionais</div>
            {sel.length === 0 && <p className="mt-3 text-xs text-muted-foreground">Nenhum adicional selecionado ainda.</p>}
            <div className="mt-3 space-y-2">
              {adicionais.filter((a) => sel.includes(a.id)).map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-xl bg-accent/40 px-3 py-2 text-xs">
                  <span className="truncate">{a.nome}</span>
                  <b className="ml-auto">{brl(a.preco)}</b>
                  <button onClick={() => toggle(a.id)} className="text-muted-foreground hover:text-destructive">×</button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Total</span><b className="text-lg text-primary">{brl(total)}</b>
            </div>
            <Btn className="mt-3 w-full" size="sm">Adicionar ao orçamento</Btn>
          </Card>
        </div>
      </div>
      <Modal open={!!det} onClose={() => setDet(null)}>
        {det && (
          <div>
            <img src={det.foto} alt="" className="h-52 w-full object-cover" />
            <div className="p-6">
              <h3 className="text-xl font-bold">{det.nome}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{det.detalhes}</p>
              <div className="mt-4 text-2xl font-bold text-primary">{brl(det.preco)}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* MODELO B — Lista compacta com switches e agrupamento por categoria. */
export function B() {
  const [sel, setSel] = React.useState<string[]>(["beb", "trf"]);
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const total = adicionais.filter((a) => sel.includes(a.id)).reduce((s, a) => s + a.preco, 0);
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 pb-28">
      <SectionTitle eyebrow="Adicionais" title="Marque o que deseja incluir" />
      {cats.slice(1).map((c) => (
        <div key={c} className="mb-6">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{c}</div>
          <Card className="divide-y divide-border">
            {adicionais.filter((a) => a.cat === c).map((a) => {
              const on = sel.includes(a.id);
              return (
                <div key={a.id} className="flex items-center gap-4 p-4">
                  <img src={a.foto} alt="" className="h-12 w-16 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{a.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.resumo}</div>
                  </div>
                  <div className="text-right"><b className="text-primary">{brl(a.preco)}</b>
                    <div className="text-[10px] text-muted-foreground">{a.unidade}</div></div>
                  <button onClick={() => toggle(a.id)}
                    className={cx("relative h-6 w-11 rounded-full transition", on ? "bg-primary" : "bg-border")}>
                    <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[1.4rem]" : "left-0.5")} />
                  </button>
                </div>
              );
            })}
          </Card>
        </div>
      ))}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center px-5 py-3">
          <div><div className="text-[11px] text-muted-foreground">{sel.length} adicionais</div>
            <div className="text-lg font-bold text-primary">{brl(total)}</div></div>
          <Btn className="ml-auto">Confirmar adicionais</Btn>
        </div>
      </div>
    </div>
  );
}

/* MODELO C — Combos recomendados + vitrine visual em carrossel. */
export function C() {
  const [combo, setCombo] = React.useState("conforto");
  const combos: Record<string, { nome: string; ids: string[]; desc: string; off: number }> = {
    essencial: { nome: "Essencial", ids: ["seg", "trf"], desc: "O mínimo para viajar tranquilo.", off: 0 },
    conforto: { nome: "Conforto", ids: ["seg", "trf", "wifi", "beb"], desc: "O pacote mais escolhido pelos nossos clientes.", off: 8 },
    completo: { nome: "Completo", ids: adicionais.map((a) => a.id), desc: "Tudo incluso, sem preocupação.", off: 14 },
  };
  const c = combos[combo];
  const bruto = adicionais.filter((a) => c.ids.includes(a.id)).reduce((s, a) => s + a.preco, 0);
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Adicionais" title="Escolha um combo — ou monte o seu" align="center" />
      <div className="mb-6 flex justify-center">
        <Tabs variant="segment" value={combo} onChange={setCombo} items={Object.entries(combos).map(([k, v]) => ({ key: k, label: v.nome }))} />
      </div>
      <Card className="p-6 text-center">
        <div className="text-xl font-bold">Combo {c.nome}</div>
        <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
        <div className="mt-4 flex items-end justify-center gap-3">
          {c.off > 0 && <span className="text-sm text-muted-foreground line-through">{brl(bruto)}</span>}
          <span className="text-4xl font-bold text-primary">{brl(Math.round(bruto * (1 - c.off / 100)))}</span>
          {c.off > 0 && <Pill tone="solid">-{c.off}%</Pill>}
        </div>
        <Btn className="mt-5" size="lg">Adicionar combo {c.nome}</Btn>
      </Card>
      <div className="mt-6 flex gap-4 overflow-x-auto pb-3">
        {adicionais.map((a) => {
          const dentro = c.ids.includes(a.id);
          return (
            <div key={a.id} className={cx("w-64 shrink-0 overflow-hidden rounded-2xl border transition", dentro ? "border-primary/70" : "border-border opacity-60")}>
              <img src={a.foto} alt="" className="h-32 w-full object-cover" />
              <div className="p-4">
                <div className="text-sm font-bold">{a.nome}</div>
                <div className="mt-1 text-xs text-muted-foreground">{a.resumo}</div>
                <div className="mt-2 flex items-center"><b className="text-primary">{brl(a.preco)}</b>
                  {dentro && <Pill className="ml-auto"><Check className="h-3 w-3" />No combo</Pill>}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
