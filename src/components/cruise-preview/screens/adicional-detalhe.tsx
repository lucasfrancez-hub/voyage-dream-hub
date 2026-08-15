import * as React from "react";
import { Check, ChevronLeft, Info, Minus, Plus } from "lucide-react";
import { adicionais, brl, brl2 } from "@/lib/cruise-preview/mock";
import { Btn, Card, Lightbox, Modal, Pill, SectionTitle, Tabs, cx } from "../kit";

const a = adicionais[0]; // Pacote de bebidas

/* MODELO A — Página de produto com quantidade e box de compra. */
export function A() {
  const [qtd, setQtd] = React.useState(2);
  const [lb, setLb] = React.useState<number | null>(null);
  const fotos = [a.foto, adicionais[1].foto, adicionais[4].foto];
  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <button className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" />Voltar aos adicionais</button>
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <div>
          <img src={fotos[0]} alt="" onClick={() => setLb(0)} className="h-72 w-full cursor-zoom-in rounded-3xl object-cover" />
          <div className="mt-3 flex gap-3">
            {fotos.map((f, i) => <img key={f} src={f} alt="" onClick={() => setLb(i)} className="h-16 w-24 cursor-zoom-in rounded-xl object-cover opacity-70 hover:opacity-100" />)}
          </div>
        </div>
        <div>
          <Pill tone="solid">{a.cat}</Pill>
          <h1 className="mt-2 text-3xl font-bold">{a.nome}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.detalhes}</p>
          <div className="mt-5 space-y-2">
            {a.regras.map((r) => <div key={r} className="flex gap-2 text-sm"><Check className="h-4 w-4 shrink-0 text-primary" />{r}</div>)}
          </div>
          <Card className="mt-6 p-5">
            <div className="flex items-center gap-3">
              <div><div className="text-xs text-muted-foreground">{a.unidade}</div>
                <div className="text-2xl font-bold text-primary">{brl(a.preco)}</div></div>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setQtd(Math.max(1, qtd - 1))} className="h-9 w-9 rounded-full border border-border"><Minus className="mx-auto h-3.5 w-3.5" /></button>
                <b className="w-6 text-center">{qtd}</b>
                <button onClick={() => setQtd(qtd + 1)} className="h-9 w-9 rounded-full border border-border"><Plus className="mx-auto h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">Total</span><b className="text-lg">{brl2(a.preco * qtd)}</b>
            </div>
            <Btn className="mt-3 w-full">Adicionar ao orçamento</Btn>
          </Card>
        </div>
      </div>
      <Lightbox fotos={fotos} index={lb} onIndex={setLb} onClose={() => setLb(null)} legenda={a.nome} />
    </div>
  );
}

/* MODELO B — Drawer de detalhe sobre a lista (contexto preservado). */
export function B() {
  const [open, setOpen] = React.useState(true);
  const [i, setI] = React.useState(0);
  const item = adicionais[i];
  return (
    <div className="relative mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Adicionais" title="Detalhe sem sair da lista" sub="Clique em qualquer item — o detalhe abre em painel lateral." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adicionais.map((x, k) => (
          <button key={x.id} onClick={() => { setI(k); setOpen(true); }} className="text-left">
            <Card className={cx("overflow-hidden transition hover:border-primary/50", open && i === k && "border-primary/70")}>
              <img src={x.foto} alt="" className="h-32 w-full object-cover" />
              <div className="p-4"><div className="text-sm font-bold">{x.nome}</div>
                <div className="mt-1 text-lg font-bold text-primary">{brl(x.preco)}</div></div>
            </Card>
          </button>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} side="right">
        <img src={item.foto} alt="" className="h-56 w-full object-cover" />
        <div className="p-6">
          <Pill tone="solid">{item.cat}</Pill>
          <h3 className="mt-3 text-2xl font-bold">{item.nome}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{item.detalhes}</p>
          <h4 className="mt-5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Regras</h4>
          <div className="mt-2 space-y-1.5">
            {item.regras.map((r) => <div key={r} className="flex gap-2 text-sm text-muted-foreground"><Info className="h-4 w-4 shrink-0 text-primary" />{r}</div>)}
          </div>
          <div className="mt-6 rounded-2xl border border-border p-4">
            <div className="text-xs text-muted-foreground">{item.unidade}</div>
            <div className="text-3xl font-bold text-primary">{brl(item.preco)}</div>
            <Btn className="mt-3 w-full">Adicionar</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* MODELO C — Detalhe em abas com comparativo entre variações do serviço. */
export function C() {
  const [aba, setAba] = React.useState("sobre");
  const [plano, setPlano] = React.useState(1);
  const planos = [
    { nome: "Easy", preco: 1490, itens: ["Bebidas até € 6", "Refrigerantes e água", "Café expresso"] },
    { nome: "Easy Plus", preco: 2190, itens: ["Bebidas até € 9", "Coquetéis e vinhos em taça", "Cafeteria completa"] },
    { nome: "Premium Extra", preco: 3290, itens: ["Bebidas sem limite de valor", "Destilados premium", "Minibar incluso"] },
  ];
  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="relative h-56 overflow-hidden rounded-3xl">
        <img src={a.foto} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute bottom-5 left-6">
          <Pill tone="solid">{a.cat}</Pill>
          <h1 className="mt-2 text-3xl font-bold">Pacotes de bebidas</h1>
        </div>
      </div>
      <div className="mt-6">
        <Tabs variant="underline" value={aba} onChange={setAba} items={[
          { key: "sobre", label: "Sobre" }, { key: "planos", label: "Comparar planos" }, { key: "regras", label: "Regras" }]} />
        <div className="py-6">
          {aba === "sobre" && <p className="text-lg leading-relaxed text-muted-foreground">{a.detalhes}</p>}
          {aba === "planos" && (
            <div className="grid gap-3 sm:grid-cols-3">
              {planos.map((p, i) => (
                <Card key={p.nome} className={cx("cursor-pointer p-5 transition", plano === i && "border-primary/70 bg-primary/5")} >
                  <button onClick={() => setPlano(i)} className="w-full text-left">
                    <div className="font-bold">{p.nome}</div>
                    <div className="mt-1 text-2xl font-bold text-primary">{brl(p.preco)}</div>
                    <div className="text-[11px] text-muted-foreground">por pessoa</div>
                    <div className="mt-3 space-y-1.5">
                      {p.itens.map((x) => <div key={x} className="flex gap-1.5 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-primary" />{x}</div>)}
                    </div>
                  </button>
                </Card>
              ))}
            </div>
          )}
          {aba === "regras" && (
            <ul className="space-y-2 text-sm text-muted-foreground">
              {a.regras.map((r) => <li key={r} className="flex gap-2"><Info className="h-4 w-4 text-primary" />{r}</li>)}
            </ul>
          )}
        </div>
      </div>
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div><div className="text-xs text-muted-foreground">Plano selecionado</div>
          <div className="font-bold">{planos[plano].nome} • {brl(planos[plano].preco)} por pessoa</div></div>
        <Btn className="ml-auto">Adicionar ao orçamento</Btn>
      </Card>
    </div>
  );
}
