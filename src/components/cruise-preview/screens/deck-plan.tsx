import * as React from "react";
import { ZoomIn, Layers } from "lucide-react";
import { decks, cabines, brl } from "@/lib/cruise-preview/mock";
import { Btn, Card, Modal, Pill, SectionTitle, Tabs, cx } from "../kit";

/* MODELO A — Seletor horizontal de decks + planta grande com legenda. */
export function A() {
  const [d, setD] = React.useState(decks[3].numero);
  const [zoom, setZoom] = React.useState(false);
  const deck = decks.find((x) => x.numero === d)!;
  const legenda = [["Interna", "bg-slate-400"], ["Externa", "bg-sky-400"], ["Varanda", "bg-[var(--brand-orange)]"], ["Suíte", "bg-emerald-400"]];
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Deck plan" title="Planta dos decks" sub="Selecione um deck para ver a distribuição das cabines." />
      <Tabs value={String(d)} onChange={(k) => setD(Number(k))} items={decks.map((x) => ({ key: String(x.numero), label: `Deck ${x.numero}` }))} />
      <Card className="relative mt-5 overflow-hidden">
        <img src={deck.mapa} alt="" className="h-[340px] w-full object-cover" />
        <button onClick={() => setZoom(true)} className="absolute right-4 top-4 rounded-full bg-background/85 p-2.5 backdrop-blur"><ZoomIn className="h-4 w-4" /></button>
        <div className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-3 text-xs">
          {legenda.map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><i className={cx("h-2.5 w-2.5 rounded-full", c)} />{l}</span>)}
          <span className="ml-auto text-muted-foreground">{deck.cabines} cabines</span>
        </div>
      </Card>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {deck.destaques.map((h) => <Card key={h} className="flex items-center gap-2 p-4 text-sm"><Layers className="h-4 w-4 text-primary" />{h}</Card>)}
      </div>
      <Modal open={zoom} onClose={() => setZoom(false)} wide>
        <img src={deck.mapa} alt="" className="w-full" />
      </Modal>
    </div>
  );
}

/* MODELO B — Corte lateral do navio: pilha de decks clicável (vista de perfil). */
export function B() {
  const [d, setD] = React.useState(decks[1].numero);
  const deck = decks.find((x) => x.numero === d)!;
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Deck plan" title="Vista de perfil do navio" sub="Clique em uma faixa para abrir o deck." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="space-y-1.5 p-4">
          {decks.map((x, i) => (
            <button key={x.numero} onClick={() => setD(x.numero)}
              style={{ width: `${100 - i * 4}%` }}
              className={cx("mx-auto flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-xs transition",
                d === x.numero ? "border-primary bg-primary/15 text-foreground" : "border-border bg-accent/30 text-muted-foreground hover:border-primary/40")}>
              <b className="w-6">{x.numero}</b>
              <span className="truncate">{x.nome.split("— ")[1]}</span>
              <span className="ml-auto shrink-0">{x.cabines} cab.</span>
            </button>
          ))}
        </Card>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <img src={deck.mapa} alt="" className="h-40 w-full object-cover" />
            <div className="p-5">
              <h3 className="text-xl font-bold">{deck.nome}</h3>
              <div className="mt-1 text-xs text-muted-foreground">{deck.cabines} cabines</div>
              <div className="mt-3 flex flex-wrap gap-1.5">{deck.destaques.map((h) => <Pill key={h}>{h}</Pill>)}</div>
              <div className="mt-4 space-y-2">
                {cabines.slice(0, 3).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-xl bg-accent/40 px-3 py-2 text-xs">
                    <span className="truncate">{c.nome}</span><b className="ml-auto text-primary">{brl(c.preco)}</b>
                  </div>
                ))}
              </div>
              <Btn className="mt-4 w-full" size="sm">Ver cabines deste deck</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* MODELO C — Planta interativa com grid de cabines clicáveis e status. */
export function C() {
  const [d, setD] = React.useState(decks[2].numero);
  const [sel, setSel] = React.useState<string | null>(null);
  const grid = React.useMemo(
    () => Array.from({ length: 60 }, (_, i) => {
      const num = `${d}${String(i + 1).padStart(3, "0")}`;
      const tipo = i % 7 === 0 ? "suite" : i % 3 === 0 ? "varanda" : i % 2 === 0 ? "externa" : "interna";
      return { num, tipo, livre: i % 5 !== 0 };
    }),
    [d],
  );
  const cor: Record<string, string> = {
    interna: "bg-slate-500/70", externa: "bg-sky-500/70", varanda: "bg-[var(--brand-orange)]/80", suite: "bg-emerald-500/70",
  };
  const item = grid.find((g) => g.num === sel);
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle eyebrow="Deck plan" title="Escolha sua cabine no mapa" />
        <Tabs variant="segment" value={String(d)} onChange={(k) => setD(Number(k))}
          items={decks.slice(0, 5).map((x) => ({ key: String(x.numero), label: `D${x.numero}` }))} />
      </div>
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {Object.entries(cor).map(([k, v]) => <span key={k} className="flex items-center gap-1.5 capitalize"><i className={cx("h-2.5 w-2.5 rounded", v)} />{k}</span>)}
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-border" />ocupada</span>
        </div>
        <div className="grid grid-cols-10 gap-1.5 sm:grid-cols-15 md:grid-cols-20">
          {grid.map((g) => (
            <button key={g.num} disabled={!g.livre} onClick={() => setSel(g.num)}
              title={g.num}
              className={cx("aspect-square rounded transition",
                g.livre ? cor[g.tipo] : "cursor-not-allowed bg-border/60",
                sel === g.num && "ring-2 ring-primary ring-offset-2 ring-offset-[var(--card)]",
                g.livre && "hover:scale-110")} />
          ))}
        </div>
      </Card>
      <Modal open={!!item} onClose={() => setSel(null)}>
        {item && (
          <div className="p-6">
            <Pill tone="solid">Deck {d}</Pill>
            <h3 className="mt-3 text-2xl font-bold">Cabine {item.num}</h3>
            <div className="mt-1 text-sm capitalize text-muted-foreground">Categoria {item.tipo}</div>
            <img src={cabines[3].fotos[0]} alt="" className="mt-4 h-44 w-full rounded-2xl object-cover" />
            <div className="mt-4 flex items-center justify-between">
              <div><div className="text-xs text-muted-foreground">A partir de</div>
                <div className="text-2xl font-bold text-primary">{brl(cabines[3].preco)}</div></div>
              <Btn>Selecionar cabine</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
