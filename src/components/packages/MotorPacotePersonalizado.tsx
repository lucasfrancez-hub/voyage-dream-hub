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
  const navigate = useNavigate();
  const [origem, setOrigem] = useState("");
  const [origemIata, setOrigemIata] = useState("");
  const [destino, setDestino] = useState("");
  const [destinoIata, setDestinoIata] = useState("");
  const [cidadeId, setCidadeId] = useState<number | null>(null);
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

  const podeBuscar = Boolean(destino.trim() && ida);

  /** Leva para a busca completa (aéreo, hotel, carro, pacotes) já na aba Pacotes. */
  function pesquisar() {
    if (!podeBuscar) return;
    navigate({
      to: "/voar",
      search: {
        m: "combo" as const,
        o: origemIata || undefined,
        d: destinoIata || undefined,
        pon: origem || undefined,
        pdn: destino || undefined,
        cid: cidadeId ?? undefined,
        ida,
        volta: volta || undefined,
        q: encodeQuartos(
          quartos.map((x) => ({ ...x, idades: Array.from({ length: x.criancas }, () => 7) })),
        ),
      },
    });
  }

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
        <div className="mpp-card mt-4 overflow-hidden rounded-[24px] border border-white/10">
          <div className="mpp-head flex flex-wrap items-start justify-between gap-3 px-5 py-5 md:px-6">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-orange">
                Pacote personalizado
              </span>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white">
                Monte sua viagem do seu jeito
              </h2>
              <p className="mt-1 text-sm text-white/60">
                Informe origem, destino, datas e ocupação para pesquisar aéreo + hospedagem.
              </p>
            </div>
            <span className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-brand-orange backdrop-blur">
              Pacote de viagens
            </span>
          </div>

          <div className="px-5 pb-6 md:px-6">


          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Origem
              </span>
              <CidadeAutocompleteCF
                publico
                campo="saida"
                valor={origem}
                placeholder="Cidade de saída"
                onChange={(nome, _id, iata) => {
                  setOrigem(nome);
                  setOrigemIata(iata ?? "");
                }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Destino
              </span>
              <CidadeAutocompleteCF
                publico
                campo="destino"
                valor={destino}
                placeholder="Para onde vamos?"
                onChange={(nome, id, iata) => {
                  setDestino(nome);
                  setCidadeId(id);
                  setDestinoIata(iata ?? "");
                }}
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
            <button
              type="button"
              onClick={pesquisar}
              disabled={!podeBuscar}
              className="flex h-11 items-center justify-center self-end rounded-xl bg-brand-orange px-5 text-sm font-bold text-white transition hover:brightness-110 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Buscar pacotes
            </button>
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
            Busca completa: ao pesquisar, abrimos o motor VIA AIR (aéreo, hotel, carro e pacotes)
            com os resultados de aéreo + hospedagem já carregados logo abaixo.
          </p>
        </div>
      )}
    </div>
  );
}
