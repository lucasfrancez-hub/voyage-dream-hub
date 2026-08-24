import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CidadeAutocompleteCF } from "@/components/comprefacil/CidadeAutocompleteCF";
import { encodeQuartos } from "@/lib/pacote-motor/preset";

type Quarto = { adultos: number; criancas: number; bebes: number };

const novoQuarto = (): Quarto => ({ adultos: 2, criancas: 0, bebes: 0 });

function NumeroField({
  label,
  value,
  onChange,
  max = 9,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 w-full rounded-xl border border-border bg-background/60 px-3 text-sm font-semibold text-foreground outline-none transition focus:border-brand-orange"
      >
        {Array.from({ length: max + 1 }, (_, i) => i).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MotorPacotePersonalizado() {
  const [aberto, setAberto] = useState(false);
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [ida, setIda] = useState("");
  const [volta, setVolta] = useState("");
  const [quartos, setQuartos] = useState<Quarto[]>([novoQuarto()]);

  const totalPax = useMemo(
    () => quartos.reduce((s, q) => s + q.adultos + q.criancas + q.bebes, 0),
    [quartos],
  );

  function setQtdQuartos(qtd: number) {
    setQuartos((prev) => {
      const next = [...prev];
      while (next.length < qtd) next.push(novoQuarto());
      return next.slice(0, qtd);
    });
  }

  function atualizarQuarto(i: number, patch: Partial<Quarto>) {
    setQuartos((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  const mensagem = useMemo(() => {
    const fmt = (d: string) => (d ? d.split("-").reverse().join("/") : "a definir");
    const ocupacao = quartos
      .map(
        (q, i) =>
          `Quarto ${i + 1}: ${q.adultos} adulto(s)` +
          (q.criancas ? `, ${q.criancas} criança(s)` : "") +
          (q.bebes ? `, ${q.bebes} bebê(s)` : ""),
      )
      .join(" | ");
    return [
      "Olá! Quero montar um pacote personalizado:",
      `Origem: ${origem || "a definir"}`,
      `Destino: ${destino || "a definir"}`,
      `Ida: ${fmt(ida)} • Volta: ${fmt(volta)}`,
      ocupacao,
    ].join("\n");
  }, [origem, destino, ida, volta, quartos]);

  return (
    <div className="mt-8">
      <div className="flex flex-col items-start justify-between gap-4 rounded-[18px] border border-border bg-card/70 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <strong className="block text-[15px] font-extrabold tracking-tight text-foreground">
            Não achou seu pacote?
          </strong>
          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
            Monte uma opção personalizada com as datas e o destino que você quiser.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="h-[39px] w-full shrink-0 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-4 text-[10px] font-black uppercase tracking-wide text-brand-orange transition hover:bg-brand-orange hover:text-white sm:w-auto"
        >
          {aberto ? "Fechar" : "Monte personalizado"}
        </button>
      </div>

      {aberto && (
        <div className="mt-4 rounded-[22px] border border-border bg-card/70 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-orange">
                Pacote personalizado
              </span>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
                Monte sua viagem do seu jeito
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Informe origem, destino, datas e ocupação para pesquisar aéreo + hospedagem.
              </p>
            </div>
            <span className="rounded-full border border-brand-orange/30 bg-brand-orange/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-brand-orange">
              Pacote de viagens
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Origem
              </span>
              <input
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder="Cidade de saída"
                className="h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-orange"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Destino
              </span>
              <input
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Para onde vamos?"
                className="h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-orange"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Ida
              </span>
              <input
                type="date"
                value={ida}
                onChange={(e) => setIda(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-sm text-foreground outline-none transition focus:border-brand-orange"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Volta
              </span>
              <input
                type="date"
                value={volta}
                min={ida || undefined}
                onChange={(e) => setVolta(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-sm text-foreground outline-none transition focus:border-brand-orange"
              />
            </label>
            <a
              href={whatsappUrl(mensagem)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center justify-center self-end rounded-xl bg-brand-orange px-5 text-sm font-bold text-white transition hover:brightness-110 active:scale-[.98]"
            >
              Buscar pacotes
            </a>
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="block w-40">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Quartos
                </span>
                <select
                  value={quartos.length}
                  onChange={(e) => setQtdQuartos(Number(e.target.value))}
                  className="h-10 w-full rounded-xl border border-border bg-background/60 px-3 text-sm font-semibold text-foreground outline-none transition focus:border-brand-orange"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "quarto" : "quartos"}
                    </option>
                  ))}
                </select>
              </label>
              <span className="pb-2 text-xs text-muted-foreground">
                {totalPax} {totalPax === 1 ? "passageiro" : "passageiros"} ·{" "}
                {quartos.length} {quartos.length === 1 ? "quarto" : "quartos"}
              </span>
            </div>

            <div className="mt-3 space-y-3">
              {quartos.map((q, i) => (
                <div
                  key={i}
                  className="grid grid-cols-3 items-end gap-3 rounded-xl border border-border/70 bg-card/50 p-3 sm:grid-cols-4"
                >
                  <div className="col-span-3 text-xs font-bold text-foreground sm:col-span-1">
                    Quarto {i + 1}
                    <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                      Distribuição dos hóspedes
                    </span>
                  </div>
                  <NumeroField
                    label="Adultos"
                    value={q.adultos}
                    onChange={(v) => atualizarQuarto(i, { adultos: Math.max(1, v) })}
                  />
                  <NumeroField
                    label="Crianças"
                    value={q.criancas}
                    onChange={(v) => atualizarQuarto(i, { criancas: v })}
                  />
                  <NumeroField
                    label="Bebês"
                    value={q.bebes}
                    onChange={(v) => atualizarQuarto(i, { bebes: v })}
                  />
                </div>
              ))}
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Busca completa: ao pesquisar, um consultor VIA AIR recebe seus dados já preenchidos e
            retorna com as opções de aéreo + hospedagem.
          </p>
        </div>
      )}
    </div>
  );
}
