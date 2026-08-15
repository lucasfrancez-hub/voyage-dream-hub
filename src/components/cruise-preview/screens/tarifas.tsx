import * as React from "react";
import { Check, X as XIcon, Info } from "lucide-react";
import { tarifas, ocupacoes, cabines, brl, brl2, familias } from "@/lib/cruise-preview/mock";
import { Btn, Card, Modal, Pill, SectionTitle, Tabs, cx } from "../kit";

const base = cabines.find((c) => c.id === "var-std")!;

/* MODELO A — Três planos lado a lado com destaque no recomendado. */
export function A() {
  const [ocup, setOcup] = React.useState(1);
  const [info, setInfo] = React.useState<string | null>(null);
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <SectionTitle eyebrow="Tarifas" title="Escolha a condição que faz sentido pra você" sub={`Valores para a cabine ${base.nome}.`} align="center" />
      <div className="mb-6 flex justify-center">
        <Tabs variant="segment" value={String(ocup)} onChange={(k) => setOcup(Number(k))}
          items={ocupacoes.map((o, i) => ({ key: String(i), label: o.label.split(" (")[0] }))} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {tarifas.map((t) => (
          <Card key={t.nome} className={cx("relative p-6", t.destaque && "border-primary/70 shadow-[0_20px_60px_-30px_var(--brand-orange)]")}>
            {t.destaque && <Pill tone="solid" className="absolute -top-3 left-1/2 -translate-x-1/2">Mais escolhida</Pill>}
            <div className="text-lg font-bold">{t.nome}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
            <div className="mt-4 text-3xl font-bold text-primary">{brl(Math.round(base.preco * t.multiplicador * ocupacoes[ocup].fator))}</div>
            <div className="text-xs text-muted-foreground">por pessoa + {brl(base.taxas)} de taxas</div>
            <div className="mt-4 space-y-2">
              {t.beneficios.map((b) => <div key={b} className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" />{b}</div>)}
              {t.multiplicador < 1 && <div className="flex gap-2 text-sm text-muted-foreground"><XIcon className="h-4 w-4" />Sem alteração de nome</div>}
            </div>
            <Btn className="mt-5 w-full" variant={t.destaque ? "primary" : "outline"}>Escolher {t.nome}</Btn>
            <button onClick={() => setInfo(t.nome)} className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Info className="h-3 w-3" />Regras completas</button>
          </Card>
        ))}
      </div>
      <Modal open={!!info} onClose={() => setInfo(null)}>
        <div className="p-6">
          <h3 className="text-xl font-bold">Regras — {info}</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {["Depósito de 20% no ato da reserva", "Saldo até 45 dias antes do embarque", "Documentação obrigatória: passaporte válido por 6 meses", "Taxas sujeitas a reajuste até a emissão"].map((r) => (
              <li key={r} className="flex gap-2"><Check className="h-4 w-4 text-primary" />{r}</li>))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}

/* MODELO B — Matriz cabine x tarifa (tabela comercial completa). */
export function B() {
  const [fam, setFam] = React.useState<string>("Varanda");
  const [sel, setSel] = React.useState<{ cab: string; tar: string } | null>(null);
  const lista = cabines.filter((c) => c.familia === fam);
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle eyebrow="Tarifas" title="Todos os valores em uma tela" sub="Preço por pessoa em ocupação dupla." />
        <Tabs variant="segment" value={fam} onChange={setFam} items={familias.map((f) => ({ key: f, label: f }))} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Cabine</th>
              {tarifas.map((t) => <th key={t.nome} className="px-5 py-3">{t.nome}</th>)}
              <th className="px-5 py-3">Taxas</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                <td className="px-5 py-3">
                  <div className="font-semibold">{c.nome}</div>
                  <div className="text-[11px] text-muted-foreground">{c.area} • {c.disponiveis} disp.</div>
                </td>
                {tarifas.map((t) => (
                  <td key={t.nome} className="px-5 py-3">
                    <button onClick={() => setSel({ cab: c.nome, tar: t.nome })}
                      className={cx("rounded-lg px-3 py-1.5 font-bold transition hover:bg-primary/15", t.destaque ? "text-primary" : "text-foreground")}>
                      {brl(Math.round(c.preco * t.multiplicador))}
                    </button>
                  </td>
                ))}
                <td className="px-5 py-3 text-muted-foreground">{brl(c.taxas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Modal open={!!sel} onClose={() => setSel(null)}>
        {sel && (
          <div className="p-6">
            <Pill tone="solid">{sel.tar}</Pill>
            <h3 className="mt-3 text-xl font-bold">{sel.cab}</h3>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Pix (5% off)</span><b className="text-primary">{brl2(base.preco * 0.95)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cartão 10x</span><b>{brl2(base.preco / 10)}/mês</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Boleto</span><b>Sujeito à antecedência</b></div>
            </div>
            <Btn className="mt-5 w-full">Reservar nesta condição</Btn>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* MODELO C — Simulador: sliders/steppers com total em tempo real. */
export function C() {
  const [pax, setPax] = React.useState(2);
  const [cab, setCab] = React.useState(base.id);
  const [tar, setTar] = React.useState(1);
  const [pgto, setPgto] = React.useState<"pix" | "cartao" | "boleto">("pix");
  const c = cabines.find((x) => x.id === cab)!;
  const fator = ocupacoes[Math.min(pax - 1, ocupacoes.length - 1)].fator;
  const porPessoa = Math.round(c.preco * fator * tarifas[tar].multiplicador);
  const subtotal = porPessoa * pax + c.taxas * pax;
  const total = pgto === "pix" ? subtotal * 0.95 : subtotal;
  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <SectionTitle eyebrow="Tarifas" title="Simule o valor da sua viagem" />
      <div className="grid gap-5 md:grid-cols-[1fr_320px]">
        <Card className="space-y-6 p-6">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Hóspedes</div>
            <div className="mt-2 flex items-center gap-3">
              <button onClick={() => setPax(Math.max(1, pax - 1))} className="h-9 w-9 rounded-full border border-border text-lg">−</button>
              <b className="w-8 text-center text-xl">{pax}</b>
              <button onClick={() => setPax(Math.min(4, pax + 1))} className="h-9 w-9 rounded-full border border-border text-lg">+</button>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Cabine</div>
            <select value={cab} onChange={(e) => setCab(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-input/40 px-4 py-2.5 text-sm">
              {cabines.map((x) => <option key={x.id} value={x.id}>{x.familia} • {x.nome}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Tarifa</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {tarifas.map((t, i) => (
                <button key={t.nome} onClick={() => setTar(i)}
                  className={cx("rounded-xl border p-3 text-left text-xs transition", tar === i ? "border-primary bg-primary/10" : "border-border")}>
                  <b className="block text-sm">{t.nome}</b>{t.desc.slice(0, 42)}…
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Forma de pagamento</div>
            <div className="mt-2 flex gap-2">
              {(["pix", "cartao", "boleto"] as const).map((p) => (
                <Pill key={p} active={pgto === p} onClick={() => setPgto(p)}>{p === "pix" ? "Pix (-5%)" : p === "cartao" ? "Cartão 10x" : "Boleto"}</Pill>
              ))}
            </div>
          </div>
        </Card>
        <div className="md:sticky md:top-20 md:self-start">
          <Card className="p-5">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Total estimado</div>
            <div className="text-3xl font-bold text-primary">{brl2(total)}</div>
            <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Por pessoa</span><b>{brl(porPessoa)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Taxas ({pax}x)</span><b>{brl(c.taxas * pax)}</b></div>
              {pgto === "pix" && <div className="flex justify-between text-primary"><span>Desconto Pix</span><b>−{brl2(subtotal * 0.05)}</b></div>}
              {pgto === "cartao" && <div className="flex justify-between"><span className="text-muted-foreground">10x de</span><b>{brl2(total / 10)}</b></div>}
            </div>
            <Btn className="mt-4 w-full">Reservar agora</Btn>
          </Card>
        </div>
      </div>
    </div>
  );
}
