/**
 * Resumo da reserva — réplica fiel do modelo aprovado.
 * Todos os valores vêm do fornecedor; nada é calculado aqui (exceto o tempo de conexão,
 * derivado dos horários informados pelo próprio fornecedor).
 */
import { useState } from "react";
import { Briefcase, ChevronDown, Clock, Luggage, Plane, ShoppingBag } from "lucide-react";
import type { ResumoCarrinho, SegmentoVoo } from "@/lib/integrations/oner/checkout.server";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const rotuloTipo: Record<string, string> = {
  ADT: "Adulto",
  CHD: "Criança",
  INF: "Bebê",
  ADULT: "Adulto",
  CHILD: "Criança",
  INFANT: "Bebê",
};

const plural: Record<string, string> = {
  Adulto: "Adultos",
  Criança: "Crianças",
  Bebê: "Bebês",
};

function minutos(data: string, hora: string) {
  const [d, m, y] = data.split("/").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  if (!d || !m || !y || Number.isNaN(hh)) return null;
  return Date.UTC(y, m - 1, d, hh, mm || 0) / 60000;
}

function duracaoEntre(a: SegmentoVoo, b: SegmentoVoo) {
  const fim = minutos(a.chegada.data, a.chegada.hora);
  const ini = minutos(b.saida.data, b.saida.hora);
  if (fim == null || ini == null || ini <= fim) return null;
  const t = ini - fim;
  return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, "0")}`;
}

function duracaoSegmento(s: SegmentoVoo) {
  const ini = minutos(s.saida.data, s.saida.hora);
  const fim = minutos(s.chegada.data, s.chegada.hora);
  if (ini == null || fim == null || fim <= ini) return null;
  const t = fim - ini;
  return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, "0")}`;
}

function LogoCia({ logo, cia, grande }: { logo: string | null; cia: string; grande?: boolean }) {
  if (!logo) {
    return <Plane className="h-4 w-4 text-muted-foreground" />;
  }
  return (
    <div
      className={
        grande
          ? "flex h-12 min-w-[104px] items-center justify-center rounded-xl bg-white px-2 py-1"
          : "flex h-9 min-w-[86px] items-center justify-center rounded-lg bg-white px-2 py-1"
      }
    >
      <img
        src={logo}
        alt={cia}
        className={grande ? "h-9 w-auto max-w-[96px] object-contain" : "h-6 w-auto max-w-[78px] object-contain"}
      />
    </div>
  );
}


