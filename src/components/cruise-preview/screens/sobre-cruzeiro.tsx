import * as React from "react";
import { ChevronRight, Ship } from "lucide-react";
import { cruise } from "@/lib/cruise-preview/mock";
import { Modal, Tabs, cx, Pill, Btn } from "../kit";
import { ConteudoSobre, secoesSobre, type SecaoKey } from "../booking/shared";

/* ------------------------------------------------------------- modal ------ */

export function SobreModal({
  open,
  onClose,
  variante = "rail",
  inicial = "itinerario",
}: {
  open: boolean;
  onClose: () => void;
  variante?: "rail" | "tabs" | "drawer";
  inicial?: SecaoKey;
}) {
  const [secao, setSecao] = React.useState<SecaoKey>(inicial);

  if (variante === "tabs") {
    return (
      <Modal open={open} onClose={onClose} wide>
        <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-6 pb-3 pt-6 backdrop-blur">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Sobre o cruzeiro</div>
          <h2 className="text-xl font-bold">{cruise.nome}</h2>
          <div className="mt-3">
            <Tabs
              variant="underline"
              value={secao}
              onChange={(k) => setSecao(k as SecaoKey)}
              items={secoesSobre.map((s) => ({ key: s.key, label: s.label }))}
            />
          </div>
        </div>
        <div className="p-6"><ConteudoSobre secao={secao} /></div>
      </Modal>
    );
  }

  if (variante === "drawer") {
    return (
      <Modal open={open} onClose={onClose} side="right">
        <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Sobre o cruzeiro</div>
          <h2 className="text-lg font-bold">{cruise.navio}</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {secoesSobre.map((s) => (
              <Pill key={s.key} active={secao === s.key} onClick={() => setSecao(s.key)}>
                <s.icon className="h-3 w-3" /> {s.label}
              </Pill>
            ))}
          </div>
        </div>
        <div className="p-5"><ConteudoSobre secao={secao} /></div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} wide>
      <div className="grid sm:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="border-b border-border bg-accent/20 p-3 sm:border-b-0 sm:border-r">
          <div className="mb-3 hidden items-center gap-2 px-2 sm:flex">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground"><Ship className="h-4 w-4" /></span>
            <div className="min-w-0">
              <div className="truncate text-xs font-bold">{cruise.navio}</div>
              <div className="text-[10px] text-muted-foreground">{cruise.noites} noites</div>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto sm:block sm:space-y-1 sm:overflow-visible">
            {secoesSobre.map((s) => (
              <button
                key={s.key}
                onClick={() => setSecao(s.key)}
                className={cx(
                  "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition sm:w-full",
                  secao === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="max-h-[76vh] overflow-y-auto p-5">
          <h2 className="mb-4 text-xl font-bold">{secoesSobre.find((s) => s.key === secao)!.label}</h2>
          <ConteudoSobre secao={secao} />
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ telas ------- */

function Fundo({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[720px]">
      <div className="pointer-events-none select-none opacity-50 blur-[1px]">
        <div className="relative h-48 overflow-hidden">
          <img src={cruise.galeriaHero[0]} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>
        <div className="mx-auto max-w-7xl space-y-3 px-5 py-6">
          <div className="h-6 w-64 rounded bg-muted" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted" />)}
          </div>
          <div className="h-28 rounded-2xl bg-muted" />
          <div className="h-28 rounded-2xl bg-muted" />
        </div>
      </div>
      {children}
    </div>
  );
}

function Tela({ variante }: { variante: "rail" | "tabs" | "drawer" }) {
  const [open, setOpen] = React.useState(true);
  return (
    <Fundo>
      {!open && (
        <div className="absolute inset-x-0 top-24 z-40 flex justify-center">
          <Btn onClick={() => setOpen(true)}>
            Veja sobre o cruzeiro <ChevronRight className="h-4 w-4" />
          </Btn>
        </div>
      )}
      <SobreModal open={open} onClose={() => setOpen(false)} variante={variante} />
    </Fundo>
  );
}

export function A() {
  return <Tela variante="rail" />;
}
export function B() {
  return <Tela variante="tabs" />;
}
export function C() {
  return <Tela variante="drawer" />;
}
