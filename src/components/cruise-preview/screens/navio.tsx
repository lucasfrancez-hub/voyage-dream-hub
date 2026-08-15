import * as React from "react";
import { Ship, Users, Utensils, Waves, ArrowRight } from "lucide-react";
import { cruise, fichaTecnica, atracoes, decks, img } from "@/lib/cruise-preview/mock";
import { Btn, Card, Modal, Pill, SectionTitle, Stat, Tabs, cx } from "../kit";

const numeros = [
  { icon: Users, label: "Hóspedes", value: "5.331" },
  { icon: Ship, label: "Decks", value: "18" },
  { icon: Utensils, label: "Restaurantes", value: "11" },
  { icon: Waves, label: "Piscinas", value: "5" },
];

/* MODELO A — Apresentação institucional com "números do navio" e abas. */
export function A() {
  const [aba, setAba] = React.useState("sobre");
  return (
    <div>
      <div className="relative h-80">
        <img src={img("ship-hero", 1800, 900)} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute bottom-8 left-1/2 w-full max-w-7xl -translate-x-1/2 px-6">
          <Pill tone="solid">{cruise.operadora}</Pill>
          <h1 className="mt-2 text-4xl font-bold md:text-5xl">{cruise.navio}</h1>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {numeros.map((n) => (
            <Card key={n.label} className="p-5 text-center">
              <n.icon className="mx-auto h-6 w-6 text-primary" />
              <div className="mt-2 text-2xl font-bold">{n.value}</div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{n.label}</div>
            </Card>
          ))}
        </div>
        <div className="mt-10">
          <Tabs variant="underline" value={aba} onChange={setAba} items={[
            { key: "sobre", label: "Sobre o navio" }, { key: "areas", label: "Áreas de bordo" }, { key: "decks", label: "Decks" },
          ]} />
          <div className="py-7">
            {aba === "sobre" && (
              <div className="grid gap-8 md:grid-cols-2">
                <p className="text-lg leading-relaxed text-muted-foreground">
                  Inaugurado em 2018 e reformado em 2024, o {cruise.navio} foi desenhado para o clima do Mediterrâneo:
                  decks abertos ao mar, promenade panorâmica com vidros e um aquapark que ocupa toda a popa.
                </p>
                <img src={img("ship-about", 1000, 600)} alt="" className="h-60 w-full rounded-2xl object-cover" />
              </div>
            )}
            {aba === "areas" && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {atracoes.slice(0, 6).map((a) => (
                  <Card key={a.nome} className="overflow-hidden">
                    <img src={a.foto} alt="" className="h-36 w-full object-cover" />
                    <div className="p-4"><div className="font-semibold">{a.nome}</div>
                      <div className="text-xs text-muted-foreground">Deck {a.deck} • {a.categoria}</div></div>
                  </Card>
                ))}
              </div>
            )}
            {aba === "decks" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {decks.map((d) => (
                  <Card key={d.numero} className="flex items-center gap-4 p-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-lg font-bold text-primary">{d.numero}</div>
                    <div><div className="font-semibold">{d.nome}</div>
                      <div className="text-xs text-muted-foreground">{d.destaques.join(" • ")}</div></div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* MODELO B — "Corte transversal" do navio: escolha o deck e veja o que há nele. */
export function B() {
  const [deck, setDeck] = React.useState(decks[3].numero);
  const d = decks.find((x) => x.numero === deck)!;
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Conheça o navio" title={cruise.navio} sub="Percorra o navio de cima para baixo." />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card className="overflow-hidden p-2">
          {decks.map((x) => (
            <button key={x.numero} onClick={() => setDeck(x.numero)}
              className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                deck === x.numero ? "bg-primary/15 text-primary" : "hover:bg-accent")}>
              <span className="w-7 text-sm font-bold">{x.numero}</span>
              <span className="truncate text-xs">{x.nome.split("— ")[1]}</span>
              <ArrowRight className={cx("ml-auto h-3.5 w-3.5", deck === x.numero ? "opacity-100" : "opacity-0")} />
            </button>
          ))}
        </Card>
        <div>
          <img src={d.mapa} alt="" className="h-56 w-full rounded-2xl border border-border object-cover" />
          <h3 className="mt-4 text-2xl font-bold">{d.nome}</h3>
          <div className="mt-1 text-sm text-muted-foreground">{d.cabines} cabines neste deck</div>
          <div className="mt-3 flex flex-wrap gap-2">{d.destaques.map((h) => <Pill key={h}>{h}</Pill>)}</div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {atracoes.filter((a) => a.deck.includes(String(deck))).concat(atracoes.slice(0, 3)).slice(0, 3).map((a, i) => (
              <Card key={a.nome + i} className="overflow-hidden">
                <img src={a.foto} alt="" className="h-28 w-full object-cover" />
                <div className="p-3 text-sm font-semibold">{a.nome}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* MODELO C — Vitrine imersiva com hotspots clicáveis sobre a foto do navio. */
export function C() {
  const [hot, setHot] = React.useState<number | null>(null);
  const spots = [
    { x: "18%", y: "30%", ...atracoes[0] },
    { x: "44%", y: "58%", ...atracoes[1] },
    { x: "68%", y: "35%", ...atracoes[2] },
    { x: "82%", y: "66%", ...atracoes[3] },
  ];
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Conheça o navio" title="Toque nos pontos para explorar" sub={`${cruise.navio} • 18 decks • 5.331 hóspedes`} />
      <div className="relative overflow-hidden rounded-3xl border border-border">
        <img src={img("ship-map", 1800, 900)} alt="" className="h-[380px] w-full object-cover" />
        <div className="absolute inset-0 bg-black/25" />
        {spots.map((s, i) => (
          <button key={i} onClick={() => setHot(i)} style={{ left: s.x, top: s.y }}
            className="absolute -translate-x-1/2 -translate-y-1/2">
            <span className="relative grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
              {i + 1}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {fichaTecnica[2].itens.slice(0, 4).map(([k, v]) => <Stat key={k} label={k} value={v} />)}
      </div>
      <Modal open={hot !== null} onClose={() => setHot(null)}>
        {hot !== null && (
          <div>
            <img src={spots[hot].foto} alt="" className="h-56 w-full object-cover" />
            <div className="p-6">
              <Pill tone="solid">Deck {spots[hot].deck}</Pill>
              <h3 className="mt-3 text-2xl font-bold">{spots[hot].nome}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{spots[hot].desc}</p>
              <div className="mt-4 flex gap-2">
                <Pill>{spots[hot].horario}</Pill>
                <Pill>{spots[hot].incluso ? "Incluso" : "Serviço pago"}</Pill>
              </div>
              <Btn className="mt-5 w-full" onClick={() => setHot(null)}>Fechar</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