export function ResumoReserva({
  resumo,
  passageiros,
  rodape,
  mostrarParcelas = true,
}: {
  resumo: Pick<ResumoCarrinho, "voos" | "precos" | "total" | "taxas" | "tarifa" | "parcelas">;
  passageiros?: Array<{ nome: string; tipo?: string }>;
  rodape?: React.ReactNode;
  mostrarParcelas?: boolean;
}) {
  const [aberto, setAberto] = useState<number | null>(null);
  const total = resumo.total ?? 0;
  const melhorParcela = mostrarParcelas
    ? (resumo.parcelas.filter((p) => !p.hasRate).at(-1) ?? null)
    : null;

  return (
    <aside className="h-fit lg:sticky lg:top-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-none">
        <div className="border-b border-border bg-muted/40 px-6 py-4">
          <h3 className="font-bold">Resumo da reserva</h3>
        </div>
        <div className="p-6">
        {(() => {
          const primeiro = resumo.voos[0];
          const numeros = resumo.voos
            .flatMap((v) => v.segmentos.map((s) => (s.voo ? `${s.ciaIata}${s.voo}` : null)))
            .filter(Boolean)
            .join(" / ");
          if (!primeiro) return null;
          return (
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <LogoCia logo={primeiro.logo} cia={primeiro.cia} grande />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{primeiro.cia}</div>
                  {numeros ? (
                    <div className="truncate text-[11px] text-muted-foreground">{numeros}</div>
                  ) : null}
                </div>
              </div>

              {resumo.voos.map((v, i) => (
                <div key={i} className="mt-5 rounded-2xl border border-brand-orange/25 bg-background/50 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-brand-orange">
                      {v.rotulo}
                      {v.saida.data ? ` · ${v.saida.data.slice(0, 5)}` : ""}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {v.paradas > 0
                        ? `${v.paradas} ${v.paradas === 1 ? "conexão" : "conexões"}`
                        : "Direto"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4">
                    <div className="min-w-0">
                      <div className="font-display text-[30px] font-bold leading-none tracking-tight">
                        {v.saida.hora}
                      </div>
                      <div className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {v.saida.iata}
                      </div>
                      {v.saida.cidade ? (
                        <div className="mt-1 truncate text-[11px] text-muted-foreground">{v.saida.cidade}</div>
                      ) : null}
                    </div>
                    <div className="w-24 pt-2 text-center">
                      <div className="text-[10px] text-muted-foreground">{v.duracao ?? ""}</div>
                      <div className="my-1.5 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange" />
                        <span className="h-px flex-1 bg-border" />
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange" />
                      </div>
                      <div className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">
                        {v.conexoes.length
                          ? v.conexoes.join(" · ")
                          : (v.segmentos[0]?.familia ?? "")}
                      </div>
                    </div>
                    <div className="min-w-0 text-right">
                      <div className="font-display text-[30px] font-bold leading-none tracking-tight">
                        {v.chegada.hora}
                      </div>
                      <div className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {v.chegada.iata}
                      </div>
                      {v.chegada.cidade ? (
                        <div className="mt-1 truncate text-[11px] text-muted-foreground">{v.chegada.cidade}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-orange/40 text-brand-orange">
                    <Briefcase className="h-4 w-4" />
                  </span>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                      primeiro.bagagemMao
                        ? "border-brand-orange/40 text-brand-orange"
                        : "border-border text-muted-foreground/50"
                    }`}
                    title={primeiro.bagagemMao ?? "Sem bagagem de mão"}
                  >
                    <ShoppingBag className="h-4 w-4" />
                  </span>
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground/50"
                    title="Bagagem despachada não inclusa"
                  >
                    <Luggage className="h-4 w-4" />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAberto(aberto === 0 ? null : 0)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition hover:text-brand-orange"
                >
                  Ver mais
                  <ChevronDown className={`h-3 w-3 transition ${aberto === 0 ? "rotate-180" : ""}`} />
                </button>
              </div>

              {aberto === 0 ? (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  {resumo.voos.map((v, i) => (
                    <div key={i}>
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand-orange">
                        {v.rotulo}
                        {v.saida.data ? ` · ${v.saida.data}` : ""}
                      </div>
                      {v.segmentos.map((s, j) => (
                        <div key={j}>
                          {j > 0 ? (
                            <div className="my-3 flex items-center gap-2 border-y border-border py-2 text-[11px] text-muted-foreground">
                              <Clock className="h-4 w-4 shrink-0 text-brand-orange" />
                              <span>
                                <strong className="font-medium text-foreground">
                                  Conexão em {s.saida.cidade || s.saida.iata} ({s.saida.iata})
                                </strong>
                                {duracaoEntre(v.segmentos[j - 1]!, s)
                                  ? ` · ${duracaoEntre(v.segmentos[j - 1]!, s)} entre os voos`
                                  : ""}
                              </span>
                            </div>
                          ) : null}

                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <LogoCia logo={s.logo ?? v.logo} cia={s.cia || v.cia} />
                              <div>
                                <div className="text-xs font-medium">
                                  {[s.cia || v.cia, s.voo ? `${s.ciaIata}${s.voo}` : null]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                                {s.familia ? (
                                  <div className="text-[10px] text-muted-foreground">{s.familia}</div>
                                ) : null}
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {duracaoSegmento(s) ?? ""}
                            </span>
                          </div>

                          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                            <div>
                              <div className="text-sm font-semibold">{s.saida.hora}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {s.saida.iata}
                                {s.saida.cidade ? ` · ${s.saida.cidade}` : ""}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">→</div>
                            <div className="text-right">
                              <div className="text-sm font-semibold">{s.chegada.hora}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {s.chegada.iata}
                                {s.chegada.cidade ? ` · ${s.chegada.cidade}` : ""}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })()}


        {passageiros && passageiros.length ? (
          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 text-xs text-muted-foreground">Passageiros</div>
            <div className="space-y-2 text-sm">
              {passageiros.map((p, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <span className="truncate">{p.nome?.trim() || `Passageiro ${i + 1}`}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {rotuloTipo[(p.tipo ?? "ADT").toUpperCase()] ?? p.tipo}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          {resumo.precos.map((p, i) => {
            const base = rotuloTipo[p.tipo.toUpperCase()] ?? p.tipo;
            const label = p.quantidade > 1 ? (plural[base] ?? base) : base;
            return (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">
                  {label} × {p.quantidade}
                </span>
                <span>{brl(p.total)}</span>
              </div>
            );
          })}
          {resumo.taxas != null ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Já com taxas inclusas de</span>
              <span>{brl(resumo.taxas)}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-display text-2xl font-bold text-brand-orange">{brl(total)}</span>
        </div>
        {melhorParcela ? (
          <div className="mt-1 text-right text-xs text-muted-foreground">
            em {melhorParcela.installment}x de {brl(melhorParcela.installmentsValue)} sem juros
          </div>
        ) : null}

        {rodape}
        </div>
      </div>
    </aside>
  );
}
