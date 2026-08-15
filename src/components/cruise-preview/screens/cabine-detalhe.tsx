import * as React from "react";
import { Users, Maximize2, Layers, Check, ChevronLeft, Bed } from "lucide-react";
import { cabines, brl, ocupacoes, tarifas } from "@/lib/cruise-preview/mock";
import { Btn, Card, Lightbox, Modal, Pill, SectionTitle, Tabs, cx } from "../kit";

const c = cabines.find((x) => x.id === "sui-gr")!;

/* MODELO A — Página clássica: galeria à esquerda, box de reserva fixo à direita. */
export function A() {
  const [foto, setFoto] = React.useState(0);
  const [lb, setLb] = React.useState<number | null>(null);
  const [ocup, setOcup] = React.useState(1);
  const total = Math.round(c.preco * ocupacoes[ocup].fator);
  return (
    <div className="mx-auto max-w-7xl px-5 py-6">
      <button className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" />Voltar para cabines</button>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <img src={c.fotos[foto]} alt="" onClick={() => setLb(foto)} className="h-[380px] w-full cursor-zoom-in rounded-3xl object-cover" />
          <div className="mt-3 flex gap-3">
            {c.fotos.map((f, i) => (
              <button key={f} onClick={() => setFoto(i)}>
                <img src={f} alt="" className={cx("h-16 w-24 rounded-xl object-cover transition", i === foto ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100")} />
              </button>
            ))}
          </div>
          <Pill tone="solid" className="mt-6">{c.familia}</Pill>
          <h1 className="mt-2 text-3xl font-bold">{c.nome}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.descricao}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[[Maximize2, "Área", c.area], [Users, "Ocupação", c.ocupacao], [Layers, "Decks", c.decks], [Bed, "Camas", "1 king + sofá"]].map(([I, k, v]: any) => (
              <Card key={k} className="p-4"><I className="h-4 w-4 text-primary" />
                <div className="mt-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">{k}</div>
                <div className="text-sm font-semibold">{v}</div></Card>
            ))}
          </div>
          <h3 className="mt-8 text-sm font-bold uppercase tracking-widest text-muted-foreground">Comodidades</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {c.amenidades.map((a) => <div key={a} className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" />{a}</div>)}
          </div>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <div className="text-xs text-muted-foreground">A partir de</div>
            <div className="text-3xl font-bold text-primary">{brl(total)}</div>
            <div className="text-xs text-muted-foreground">por pessoa + {brl(c.taxas)} de taxas</div>
            <div className="mt-4 space-y-1.5">
              {ocupacoes.map((o, i) => (
                <button key={o.label} onClick={() => setOcup(i)}
                  className={cx("flex w-full justify-between rounded-xl border px-3 py-2 text-sm transition",
                    ocup === i ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                  {o.label}<b>{brl(Math.round(c.preco * o.fator))}</b>
                </button>
              ))}
            </div>
            <Btn className="mt-4 w-full">Reservar</Btn>
            <Btn variant="outline" className="mt-2 w-full">Falar com consultor</Btn>
            <div className="mt-3 text-center text-[11px] text-muted-foreground">{c.disponiveis} cabines disponíveis</div>
          </Card>
        </div>
      </div>
      <Lightbox fotos={c.fotos} index={lb} onIndex={setLb} onClose={() => setLb(null)} legenda={c.nome} />
    </div>
  );
}

/* MODELO B — Imersivo: capa full-width + abas de conteúdo + barra de preço fixa. */
export function B() {
  const [aba, setAba] = React.useState("visao");
  const [lb, setLb] = React.useState<number | null>(null);
  return (
    <div className="pb-24">
      <div className="relative h-[420px]">
        <img src={c.fotos[0]} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-6 pb-8">
          <Pill tone="solid">{c.familia} • Deck {c.decks}</Pill>
          <h1 className="mt-2 text-4xl font-bold md:text-5xl">{c.nome}</h1>
          <div className="mt-1 text-sm text-muted-foreground">{c.area} • {c.ocupacao}</div>
        </div>
        <button onClick={() => setLb(0)} className="absolute bottom-6 right-6 rounded-full bg-background/80 px-4 py-2 text-xs font-semibold backdrop-blur">Ver {c.fotos.length} fotos</button>
      </div>
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <Tabs variant="underline" value={aba} onChange={setAba} items={[
          { key: "visao", label: "Visão geral" }, { key: "planta", label: "Planta e camas" },
          { key: "tarifas", label: "Tarifas" }, { key: "regras", label: "Regras" }]} />
        <div className="py-7">
          {aba === "visao" && (
            <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
              <div>
                <p className="text-lg leading-relaxed text-muted-foreground">{c.descricao}</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {c.amenidades.map((a) => <Card key={a} className="flex gap-2 p-3 text-sm"><Check className="h-4 w-4 text-primary" />{a}</Card>)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {c.fotos.slice(1).map((f, i) => <img key={f} src={f} alt="" onClick={() => setLb(i + 1)} className="h-32 w-full cursor-zoom-in rounded-xl object-cover" />)}
              </div>
            </div>
          )}
          {aba === "planta" && (
            <div className="grid gap-6 md:grid-cols-2">
              <img src={c.fotos[2]} alt="" className="h-64 w-full rounded-2xl border border-border object-cover" />
              <div className="space-y-2 text-sm">
                {[["Cama principal", "King size (separável em duas)"], ["Sofá-cama", "1 (para 3º hóspede)"], ["Banheiro", "Banheira + box separado"], ["Varanda", "12 m² com jacuzzi"]].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-border py-2"><span className="text-muted-foreground">{k}</span><b>{v}</b></div>
                ))}
              </div>
            </div>
          )}
          {aba === "tarifas" && (
            <div className="grid gap-3 sm:grid-cols-3">
              {tarifas.map((t) => (
                <Card key={t.nome} className={cx("p-5", t.destaque && "border-primary/60")}>
                  <div className="font-bold">{t.nome}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{t.desc}</div>
                  <div className="mt-3 text-2xl font-bold text-primary">{brl(Math.round(c.preco * t.multiplicador))}</div>
                  <Btn size="sm" variant={t.destaque ? "primary" : "outline"} className="mt-3 w-full">Escolher</Btn>
                </Card>
              ))}
            </div>
          )}
          {aba === "regras" && (
            <ul className="space-y-2 text-sm text-muted-foreground">
              {["Check-in a bordo a partir das 13h", "Berço disponível mediante solicitação", "Cabine não fumante", "Cancelamento conforme a tarifa escolhida"].map((r) => (
                <li key={r} className="flex gap-2"><Check className="h-4 w-4 text-primary" />{r}</li>))}
            </ul>
          )}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <div><div className="text-[11px] text-muted-foreground">{c.nome}</div>
            <div className="text-lg font-bold text-primary">{brl(c.preco)} <span className="text-xs font-normal text-muted-foreground">por pessoa</span></div></div>
          <Btn className="ml-auto">Reservar cabine</Btn>
        </div>
      </div>
      <Lightbox fotos={c.fotos} index={lb} onIndex={setLb} onClose={() => setLb(null)} legenda={c.nome} />
    </div>
  );
}

/* MODELO C — Configurador passo a passo (ocupação → tarifa → localização). */
export function C() {
  const [passo, setPasso] = React.useState(1);
  const [ocup, setOcup] = React.useState(1);
  const [tar, setTar] = React.useState(1);
  const [cab, setCab] = React.useState<string | null>(null);
  const [lb, setLb] = React.useState<number | null>(null);
  const total = Math.round(c.preco * ocupacoes[ocup].fator * tarifas[tar].multiplicador);
  const numeros = ["14012", "14016", "14020", "14024", "14028", "14032"];
  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div>
          <img src={c.fotos[0]} alt="" onClick={() => setLb(0)} className="h-36 w-full cursor-zoom-in rounded-2xl object-cover" />
          <div className="mt-3 font-bold">{c.nome}</div>
          <div className="text-xs text-muted-foreground">{c.area} • Deck {c.decks}</div>
          <div className="mt-4 rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Total por pessoa</div>
            <div className="text-2xl font-bold text-primary">{brl(total)}</div>
            <div className="text-[11px] text-muted-foreground">+ {brl(c.taxas)} de taxas</div>
          </div>
        </div>
        <div>
          <div className="mb-5 flex items-center gap-2">
            {[1, 2, 3].map((n) => (
              <React.Fragment key={n}>
                <button onClick={() => setPasso(n)} className={cx("grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition",
                  passo >= n ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground")}>{n}</button>
                {n < 3 && <div className={cx("h-px flex-1", passo > n ? "bg-primary" : "bg-border")} />}
              </React.Fragment>
            ))}
          </div>
          {passo === 1 && (
            <div>
              <SectionTitle title="Quantos hóspedes?" sub="O valor por pessoa muda conforme a ocupação da cabine." />
              <div className="grid gap-2 sm:grid-cols-2">
                {ocupacoes.map((o, i) => (
                  <button key={o.label} onClick={() => setOcup(i)}
                    className={cx("rounded-2xl border p-4 text-left transition", ocup === i ? "border-primary bg-primary/10" : "border-border hover:border-primary/40")}>
                    <div className="font-semibold">{o.label}</div>
                    <div className="text-sm text-primary">{brl(Math.round(c.preco * o.fator))} p/ pessoa</div>
                  </button>
                ))}
              </div>
              <Btn className="mt-5" onClick={() => setPasso(2)}>Continuar</Btn>
            </div>
          )}
          {passo === 2 && (
            <div>
              <SectionTitle title="Qual tarifa?" sub="Flexibilidade x preço." />
              <div className="space-y-2">
                {tarifas.map((t, i) => (
                  <button key={t.nome} onClick={() => setTar(i)}
                    className={cx("flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition", tar === i ? "border-primary bg-primary/10" : "border-border")}>
                    <div className="flex-1"><div className="font-semibold">{t.nome}</div><div className="text-xs text-muted-foreground">{t.desc}</div></div>
                    <b className="text-primary">{brl(Math.round(c.preco * ocupacoes[ocup].fator * t.multiplicador))}</b>
                  </button>
                ))}
              </div>
              <div className="mt-5 flex gap-2"><Btn variant="outline" onClick={() => setPasso(1)}>Voltar</Btn><Btn onClick={() => setPasso(3)}>Continuar</Btn></div>
            </div>
          )}
          {passo === 3 && (
            <div>
              <SectionTitle title="Escolha a cabine no deck" sub={`Deck ${c.decks} • ${c.disponiveis} cabines disponíveis`} />
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {numeros.map((n) => (
                  <button key={n} onClick={() => setCab(n)}
                    className={cx("rounded-xl border py-3 text-xs font-semibold transition", cab === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50")}>{n}</button>
                ))}
              </div>
              <Card className="mt-5 p-4 text-sm">
                {cab ? <>Cabine <b className="text-primary">{cab}</b> selecionada • {tarifas[tar].nome} • {ocupacoes[ocup].label}</> : "Selecione um número de cabine."}
              </Card>
              <div className="mt-5 flex gap-2"><Btn variant="outline" onClick={() => setPasso(2)}>Voltar</Btn><Btn>Concluir reserva</Btn></div>
            </div>
          )}
        </div>
      </div>
      <Lightbox fotos={c.fotos} index={lb} onIndex={setLb} onClose={() => setLb(null)} legenda={c.nome} />
    </div>
  );
}
