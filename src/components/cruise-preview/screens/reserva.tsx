import * as React from "react";
import { Info, Anchor, Calendar, Users, ChevronRight, Check, Ship } from "lucide-react";
import { cabines, cruise, familias, brl, type Cabine } from "@/lib/cruise-preview/mock";
import { Btn, Pill, cx } from "../kit";
import {
  ResumoLateral, SeletorFamilia, CardCabine, BlocoPreferencias, BlocoSeguroAdicionais,
  RodapeAcoes, passageiros, taxasFixas,
} from "../booking/shared";
import { SobreModal } from "./sobre-cruzeiro";

function useReserva() {
  const [familia, setFamilia] = React.useState<string>("Interna");
  const lista = cabines.filter((c) => c.familia === familia);
  const [sel, setSel] = React.useState<Cabine>(cabines[0]);
  const [sobre, setSobre] = React.useState(false);
  const base = Math.min(...lista.map((c) => c.preco));
  React.useEffect(() => {
    if (!lista.some((c) => c.id === sel.id)) setSel(lista[0]);
  }, [familia]); // eslint-disable-line react-hooks/exhaustive-deps
  return { familia, setFamilia, lista, sel, setSel, base, sobre, setSobre };
}

function Trilha() {
  const passos = ["Cruzeiro", "Cabine", "Passageiros", "Pagamento"];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {passos.map((p, i) => (
        <React.Fragment key={p}>
          <span className={cx("inline-flex items-center gap-1.5 font-semibold", i <= 1 ? "text-primary" : "text-muted-foreground")}>
            <span className={cx("grid h-5 w-5 place-items-center rounded-full text-[10px]", i <= 1 ? "bg-primary text-primary-foreground" : "border border-border")}>
              {i < 1 ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {p}
          </span>
          {i < passos.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </React.Fragment>
      ))}
    </div>
  );
}

function BotaoSobre({ onClick, largo }: { onClick: () => void; largo?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "group flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/[0.07] px-4 py-3 text-left transition hover:bg-primary/[0.12]",
        largo && "w-full",
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Ship className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">Veja sobre o cruzeiro</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          Itinerário, navio, atrações, cabines, deck plan, fotos, vídeos e ficha técnica
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/* =============================================================== MODELO A == */

export function A() {
  const r = useReserva();
  return (
    <div className="relative">
      <div className="mx-auto max-w-7xl px-5 py-6">
        <Trilha />
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-7">
            <div>
              <h1 className="text-2xl font-bold">Escolha o tipo de cabine</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Cada tipo tem várias categorias — selecione um tipo para ver as opções disponíveis.
              </p>
              <div className="mt-4">
                <SeletorFamilia value={r.familia} onChange={r.setFamilia} />
              </div>
            </div>

            <BotaoSobre onClick={() => r.setSobre(true)} largo />

            <div>
              <h2 className="text-xl font-bold">Escolha a cabine</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {r.lista.length} categorias {r.familia.toLowerCase()}s disponíveis para {passageiros} hóspedes.
              </p>
              <div className="mt-4 space-y-3">
                {r.lista.map((c) => (
                  <CardCabine key={c.id} c={c} base={r.base} selecionada={r.sel.id === c.id} onSelect={() => r.setSel(c)} />
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold">Preferências da cabine</h2>
              <div className="mt-3"><BlocoPreferencias /></div>
            </div>

            <BlocoSeguroAdicionais />
            <RodapeAcoes />
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <ResumoLateral cabine={r.sel} onSobre={() => r.setSobre(true)} />
          </aside>
        </div>
      </div>
      <SobreModal open={r.sobre} onClose={() => r.setSobre(false)} variante="rail" />
    </div>
  );
}

/* =============================================================== MODELO B == */

export function B() {
  const r = useReserva();
  return (
    <div className="relative pb-24">
      <div className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-5 py-4">
          <img src={cruise.galeriaHero[0]} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{cruise.nome}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Ship className="h-3 w-3" /> {cruise.navio}</span>
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {cruise.noites} noites</span>
              <span className="inline-flex items-center gap-1"><Anchor className="h-3 w-3" /> {cruise.embarque}</span>
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {passageiros} hóspedes</span>
            </div>
          </div>
          <Btn variant="outline" size="sm" onClick={() => r.setSobre(true)}>
            <Info className="h-3.5 w-3.5" /> Veja sobre o cruzeiro
          </Btn>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-8 px-5 py-7">
        <section>
          <div className="mb-3 flex items-baseline gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>
            <h2 className="text-lg font-bold">Tipo de cabine</h2>
          </div>
          <SeletorFamilia value={r.familia} onChange={r.setFamilia} layout="linha" />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {familias.map((f) => (
              <div key={f} className={cx("rounded-xl border p-2 text-[11px]", r.familia === f ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground")}>
                <b className="block text-xs">{f}</b>
                a partir de {brl(Math.min(...cabines.filter((c) => c.familia === f).map((c) => c.preco)))}
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>
            <h2 className="text-lg font-bold">Escolha a cabine</h2>
          </div>
          <div className="space-y-3">
            {r.lista.map((c) => (
              <CardCabine key={c.id} c={c} base={r.base} selecionada={r.sel.id === c.id} onSelect={() => r.setSel(c)} onDetalhe={() => r.setSobre(true)} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>
            <h2 className="text-lg font-bold">Preferências, seguro e adicionais</h2>
          </div>
          <div className="space-y-5">
            <BlocoPreferencias />
            <BlocoSeguroAdicionais />
          </div>
        </section>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-xs text-muted-foreground">{r.sel.nome} • {passageiros} hóspedes • taxas {brl(taxasFixas)}</div>
            <div className="text-lg font-bold text-primary">{brl(r.sel.preco * passageiros + taxasFixas)}</div>
          </div>
          <div className="ml-auto flex gap-2">
            <Btn variant="outline" size="sm">Gerar orçamento</Btn>
            <Btn size="sm">Continuar</Btn>
          </div>
        </div>
      </div>

      <SobreModal open={r.sobre} onClose={() => r.setSobre(false)} variante="tabs" />
    </div>
  );
}

/* =============================================================== MODELO C == */

export function C() {
  const r = useReserva();
  return (
    <div className="relative">
      <div className="relative h-56 overflow-hidden">
        <img src={cruise.galeriaHero[1]} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-5 pb-5">
          <Pill tone="solid">{cruise.operadora}</Pill>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{cruise.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {cruise.navio} • {cruise.noites} noites • embarque em {cruise.embarque}
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <ResumoLateral cabine={r.sel} onSobre={() => r.setSobre(true)} />
          <BotaoSobre onClick={() => r.setSobre(true)} largo />
        </aside>

        <div className="space-y-7">
          <section>
            <h2 className="text-xl font-bold">Tipo de cabine</h2>
            <div className="mt-3"><SeletorFamilia value={r.familia} onChange={r.setFamilia} /></div>
          </section>

          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold">Categorias {r.familia.toLowerCase()}s</h2>
              <span className="text-xs text-muted-foreground">valores por {passageiros} hóspedes, taxas à parte</span>
            </div>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {r.lista.map((c) => (
                <div key={c.id} className={cx("overflow-hidden rounded-2xl border transition", r.sel.id === c.id ? "border-primary" : "border-border")}>
                  <div className="relative h-32">
                    <img src={c.fotos[0]} alt={c.nome} className="h-full w-full object-cover" />
                    <span className="absolute left-3 top-3 rounded-lg bg-background/85 px-2 py-1 text-[11px] font-bold backdrop-blur">
                      {c.area} • {c.ocupacao}
                    </span>
                    {r.sel.id === c.id && (
                      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground">
                        <Check className="h-3 w-3" /> Selecionada
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <h3 className="text-base font-bold">{c.nome}</h3>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{c.descricao}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {c.amenidades.slice(0, 3).map((a) => (
                        <span key={a} className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{a}</span>
                      ))}
                    </div>
                    <div className="flex items-end justify-between pt-1">
                      <div>
                        <div className="text-[11px] text-muted-foreground">por hóspede</div>
                        <div className="text-lg font-bold text-primary">{brl(c.preco)}</div>
                      </div>
                      <Btn size="sm" variant={r.sel.id === c.id ? "outline" : "primary"} onClick={() => r.setSel(c)}>
                        {r.sel.id === c.id ? "Selecionada" : "Selecionar"}
                      </Btn>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-5">
            <h2 className="text-xl font-bold">Preferências da cabine</h2>
            <BlocoPreferencias />
            <BlocoSeguroAdicionais />
            <RodapeAcoes />
          </section>
        </div>
      </div>

      <SobreModal open={r.sobre} onClose={() => r.setSobre(false)} variante="drawer" />
    </div>
  );
}
