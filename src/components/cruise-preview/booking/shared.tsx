import * as React from "react";
import {
  Anchor, Ship, Sparkles, BedDouble, Layers, Images, PlayCircle, FileText,
  MapPin, Clock, Check, Info, Users, Calendar, Utensils, Wifi, Crown, Star,
} from "lucide-react";
import {
  cruise, cabines, familias, itinerario, atracoes, decks, galeria, videos, fichaTecnica, brl,
  type Cabine,
} from "@/lib/cruise-preview/mock";
import { cx, Btn, Pill } from "../kit";

/* ---------------------------------------------------------------- dados ---- */

/** Itens inclusos por categoria (chips que o cliente vê no card da cabine). */
export function inclusos(c: Cabine): { icon: React.ElementType; label: string }[] {
  const base: { icon: React.ElementType; label: string }[] = [
    { icon: Utensils, label: "Refeições" },
    c.nome.toLowerCase().includes("garantida")
      ? { icon: Info, label: "Não escolhe cabine" }
      : { icon: MapPin, label: "Cabine melhor localizada" },
  ];
  if (c.familia === "Suíte") base.unshift({ icon: Crown, label: "Pacote All Inclusive" }, { icon: Star, label: "Embarque prioritário" });
  if (c.nome.includes("Aurea")) base.unshift({ icon: Crown, label: "All Inclusive" }, { icon: Wifi, label: "Wi-Fi ilimitado" });
  return base;
}

export const familiaFoto: Record<string, string> = Object.fromEntries(
  familias.map((f) => [f, cabines.find((c) => c.familia === f)!.fotos[0]]),
);

export const passageiros = 2;
export const taxasFixas = 1800;

export function totalDe(c: Cabine) {
  return c.preco * passageiros + taxasFixas;
}

/* ------------------------------------------------------------- resumo ------ */

