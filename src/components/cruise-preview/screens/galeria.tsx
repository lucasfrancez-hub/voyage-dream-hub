import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { galeria } from "@/lib/cruise-preview/mock";
import { Card, Lightbox, Pill, SectionTitle, Tabs, cx, Btn } from "../kit";

const cats = ["Todas", ...Array.from(new Set(galeria.map((g) => g.cat)))];

/* MODELO A — Masonry com filtro e lightbox. */
export function A() {
  const [cat, setCat] = React.useState("Todas");
  const [lb, setLb] = React.useState<number | null>(null);
  const lista = galeria.filter((g) => cat === "Todas" || g.cat === cat);
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Galeria" title={`${galeria.length} fotos do cruzeiro`} />
      <Tabs value={cat} onChange={setCat} items={cats.map((c) => ({ key: c, label: c }))} />
      <div className="mt-6 columns-2 gap-3 md:columns-3 lg:columns-4">
        {lista.map((g, i) => (
          <button key={g.titulo} onClick={() => setLb(i)} className="mb-3 block w-full break-inside-avoid">
            <div className="group relative overflow-hidden rounded-2xl">
              <img src={g.src} alt={g.titulo} className={cx("w-full object-cover transition duration-500 group-hover:scale-105", i % 3 === 0 ? "h-64" : i % 3 === 1 ? "h-44" : "h-52")} />
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                <span className="text-xs font-semibold">{g.titulo}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
      <Lightbox fotos={lista.map((g) => g.src)} index={lb} onIndex={setLb} onClose={() => setLb(null)} legenda={lb !== null ? lista[lb].titulo : ""} />
    </div>
  );
}

/* MODELO B — Álbuns por tema: capas → carrossel dentro do álbum. */
export function B() {
  const [album, setAlbum] = React.useState<string | null>(null);
  const [i, setI] = React.useState(0);
  const fotos = album ? galeria.filter((g) => g.cat === album) : [];
  const albuns = cats.slice(1);
  if (album) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-8">
        <button onClick={() => setAlbum(null)} className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" />Todos os álbuns</button>
        <SectionTitle eyebrow="Álbum" title={album} sub={`${fotos.length} fotos`} />
        <div className="relative overflow-hidden rounded-3xl border border-border">
          <img src={fotos[i].src} alt="" className="h-[420px] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/85 to-transparent p-5">
            <div><div className="text-sm font-bold">{fotos[i].titulo}</div>
              <div className="text-xs text-white/60">{i + 1} de {fotos.length}</div></div>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setI((i - 1 + fotos.length) % fotos.length)} className="rounded-full bg-white/15 p-2.5"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setI((i + 1) % fotos.length)} className="rounded-full bg-white/15 p-2.5"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {fotos.map((f, k) => (
            <button key={f.titulo} onClick={() => setI(k)}>
              <img src={f.src} alt="" className={cx("h-16 w-24 shrink-0 rounded-xl object-cover", k === i ? "ring-2 ring-primary" : "opacity-55")} />
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <SectionTitle eyebrow="Galeria" title="Álbuns" sub="Escolha um tema para navegar." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {albuns.map((a) => {
          const f = galeria.filter((g) => g.cat === a);
          return (
            <button key={a} onClick={() => { setAlbum(a); setI(0); }} className="group relative h-56 overflow-hidden rounded-3xl border border-border">
              <img src={f[0].src} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4 text-left">
                <div className="text-lg font-bold">{a}</div>
                <div className="text-xs text-white/70">{f.length} fotos</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* MODELO C — Faixa cinematográfica horizontal com foto em destaque. */
export function C() {
  const [i, setI] = React.useState(0);
  const [lb, setLb] = React.useState<number | null>(null);
  const g = galeria[i];
  return (
    <div className="py-6">
      <div className="mx-auto max-w-7xl px-5">
        <SectionTitle eyebrow="Galeria" title="Explore em tela cheia" />
      </div>
      <div className="relative h-[460px]">
        <img src={g.src} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/30 to-transparent" />
        <div className="absolute inset-y-0 left-0 flex max-w-md flex-col justify-center gap-3 px-8">
          <Pill tone="solid">{g.cat}</Pill>
          <h3 className="text-3xl font-bold">{g.titulo}</h3>
          <div className="text-sm text-muted-foreground">Foto {i + 1} de {galeria.length}</div>
          <div className="flex gap-2">
            <Btn size="sm" variant="outline" onClick={() => setI((i - 1 + galeria.length) % galeria.length)}>Anterior</Btn>
            <Btn size="sm" onClick={() => setI((i + 1) % galeria.length)}>Próxima</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setLb(i)}>Tela cheia</Btn>
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto px-5 pb-2">
        {galeria.map((f, k) => (
          <button key={f.titulo} onClick={() => setI(k)} className="shrink-0">
            <img src={f.src} alt="" className={cx("h-20 w-32 rounded-xl object-cover transition", k === i ? "scale-105 ring-2 ring-primary" : "opacity-50 hover:opacity-90")} />
          </button>
        ))}
      </div>
      <Lightbox fotos={galeria.map((x) => x.src)} index={lb} onIndex={setLb} onClose={() => setLb(null)} legenda={g.titulo} />
    </div>
  );
}
