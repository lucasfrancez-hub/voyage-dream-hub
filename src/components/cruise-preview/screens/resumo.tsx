import * as React from "react";
import { Check, Users, Ship, Calendar, ChevronDown } from "lucide-react";
import { resumoComercial as R, cruise, brl2, brl, img } from "@/lib/cruise-preview/mock";
import { Btn, Card, Modal, Pill, SectionTitle, cx } from "../kit";

const subtotal = R.itens.reduce((s, i) => s + i.valor, 0);
const total = subtotal - R.desconto;

/* MODELO A — Recibo/orçamento formal, pronto para imprimir ou enviar. */
export function A() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-accent/30 px-6 py-5">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-primary">Resumo comercial</div>
            <div className="text-xl font-bold">{cruise.nome}</div>
          </div>
          <Pill className="ml-auto">Orçamento #CRZ-4821</Pill>
        </div>
        <div className="grid grid-cols-2 gap-4 border-b border-border px-6 py-5 text-sm sm:grid-cols-4">
          <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Navio</div><b>{cruise.navio}</b></div>
          <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Saída</div><b>{cruise.saida}</b></div>
          <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Cabine</div><b>{R.cabine}</b></div>
          <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Passageiros</div><b>{R.passageiros}</b></div>
        </div>
        <div className="px-6 py-5">
          {R.itens.map((i) => (
            <div key={i.label} className="flex justify-between border-b border-border py-2.5 text-sm last:border-0">
              <span className="text-muted-foreground">{i.label}</span><b>{brl2(i.valor)}</b>
            </div>
          ))}
          <div className="mt-3 flex justify-between text-sm text-primary"><span>Desconto negociado</span><b>−{brl2(R.desconto)}</b></div>
          <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">Total</span>
            <div className="text-right"><div className="text-3xl font-bold text-primary">{brl2(total)}</div>
              <div className="text-[11px] text-muted-foreground">ou {brl2(total * 0.95)} no Pix</div></div>
          </div>
          <div className="mt-5 flex gap-2">
            <Btn className="flex-1">Aceitar orçamento</Btn>
            <Btn variant="outline" onClick={() => setOpen(true)}>Condições</Btn>
          </div>
        </div>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="p-6">
          <h3 className="text-xl font-bold">Condições de pagamento</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {["Pix com 5% de desconto sobre o total", "Cartão de crédito em até 10x sem juros", "Boleto conforme antecedência da viagem", "Valores sujeitos a confirmação de disponibilidade"].map((x) => (
              <li key={x} className="flex gap-2"><Check className="h-4 w-4 text-primary" />{x}</li>))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}

/* MODELO B — Checkout em duas colunas com itens editáveis. */
export function B() {
  const [itens, setItens] = React.useState(R.itens.map((i, k) => ({ ...i, on: k < 3 || k === 3 })));
  const sub = itens.filter((i) => i.on).reduce((s, i) => s + i.valor, 0);
  const tot = sub - R.desconto;
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <SectionTitle eyebrow="Resumo comercial" title="Revise sua reserva" />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <Card className="flex gap-4 p-4">
            <img src={img("resumo-cab")} alt="" className="h-24 w-32 rounded-xl object-cover" />
            <div>
              <div className="font-bold">{cruise.nome}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                <Pill><Ship className="h-3 w-3" />{cruise.navio}</Pill>
                <Pill><Calendar className="h-3 w-3" />{cruise.saida}</Pill>
                <Pill><Users className="h-3 w-3" />{R.passageiros} pax</Pill>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{R.cabine} • {R.tarifa}</div>
            </div>
          </Card>
          {itens.map((i, k) => (
            <Card key={i.label} className={cx("flex items-center gap-3 p-4", !i.on && "opacity-50")}>
              <input type="checkbox" checked={i.on} disabled={k < 2}
                onChange={() => setItens((p) => p.map((x, j) => (j === k ? { ...x, on: !x.on } : x)))}
                className="accent-[var(--brand-orange)]" />
              <div className="text-sm">{i.label}{k < 2 && <span className="ml-2 text-[10px] uppercase text-muted-foreground">obrigatório</span>}</div>
              <b className="ml-auto">{brl2(i.valor)}</b>
            </Card>
          ))}
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><b>{brl2(sub)}</b></div>
              <div className="flex justify-between text-primary"><span>Desconto</span><b>−{brl2(R.desconto)}</b></div>
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Total</div>
              <div className="text-3xl font-bold text-primary">{brl2(tot)}</div>
              <div className="text-xs text-muted-foreground">10x de {brl2(tot / 10)} sem juros</div>
            </div>
            <Btn className="mt-4 w-full">Ir para pagamento</Btn>
            <Btn variant="outline" className="mt-2 w-full">Enviar por WhatsApp</Btn>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* MODELO C — Cartão de proposta premium com abertura progressiva. */
export function C() {
  const [det, setDet] = React.useState(false);
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Card className="overflow-hidden">
        <div className="relative h-48">
          <img src={cruise.galeriaHero[1]} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
          <div className="absolute bottom-4 left-6">
            <Pill tone="solid">Proposta exclusiva</Pill>
            <div className="mt-1 text-2xl font-bold">{cruise.nome}</div>
          </div>
        </div>
        <div className="p-6 text-center">
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Investimento total</div>
          <div className="text-5xl font-bold text-primary">{brl2(total)}</div>
          <div className="mt-1 text-sm text-muted-foreground">{R.passageiros} passageiros • {R.cabine}</div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {[["Pix", `${brl(Math.round(total * 0.95))}`, "5% de desconto"], ["Cartão", `${brl(Math.round(total / 10))}`, "10x sem juros"], ["Boleto", "Sob análise", "conforme prazo"]].map(([t, v, s]) => (
              <div key={t} className="rounded-2xl border border-border p-4">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{t}</div>
                <div className="text-lg font-bold">{v}</div><div className="text-[11px] text-muted-foreground">{s}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setDet(!det)} className="mx-auto mt-5 flex items-center gap-1 text-xs font-semibold text-primary">
            {det ? "Ocultar" : "Ver"} composição do valor <ChevronDown className={cx("h-3.5 w-3.5 transition", det && "rotate-180")} />
          </button>
          {det && (
            <div className="mt-4 text-left">
              {R.itens.map((i) => (
                <div key={i.label} className="flex justify-between border-b border-border py-2 text-sm">
                  <span className="text-muted-foreground">{i.label}</span><b>{brl2(i.valor)}</b></div>
              ))}
              <div className="flex justify-between py-2 text-sm text-primary"><span>Desconto</span><b>−{brl2(R.desconto)}</b></div>
            </div>
          )}
          <Btn size="lg" className="mt-6 w-full">Quero fechar esta viagem</Btn>
        </div>
      </Card>
    </div>
  );
}