export function ResumoLateral({
  cabine,
  compacto,
  onSobre,
}: {
  cabine: Cabine;
  compacto?: boolean;
  onSobre?: () => void;
}) {
  const passagem = cabine.preco * passageiros;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
          <Sparkles className="h-3 w-3" /> Promoção
        </span>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {cruise.noites} noites <span className="opacity-40">•</span> {cruise.saida.replace(" de outubro de ", "/10/")}
          <span className="opacity-40">•</span>
          <Users className="h-3.5 w-3.5" /> {passageiros}
          <button className="ml-auto text-primary underline-offset-2 hover:underline">Editar</button>
        </div>
        <h3 className="mt-2 text-xl font-bold leading-snug">{cruise.nome}</h3>
        {onSobre && (
          <button
            onClick={onSobre}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            <Info className="h-4 w-4" /> Veja sobre o cruzeiro
          </button>
        )}
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><Anchor className="h-3.5 w-3.5 text-primary" /> Embarque: {cruise.embarque}</div>
          <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" /> Chegada: {cruise.desembarque}</div>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Melhores promoções</div>
        <div className="mt-1 text-sm font-bold">{cabine.nome}</div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Passageiros ({passageiros})</dt><dd>{brl(passagem)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Taxas e impostos</dt><dd>{brl(taxasFixas)}</dd></div>
          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <dt className="font-semibold">Preço total</dt>
            <dd className="text-lg font-bold text-primary">{brl(passagem + taxasFixas)}</dd>
          </div>
        </dl>
        <p className="mt-1 text-right text-xs text-muted-foreground">
          Entrada + 10x <b className="text-foreground">sem juros</b>
        </p>
        {!compacto && (
          <div className="mt-4 grid gap-2">
            <Btn className="w-full">Incluir no orçamento</Btn>
            <Btn variant="outline" className="w-full">Falar com consultor</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------- seletor de família ------ */

export function SeletorFamilia({
  value,
  onChange,
  layout = "cards",
}: {
  value: string;
  onChange: (f: string) => void;
  layout?: "cards" | "linha";
}) {
  if (layout === "linha") {
    return (
      <div className="flex flex-wrap gap-2">
        {familias.map((f) => (
          <Pill key={f} active={value === f} onClick={() => onChange(f)}>
            {f}
            <span className="opacity-60">({cabines.filter((c) => c.familia === f).length})</span>
          </Pill>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {familias.map((f) => {
        const ativo = value === f;
        const desde = Math.min(...cabines.filter((c) => c.familia === f).map((c) => c.preco));
        return (
          <button
            key={f}
            onClick={() => onChange(f)}
            className={cx(
              "group overflow-hidden rounded-2xl border text-left transition-all",
              ativo ? "border-primary shadow-[0_10px_30px_-16px_var(--brand-orange)]" : "border-border hover:border-primary/50",
            )}
          >
            <div className="relative h-24 overflow-hidden">
              <img src={familiaFoto[f]} alt={f} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              {ativo && (
                <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <div className={cx("flex items-center justify-between gap-2 px-3 py-2", ativo && "bg-primary/10")}>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{f}</div>
                <div className="text-[11px] text-muted-foreground">a partir de {brl(desde)}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------- card de cabine ------- */

export function CardCabine({
  c,
  selecionada,
  base,
  onSelect,
  onDetalhe,
}: {
  c: Cabine;
  selecionada: boolean;
  base: number;
  onSelect: () => void;
  onDetalhe?: () => void;
}) {
  const upgrade = (c.preco - base) * passageiros;
  const chips = inclusos(c);
  return (
    <div
      className={cx(
        "grid gap-4 rounded-2xl border p-4 transition-all sm:grid-cols-[150px_minmax(0,1fr)_170px]",
        selecionada ? "border-primary bg-primary/[0.06]" : "border-border bg-card/60 hover:border-primary/40",
      )}
    >
      <button onClick={onDetalhe} className="overflow-hidden rounded-xl">
        <img src={c.fotos[0]} alt={c.nome} className="h-28 w-full object-cover sm:h-full" />
      </button>

      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">Categorias: {c.decks.replace(/, /g, ", ")}</div>
        <h4 className="text-base font-bold">{c.nome}</h4>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{c.area} • {c.ocupacao}</div>
        <div className="mt-2 text-[11px] font-semibold text-muted-foreground">Itens inclusos</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {chips.map(({ icon: I, label }) => (
            <span key={label} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/60 px-2 py-1 text-[11px] text-muted-foreground">
              <I className="h-3 w-3 text-primary" /> {label}
            </span>
          ))}
          <button onClick={onDetalhe} className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-primary">
            Ver inclusos
          </button>
        </div>
      </div>

      <div className="flex flex-col items-stretch justify-center gap-2 sm:items-end">
        {selecionada ? (
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary"><Check className="h-5 w-5" /></span>
            <span className="text-sm font-bold text-primary">Selecionado</span>
          </div>
        ) : (
          <>
            <div className="text-center sm:text-right">
              <div className="text-[11px] text-muted-foreground">{upgrade > 0 ? "Upgrade por" : "Economize"}</div>
              <div className="text-lg font-bold">{brl(Math.abs(upgrade))}</div>
            </div>
            <Btn onClick={onSelect} className="w-full sm:w-auto">Selecionar</Btn>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------- conteúdo "sobre o cruzeiro" ------ */

export const secoesSobre = [
  { key: "itinerario", label: "Itinerário", icon: MapPin },
  { key: "navio", label: "Navio", icon: Ship },
  { key: "atracoes", label: "Atrações", icon: Sparkles },
  { key: "cabines", label: "Cabines", icon: BedDouble },
  { key: "deck", label: "Deck plan", icon: Layers },
  { key: "fotos", label: "Fotos", icon: Images },
  { key: "videos", label: "Vídeos", icon: PlayCircle },
  { key: "ficha", label: "Ficha técnica", icon: FileText },
] as const;

export type SecaoKey = (typeof secoesSobre)[number]["key"];

export function ConteudoSobre({ secao }: { secao: SecaoKey }) {
  if (secao === "itinerario") {
    return (
      <div className="space-y-3">
        {itinerario.map((p) => (
          <div key={p.dia} className="grid gap-3 rounded-2xl border border-border bg-card/50 p-3 sm:grid-cols-[130px_minmax(0,1fr)]">
            <img src={p.foto} alt={p.porto} className="h-24 w-full rounded-xl object-cover" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">Dia {p.dia}</span>
                <b className="text-sm">{p.porto}</b>
                <span className="text-xs text-muted-foreground">{p.pais} • {p.data}</span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Chegada {p.chegada}</span>
                <span className="inline-flex items-center gap-1"><Anchor className="h-3 w-3" /> Saída {p.saida}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{p.descricao}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (secao === "navio") {
    return (
      <div className="space-y-4">
        <img src={cruise.galeriaHero[0]} alt={cruise.navio} className="h-56 w-full rounded-2xl object-cover" />
        <div>
          <h4 className="text-lg font-bold">{cruise.navio}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{cruise.resumo}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Hóspedes", "5.331"], ["Cabines", "2.066"], ["Decks", "18"], ["Restaurantes", "11"]].map(([l, v]) => (
            <div key={l} className="rounded-xl border border-border bg-card/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{l}</div>
              <div className="text-sm font-bold">{v}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (secao === "atracoes") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {atracoes.map((a) => (
          <div key={a.nome} className="overflow-hidden rounded-2xl border border-border bg-card/50">
            <img src={a.foto} alt={a.nome} className="h-28 w-full object-cover" />
            <div className="p-3">
              <div className="flex items-center gap-2">
                <b className="text-sm">{a.nome}</b>
                <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-bold", a.incluso ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                  {a.incluso ? "Incluso" : "Pago à parte"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{a.desc}</p>
              <div className="mt-1 text-[11px] text-muted-foreground">Deck {a.deck} • {a.horario}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (secao === "cabines") {
    return (
      <div className="space-y-4">
        {familias.map((f) => (
          <div key={f}>
            <div className="mb-2 text-sm font-bold text-primary">{f}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {cabines.filter((c) => c.familia === f).map((c) => (
                <div key={c.id} className="flex gap-3 rounded-xl border border-border bg-card/50 p-2">
                  <img src={c.fotos[0]} alt={c.nome} className="h-16 w-24 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <b className="block truncate text-sm">{c.nome}</b>
                    <div className="text-[11px] text-muted-foreground">{c.area} • {c.ocupacao}</div>
                    <div className="text-[11px] font-semibold text-primary">a partir de {brl(c.preco)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (secao === "deck") {
    return (
      <div className="space-y-3">
        {decks.map((d) => (
          <div key={d.numero} className="overflow-hidden rounded-2xl border border-border bg-card/50">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-xs font-bold text-primary">{d.numero}</span>
              <b className="text-sm">{d.nome}</b>
              <span className="text-[11px] text-muted-foreground">{d.cabines} cabines</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{d.destaques.join(" • ")}</span>
            </div>
            <img src={d.mapa} alt={d.nome} className="h-28 w-full object-cover" />
          </div>
        ))}
      </div>
    );
  }
  if (secao === "fotos") {
    return (
      <div className="columns-2 gap-2 sm:columns-3">
        {galeria.map((g) => (
          <figure key={g.titulo} className="mb-2 break-inside-avoid overflow-hidden rounded-xl border border-border">
            <img src={g.src} alt={g.titulo} className="w-full object-cover" />
            <figcaption className="bg-card/70 px-2 py-1 text-[11px] text-muted-foreground">{g.titulo}</figcaption>
          </figure>
        ))}
      </div>
    );
  }
  if (secao === "videos") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {videos.map((v) => (
          <div key={v.titulo} className="overflow-hidden rounded-2xl border border-border bg-card/50">
            <div className="relative">
              <img src={v.thumb} alt={v.titulo} className="h-32 w-full object-cover" />
              <span className="absolute inset-0 grid place-items-center"><PlayCircle className="h-10 w-10 text-primary-foreground drop-shadow" /></span>
              <span className="absolute bottom-2 right-2 rounded bg-background/80 px-1.5 py-0.5 text-[11px]">{v.dur}</span>
            </div>
            <div className="p-3">
              <b className="text-sm">{v.titulo}</b>
              <p className="mt-1 text-xs text-muted-foreground">{v.desc}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fichaTecnica.map((g) => (
        <div key={g.grupo} className="rounded-2xl border border-border bg-card/50 p-3">
          <div className="mb-2 text-sm font-bold text-primary">{g.grupo}</div>
          <dl className="space-y-1.5 text-sm">
            {g.itens.map(([l, v]) => (
              <div key={l} className="flex justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0">
                <dt className="text-muted-foreground">{l}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------ blocos do checkout ------- */

export function BlocoPreferencias() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { t: "Cabine", s: "Escolha a localização no deck" },
        { t: "Descontos", s: "Aplique seu cupom" },
      ].map((p) => (
        <button key={p.t} className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 px-4 py-3 text-left transition hover:border-primary/50">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Layers className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">{p.t}</span>
            <span className="block truncate text-xs text-muted-foreground">{p.s}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function BlocoSeguroAdicionais() {
  const [seguro, setSeguro] = React.useState(false);
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-lg font-bold">Seguro</h3>
          <button className="text-xs font-semibold text-primary underline-offset-2 hover:underline">ver cobertura</button>
        </div>
        <label className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-card/50 px-4 py-3">
          <span className="min-w-0 flex-1 text-sm text-muted-foreground">
            Incluir <b className="text-foreground">Seguro Viagem Cruzeiros</b> por <b className="text-foreground">{brl(179)}</b> por pessoa
          </span>
          <button
            onClick={() => setSeguro((s) => !s)}
            className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", seguro ? "bg-primary" : "bg-muted")}
          >
            <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all", seguro ? "left-[22px]" : "left-0.5")} />
          </button>
        </label>
      </div>
      <div>
        <h3 className="text-lg font-bold">Adicionais</h3>
        <Btn variant="outline" size="sm" className="mt-2">+ Novo adicional</Btn>
      </div>
    </div>
  );
}

export function RodapeAcoes() {
  return (
    <div className="flex flex-wrap justify-end gap-3">
      <Btn variant="outline">Gerar orçamento</Btn>
      <Btn>Confirmar e continuar</Btn>
    </div>
  );
}
