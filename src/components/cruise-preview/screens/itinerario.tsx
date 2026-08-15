import * as React from "react";
import { Anchor, Waves, MapPin, Clock, ChevronDown } from "lucide-react";
import { itinerario, cruise, brl } from "@/lib/cruise-preview/mock";
import { Btn, Card, Modal, Pill, SectionTitle, Tabs, cx } from "../kit";

const icone = (t: string) => (t === "mar" ? Waves : Anchor);

/* MODELO A — Timeline vertical clássica com expansão inline. */
export function A() {
  const [aberto, setAberto] = React.useState<number | null>(2);
  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <SectionTitle eyebrow="Itinerário" title={`${cruise.noites} noites pelo Mediterrâneo`} sub={`${cruise.embarque} → ${cruise.desembarque}`} />
      <div className="relative pl-8">
        <div className="absolute bottom-4 left-3 top-4 w-px bg-border" />
        {itinerario.map((p) => {
          const Ico = icone(p.tipo);
          const on = aberto === p.dia;
          return (
            <div key={p.dia} className="relative pb-3">
              <div className={cx("absolute -left-[1.35rem] top-4 grid h-6 w-6 place-items-center rounded-full border-2",
                p.tipo === "mar" ? "border-border bg-background text-muted-foreground" : "border-primary bg-primary text-primary-foreground")}>
                <Ico className="h-3 w-3" />
              </div>
              <button onClick={() => setAberto(on ? null : p.dia)} className="w-full text-left">
                <Card className={cx("p-4 transition", on && "border-primary/60")}>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground">Dia {p.dia} • {p.data}</div>
                    <div className="ml-auto text-xs text-muted-foreground">{p.chegada} → {p.saida}</div>
                    <ChevronDown className={cx("h-4 w-4 transition", on && "rotate-180 text-primary")} />
                  </div>
                  <div className="mt-1 text-lg font-bold">{p.porto}{p.pais !== "—" && <span className="text-muted-foreground">, {p.pais}</span>}</div>
                  {on && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
                      <img src={p.foto} alt="" className="h-28 w-full rounded-xl object-cover" />
                      <div>
                        <p className="text-sm text-muted-foreground">{p.descricao}</p>
                        {p.passeios.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {p.passeios.map((x) => (
                              <div key={x.nome} className="flex items-center gap-2 rounded-lg bg-accent/40 px-3 py-2 text-xs">
                                <MapPin className="h-3.5 w-3.5 text-primary" />{x.nome}
                                <span className="ml-auto text-muted-foreground">{x.duracao} • {brl(x.preco)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* MODELO B — Mapa/rota horizontal com trilho de portos + painel de detalhe. */
export function B() {
  const [sel, setSel] = React.useState(0);
  const p = itinerario[sel];
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Itinerário" title="Navegue pela rota" sub="Clique em um porto no trilho para ver os detalhes do dia." />
      <Card className="overflow-hidden">
        <div className="relative overflow-x-auto px-6 py-8">
          <div className="absolute left-6 right-6 top-[3.35rem] h-0.5 bg-border" />
          <div className="relative flex min-w-max gap-8">
            {itinerario.map((x, i) => {
              const Ico = icone(x.tipo);
              return (
                <button key={x.dia} onClick={() => setSel(i)} className="flex w-24 flex-col items-center gap-2">
                  <div className="text-[10px] font-bold text-muted-foreground">{x.data}</div>
                  <div className={cx("grid h-8 w-8 place-items-center rounded-full border-2 transition",
                    i === sel ? "scale-125 border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}>
                    <Ico className="h-3.5 w-3.5" />
                  </div>
                  <div className={cx("text-center text-[11px] leading-tight", i === sel ? "font-bold text-foreground" : "text-muted-foreground")}>{x.porto}</div>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 md:grid-cols-[1.2fr_1fr]">
        <img src={p.foto} alt="" className="h-72 w-full rounded-2xl object-cover" />
        <div>
          <Pill tone="solid">Dia {p.dia} • {p.data}</Pill>
          <h3 className="mt-3 text-2xl font-bold">{p.porto}</h3>
          <div className="mt-1 text-sm text-muted-foreground">{p.pais}</div>
          <div className="mt-3 flex gap-2 text-xs">
            <Pill><Clock className="h-3 w-3" />Chegada {p.chegada}</Pill>
            <Pill><Clock className="h-3 w-3" />Saída {p.saida}</Pill>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{p.descricao}</p>
          {p.passeios.length === 0 ? (
            <Card className="mt-4 p-4 text-sm text-muted-foreground">Sem excursões neste dia — aproveite as atrações de bordo.</Card>
          ) : (
            <div className="mt-4 space-y-2">
              {p.passeios.map((x) => (
                <Card key={x.nome} className="flex items-center gap-3 p-3 text-sm">
                  <MapPin className="h-4 w-4 text-primary" />{x.nome}
                  <span className="ml-auto text-xs text-muted-foreground">{x.duracao}</span>
                  <b className="text-primary">{brl(x.preco)}</b>
                </Card>
              ))}
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <Btn variant="outline" size="sm" onClick={() => setSel(Math.max(0, sel - 1))}>Dia anterior</Btn>
            <Btn size="sm" onClick={() => setSel(Math.min(itinerario.length - 1, sel + 1))}>Próximo dia</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* MODELO C — Grade de cartões-postais com filtro e drawer lateral. */
export function C() {
  const [filtro, setFiltro] = React.useState("todos");
  const [drawer, setDrawer] = React.useState<number | null>(null);
  const lista = itinerario.filter((p) => (filtro === "todos" ? true : filtro === "mar" ? p.tipo === "mar" : p.tipo !== "mar"));
  const p = drawer !== null ? itinerario[drawer] : null;
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle eyebrow="Itinerário" title="Cada dia, um cartão-postal" />
        <Tabs variant="segment" value={filtro} onChange={setFiltro} items={[
          { key: "todos", label: `Todos ${itinerario.length}` },
          { key: "porto", label: "Em terra" },
          { key: "mar", label: "No mar" },
        ]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((x) => (
          <button key={x.dia} onClick={() => setDrawer(itinerario.indexOf(x))} className="group text-left">
            <Card className="overflow-hidden transition group-hover:-translate-y-1 group-hover:border-primary/50">
              <div className="relative h-44">
                <img src={x.foto} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute bottom-3 left-4">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-primary">Dia {x.dia} • {x.data}</div>
                  <div className="text-xl font-bold">{x.porto}</div>
                </div>
                {x.tipo === "mar" && <Pill className="absolute right-3 top-3" tone="solid">Navegação</Pill>}
              </div>
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />{x.chegada} → {x.saida}
                <span className="ml-auto font-semibold text-primary">{x.passeios.length} passeio(s)</span>
              </div>
            </Card>
          </button>
        ))}
      </div>

      <Modal open={p !== null} onClose={() => setDrawer(null)} side="right">
        {p && (
          <div>
            <img src={p.foto} alt="" className="h-56 w-full object-cover" />
            <div className="p-6">
              <Pill tone="solid">Dia {p.dia} • {p.data}</Pill>
              <h3 className="mt-3 text-2xl font-bold">{p.porto}</h3>
              <div className="text-sm text-muted-foreground">{p.pais} • {p.chegada} → {p.saida}</div>
              <p className="mt-4 text-sm text-muted-foreground">{p.descricao}</p>
              <h4 className="mt-6 text-sm font-bold uppercase tracking-widest text-muted-foreground">Excursões sugeridas</h4>
              {p.passeios.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nenhuma excursão neste dia.</p>}
              <div className="mt-2 space-y-2">
                {p.passeios.map((x) => (
                  <Card key={x.nome} className="p-4">
                    <div className="font-semibold">{x.nome}</div>
                    <div className="mt-1 flex items-center text-xs text-muted-foreground">{x.duracao}<b className="ml-auto text-sm text-primary">{brl(x.preco)}</b></div>
                    <Btn size="sm" variant="outline" className="mt-3 w-full">Adicionar ao orçamento</Btn>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
