import * as React from "react";
import { Play, Clock } from "lucide-react";
import { videos } from "@/lib/cruise-preview/mock";
import { Card, Modal, Pill, SectionTitle, Tabs, cx, Btn } from "../kit";

const cats = ["Todos", ...Array.from(new Set(videos.map((v) => v.cat)))];

function Player({ v, onClose }: { v: (typeof videos)[number] | null; onClose: () => void }) {
  return (
    <Modal open={!!v} onClose={onClose} wide>
      {v && (
        <div>
          <div className="relative aspect-video bg-black">
            <img src={v.thumb} alt="" className="h-full w-full object-cover opacity-60" />
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground"><Play className="h-6 w-6 fill-current" /></div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><div className="h-full w-1/3 bg-primary" /></div>
          </div>
          <div className="p-6">
            <h3 className="text-xl font-bold">{v.titulo}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{v.desc}</p>
            <div className="mt-3 flex gap-2"><Pill>{v.cat}</Pill><Pill><Clock className="h-3 w-3" />{v.dur}</Pill></div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* MODELO A — Grade de miniaturas com modal de player. */
export function A() {
  const [cat, setCat] = React.useState("Todos");
  const [v, setV] = React.useState<(typeof videos)[number] | null>(null);
  const lista = videos.filter((x) => cat === "Todos" || x.cat === cat);
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Vídeos" title="Veja antes de embarcar" sub={`${videos.length} vídeos`} />
      <Tabs value={cat} onChange={setCat} items={cats.map((c) => ({ key: c, label: c }))} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((x) => (
          <button key={x.titulo} onClick={() => setV(x)} className="text-left">
            <Card className="group overflow-hidden transition hover:border-primary/50">
              <div className="relative aspect-video">
                <img src={x.thumb} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition group-hover:opacity-100">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground"><Play className="h-5 w-5 fill-current" /></div>
                </div>
                <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px]">{x.dur}</span>
              </div>
              <div className="p-4"><div className="font-semibold">{x.titulo}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{x.cat}</div></div>
            </Card>
          </button>
        ))}
      </div>
      <Player v={v} onClose={() => setV(null)} />
    </div>
  );
}

/* MODELO B — Player fixo com playlist lateral (estilo streaming). */
export function B() {
  const [i, setI] = React.useState(0);
  const v = videos[i];
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="relative aspect-video overflow-hidden rounded-3xl border border-border bg-black">
            <img src={v.thumb} alt="" className="h-full w-full object-cover opacity-70" />
            <div className="absolute inset-0 grid place-items-center">
              <button className="grid h-20 w-20 place-items-center rounded-full bg-primary/90 text-primary-foreground transition hover:scale-105"><Play className="h-8 w-8 fill-current" /></button>
            </div>
          </div>
          <h2 className="mt-4 text-2xl font-bold">{v.titulo}</h2>
          <div className="mt-1 flex gap-2"><Pill>{v.cat}</Pill><Pill>{v.dur}</Pill></div>
          <p className="mt-3 text-sm text-muted-foreground">{v.desc}</p>
        </div>
        <Card className="max-h-[520px] overflow-y-auto p-2">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Playlist • {videos.length} vídeos</div>
          {videos.map((x, k) => (
            <button key={x.titulo} onClick={() => setI(k)}
              className={cx("flex w-full gap-3 rounded-xl p-2 text-left transition", k === i ? "bg-primary/15" : "hover:bg-accent/50")}>
              <div className="relative"><img src={x.thumb} alt="" className="h-14 w-24 rounded-lg object-cover" />
                <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[10px]">{x.dur}</span></div>
              <div className="min-w-0"><div className="truncate text-sm font-semibold">{x.titulo}</div>
                <div className="text-[11px] text-muted-foreground">{x.cat}</div></div>
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* MODELO C — Stories verticais (formato mobile-first) com barra de progresso. */
export function C() {
  const [i, setI] = React.useState(0);
  const v = videos[i];
  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <SectionTitle eyebrow="Vídeos" title="Formato stories" sub="Toque nas laterais para avançar — pensado para mobile." />
      <div className="mx-auto w-full max-w-[360px]">
        <div className="mb-2 flex gap-1">
          {videos.map((_, k) => <div key={k} className={cx("h-1 flex-1 rounded-full", k <= i ? "bg-primary" : "bg-border")} />)}
        </div>
        <div className="relative aspect-[9/16] overflow-hidden rounded-3xl border border-border">
          <img src={v.thumb} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/40" />
          <button onClick={() => setI((i - 1 + videos.length) % videos.length)} className="absolute inset-y-0 left-0 w-1/3" />
          <button onClick={() => setI((i + 1) % videos.length)} className="absolute inset-y-0 right-0 w-1/3" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="grid h-16 w-16 place-items-center rounded-full border border-white/40 bg-white/10 backdrop-blur"><Play className="h-6 w-6 fill-current" /></div>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5">
            <Pill tone="solid">{v.cat}</Pill>
            <div className="mt-2 text-lg font-bold">{v.titulo}</div>
            <div className="text-xs text-white/70">{v.desc}</div>
          </div>
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Btn size="sm" variant="outline" onClick={() => setI((i - 1 + videos.length) % videos.length)}>Anterior</Btn>
          <Btn size="sm" onClick={() => setI((i + 1) % videos.length)}>Próximo</Btn>
        </div>
      </div>
    </div>
  );
}
