import * as React from "react";
import { Ship, Calendar, MapPin, Anchor, Check, X as XIcon, ChevronRight, Play } from "lucide-react";
import { cruise, itinerario, brl, img } from "@/lib/cruise-preview/mock";
import { Btn, Card, Pill, Stat, Tabs, Modal, SectionTitle, cx } from "../kit";

/* =========================== MODELO A =============================
   Editorial cinematográfico: hero full-bleed, barra de reserva fixa
   no rodapé, conteúdo em coluna longa com blocos de leitura. */
export function A() {
  const [aba, setAba] = React.useState("resumo");
  const [heroIdx, setHeroIdx] = React.useState(0);
  return (
    <div className="pb-24">
      <div className="relative h-[480px] overflow-hidden">
        <img src={cruise.galeriaHero[heroIdx]} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-6 pb-10">
          <Pill tone="solid">{cruise.operadora}</Pill>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight md:text-6xl">{cruise.nome}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Ship className="h-4 w-4" />{cruise.navio}</span>
            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{cruise.saida}</span>
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{cruise.portos} portos • {cruise.paises} países</span>
          </p>
        </div>
        <div className="absolute bottom-6 right-6 flex gap-2">
          {cruise.galeriaHero.map((_, i) => (
            <button key={i} onClick={() => setHeroIdx(i)}
              className={cx("h-1.5 rounded-full transition-all", i === heroIdx ? "w-8 bg-primary" : "w-3 bg-white/40")} />
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6">
        <div className="-mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Duração" value={`${cruise.noites} noites`} />
          <Stat label="Embarque" value={cruise.embarque} />
          <Stat label="Portos" value={`${cruise.portos} escalas`} />
          <Stat label="Navio" value={cruise.navio} />
        </div>

        <div className="mt-10">
          <Tabs variant="underline" value={aba} onChange={setAba} items={[
            { key: "resumo", label: "Sobre o cruzeiro" },
            { key: "incluso", label: "O que está incluso" },
            { key: "roteiro", label: "Roteiro resumido" },
          ]} />
          <div className="py-7">
            {aba === "resumo" && (
              <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
                <div>
                  <p className="text-lg leading-relaxed text-muted-foreground">{cruise.resumo}</p>
                  <div className="mt-6 space-y-3">
                    {cruise.destaques.map((d) => (
                      <div key={d} className="flex items-start gap-3 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{d}
                      </div>
                    ))}
                  </div>
                </div>
                <Card className="overflow-hidden">
                  <img src={img("about-a")} alt="" className="h-44 w-full object-cover" />
                  <div className="p-5">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">A partir de</div>
                    <div className="text-3xl font-bold text-primary">{brl(cruise.precoDesde)}</div>
                    <div className="text-xs text-muted-foreground">por pessoa + {brl(cruise.taxasDesde)} de taxas</div>
                    <Btn className="mt-4 w-full">Ver cabines disponíveis</Btn>
                  </div>
                </Card>
              </div>
            )}
            {aba === "incluso" && (
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="p-6">
                  <h3 className="mb-4 font-bold text-primary">Incluso</h3>
                  {cruise.incluso.map((i) => (
                    <div key={i} className="flex gap-2 py-1.5 text-sm"><Check className="h-4 w-4 text-primary" />{i}</div>
                  ))}
                </Card>
                <Card className="p-6">
                  <h3 className="mb-4 font-bold text-muted-foreground">Não incluso</h3>
                  {cruise.naoIncluso.map((i) => (
                    <div key={i} className="flex gap-2 py-1.5 text-sm text-muted-foreground"><XIcon className="h-4 w-4" />{i}</div>
                  ))}
                </Card>
              </div>
            )}
            {aba === "roteiro" && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {itinerario.map((p) => (
                  <Card key={p.dia} className="flex items-center gap-3 p-3">
                    <img src={p.foto} alt="" className="h-14 w-14 rounded-xl object-cover" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">Dia {p.dia} • {p.data}</div>
                      <div className="truncate text-sm font-semibold">{p.porto}</div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
          <div>
            <div className="text-[11px] text-muted-foreground">A partir de</div>
            <div className="text-lg font-bold text-primary">{brl(cruise.precoDesde)}</div>
          </div>
          <div className="ml-auto flex gap-2">
            <Btn variant="outline">Falar com consultor</Btn>
            <Btn>Reservar</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================== MODELO B =============================
   Painel comercial: hero contido + coluna lateral fixa de cotação,
   informação densa em blocos (estilo "ficha do produto"). */
export function B() {
  const [ocup, setOcup] = React.useState("2");
  const [aberto, setAberto] = React.useState(false);
  return (
    <div className="mx-auto max-w-7xl px-5 py-6">
      <div className="mb-4 text-xs text-muted-foreground">Cruzeiros <ChevronRight className="inline h-3 w-3" /> Mediterrâneo <ChevronRight className="inline h-3 w-3" /> <span className="text-foreground">{cruise.nome}</span></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="grid grid-cols-4 gap-2 overflow-hidden rounded-2xl">
            <img src={cruise.galeriaHero[0]} alt="" className="col-span-4 h-64 w-full object-cover md:col-span-3 md:h-80" />
            <div className="col-span-4 grid grid-cols-3 gap-2 md:col-span-1 md:grid-cols-1">
              {[1, 2].map((i) => <img key={i} src={cruise.galeriaHero[i % 3]} alt="" className="h-24 w-full object-cover md:h-[calc((20rem-0.5rem)/2)]" />)}
              <button onClick={() => setAberto(true)} className="flex h-24 items-center justify-center rounded-xl border border-border bg-card text-xs font-semibold md:hidden">+14 fotos</button>
            </div>
          </div>
          <h1 className="mt-5 text-3xl font-bold">{cruise.nome}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill>{cruise.noites} noites</Pill><Pill>{cruise.navio}</Pill><Pill>{cruise.portos} portos</Pill><Pill>Saída {cruise.saida}</Pill>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{cruise.resumo}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {cruise.destaques.map((d) => (
              <Card key={d} className="flex items-center gap-3 p-4 text-sm">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><Anchor className="h-4 w-4" /></div>
                {d}
              </Card>
            ))}
          </div>

          <Card className="mt-6 divide-y divide-border">
            {[["Embarque", cruise.embarque], ["Desembarque", cruise.desembarque], ["Companhia", cruise.operadora], ["Bandeira", cruise.bandeira]].map(([k, v]) => (
              <div key={k} className="flex justify-between px-5 py-3 text-sm">
                <span className="text-muted-foreground">{k}</span><span className="font-semibold">{v}</span>
              </div>
            ))}
          </Card>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <div className="text-xs text-muted-foreground">A partir de</div>
            <div className="text-3xl font-bold text-primary">{brl(cruise.precoDesde)}</div>
            <div className="text-xs text-muted-foreground">por pessoa • taxas {brl(cruise.taxasDesde)}</div>
            <div className="mt-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Ocupação</div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {["1", "2", "3", "4"].map((o) => (
                <button key={o} onClick={() => setOcup(o)}
                  className={cx("rounded-lg border py-2 text-sm font-semibold transition", ocup === o ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>{o}</button>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-accent/50 p-3 text-xs text-muted-foreground">
              Total estimado para {ocup} hóspede(s):{" "}
              <b className="text-foreground">{brl(cruise.precoDesde * Number(ocup) * (ocup === "1" ? 1.75 : 1))}</b>
            </div>
            <Btn className="mt-4 w-full">Escolher cabine</Btn>
            <Btn variant="outline" className="mt-2 w-full" onClick={() => setAberto(true)}>Ver detalhes do roteiro</Btn>
            <div className="mt-3 text-center text-[11px] text-muted-foreground">5% de desconto no Pix • 10x sem juros</div>
          </Card>
        </div>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} wide>
        <div className="p-6">
          <SectionTitle title="Roteiro completo" sub={`${cruise.noites} noites • ${cruise.portos} portos`} />
          <div className="space-y-2">
            {itinerario.map((p) => (
              <div key={p.dia} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <div className="w-14 text-center text-xs text-muted-foreground">Dia {p.dia}<div className="font-bold text-foreground">{p.data}</div></div>
                <img src={p.foto} alt="" className="h-12 w-16 rounded-lg object-cover" />
                <div className="min-w-0 flex-1"><div className="font-semibold">{p.porto}</div><div className="truncate text-xs text-muted-foreground">{p.descricao}</div></div>
                <div className="hidden text-right text-xs text-muted-foreground sm:block">{p.chegada} → {p.saida}</div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* =========================== MODELO C =============================
   Storytelling por capítulos com navegação lateral por âncoras e
   vídeo de abertura — foco em exploração visual. */
export function C() {
  const [cap, setCap] = React.useState("historia");
  const caps = [
    { key: "historia", label: "O convite" },
    { key: "navio", label: "O navio" },
    { key: "rota", label: "A rota" },
    { key: "valores", label: "Valores" },
  ];
  return (
    <div>
      <div className="relative h-[420px]">
        <img src={cruise.galeriaHero[2]} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 grid place-items-center bg-black/50 text-center">
          <div>
            <button className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-white/40 bg-white/10 backdrop-blur transition hover:scale-105">
              <Play className="h-6 w-6 fill-current" />
            </button>
            <div className="mt-5 text-[11px] uppercase tracking-[0.35em] text-primary">{cruise.noites} noites • Mediterrâneo</div>
            <h1 className="mt-2 text-4xl font-bold md:text-6xl">{cruise.nome}</h1>
            <p className="mt-2 text-sm text-white/80">{cruise.navio} • saída em {cruise.saida}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[190px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex gap-2 overflow-x-auto lg:flex-col">
            {caps.map((c) => (
              <button key={c.key} onClick={() => setCap(c.key)}
                className={cx("shrink-0 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition",
                  cap === c.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent")}>{c.label}</button>
            ))}
          </div>
        </div>

        <div className="min-h-[420px]">
          {cap === "historia" && (
            <div className="space-y-6">
              <SectionTitle eyebrow="Capítulo 01" title="Onze noites, oito portos, uma única mala." />
              <p className="text-lg leading-relaxed text-muted-foreground">{cruise.resumo}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {cruise.galeriaHero.map((f, i) => <img key={i} src={f} alt="" className="h-40 w-full rounded-2xl object-cover" />)}
              </div>
            </div>
          )}
          {cap === "navio" && (
            <div className="space-y-6">
              <SectionTitle eyebrow="Capítulo 02" title={cruise.navio} sub="153 mil toneladas, 18 decks e um dos maiores aquaparks do mar." />
              <img src={img("chapter-ship", 1400, 700)} alt="" className="h-72 w-full rounded-3xl object-cover" />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Hóspedes" value="5.331" /><Stat label="Cabines" value="2.066" />
                <Stat label="Restaurantes" value="11" /><Stat label="Piscinas" value="5" />
              </div>
            </div>
          )}
          {cap === "rota" && (
            <div className="space-y-4">
              <SectionTitle eyebrow="Capítulo 03" title="A rota" />
              {itinerario.filter((p) => p.tipo !== "mar").map((p) => (
                <div key={p.dia} className="group flex gap-4 rounded-2xl border border-border p-3 transition hover:border-primary/50">
                  <img src={p.foto} alt="" className="h-20 w-28 rounded-xl object-cover" />
                  <div><div className="text-xs text-primary">Dia {p.dia} • {p.data}</div>
                    <div className="font-bold">{p.porto}, {p.pais}</div>
                    <div className="text-xs text-muted-foreground">{p.descricao}</div></div>
                </div>
              ))}
            </div>
          )}
          {cap === "valores" && (
            <div className="space-y-5">
              <SectionTitle eyebrow="Capítulo 04" title="Valores e condições" />
              <Card className="p-6">
                <div className="text-4xl font-bold text-primary">{brl(cruise.precoDesde)}</div>
                <div className="text-sm text-muted-foreground">por pessoa em cabine dupla + {brl(cruise.taxasDesde)} de taxas</div>
                <div className="mt-4 grid gap-2 text-sm">
                  <div className="rounded-xl bg-accent/50 px-4 py-3">Pix com <b className="text-primary">5% de desconto</b></div>
                  <div className="rounded-xl bg-accent/50 px-4 py-3">Cartão em <b>10x sem juros</b></div>
                </div>
                <Btn size="lg" className="mt-5 w-full">Quero reservar</Btn>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
