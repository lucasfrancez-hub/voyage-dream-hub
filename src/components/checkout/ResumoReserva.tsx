/**
 * Resumo da reserva — réplica fiel do modelo aprovado.
 * Todos os valores vêm do fornecedor; nada é calculado aqui (exceto o tempo de conexão,
 * derivado dos horários informados pelo próprio fornecedor).
 */
import { useState } from "react";
import { ChevronDown, Clock, Plane } from "lucide-react";
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
          ? "flex h-9 min-w-[82px] items-center justify-center rounded-lg bg-white px-2.5 py-1.5"
          : "flex h-8 min-w-[78px] items-center justify-center rounded-md bg-white px-2 py-1.5"
      }
    >
      <img
        src={logo}
        alt={cia}
        className={grande ? "h-5 w-auto max-w-[70px] object-contain" : "h-4 w-auto max-w-[66px] object-contain"}
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
      <div className="overflow-hidden rounded-2xl border border-border bg-card/50 shadow-none">
        <div className="border-b border-border bg-muted/40 px-6 py-4">
          <h3 className="font-bold">Resumo da reserva</h3>
        </div>
        <div className="p-6">
        {resumo.voos.map((v, i) => (
          <div key={i} className={i === 0 ? "mt-4" : "mt-5 border-t border-border pt-4"}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-brand-orange">
                  {v.rotulo}
                  {v.saida.data ? ` · ${v.saida.data}` : ""}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {v.paradas > 0
                    ? `${v.paradas} ${v.paradas === 1 ? "conexão" : "conexões"}${
                        v.conexoes.length ? ` em ${v.conexoes.join(", ")}` : ""
                      }`
                    : "Voo direto"}
                </div>
              </div>
              <LogoCia logo={v.logo} cia={v.cia} grande />
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div>
                <div className="text-xl font-semibold">{v.saida.hora}</div>
                <div className="text-xs text-muted-foreground">
                  {v.saida.iata}
                  {v.saida.cidade ? ` · ${v.saida.cidade}` : ""}
                </div>
              </div>
              <div className="min-w-[82px] text-center">
                <div className="text-xs text-muted-foreground">→</div>
                <div className="mt-1 text-[9px] font-medium">
                  {v.paradas > 0 ? `${v.paradas} ${v.paradas === 1 ? "conexão" : "conexões"}` : "Direto"}
                </div>
                {v.conexoes.length ? (
                  <div className="text-[9px] text-muted-foreground">
                    {v.segmentos.slice(0, -1).map((s) => s.chegada.iata).join(" · ")}
                  </div>
                ) : null}
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold">{v.chegada.hora}</div>
                <div className="text-xs text-muted-foreground">
                  {v.chegada.iata}
                  {v.chegada.cidade ? ` · ${v.chegada.cidade}` : ""}
                </div>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
              <span>{v.duracao ? `Duração total: ${v.duracao}` : ""}</span>
              <span>{v.bagagemMao ?? ""}</span>
            </div>

            <button
              type="button"
              onClick={() => setAberto(aberto === i ? null : i)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-orange hover:underline"
            >
              Ver detalhes do voo
              <ChevronDown className={`h-3 w-3 transition ${aberto === i ? "rotate-180" : ""}`} />
            </button>

            {aberto === i ? (
              <div className="mt-4 border-t border-border pt-4">
                {v.segmentos.map((s, j) => (
                  <div key={j}>
                    {j > 0 ? (
                      <div className="my-4 flex items-center gap-2 border-y border-border py-3 text-[11px] text-muted-foreground">
                        <Clock className="h-4 w-4 shrink-0 text-brand-orange" />
                        <span>
                          <strong className="font-medium text-foreground">
                            Conexão em {s.saida.cidade || s.saida.iata} ({s.saida.iata})
                          </strong>
                          {duracaoEntre(v.segmentos[j - 1]!, s) ? ` · ${duracaoEntre(v.segmentos[j - 1]!, s)} entre os voos` : ""}
                        </span>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <LogoCia logo={s.logo ?? v.logo} cia={s.cia || v.cia} />
                        <div>
                          <div className="text-xs font-medium">
                            {[s.cia || v.cia, s.voo ? `${s.ciaIata}${s.voo}` : null].filter(Boolean).join(" · ")}
                          </div>
                          {s.familia ? (
                            <div className="text-[10px] text-muted-foreground">{s.familia}</div>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{duracaoSegmento(s) ?? ""}</span>
                    </div>

                    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
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
            ) : null}
          </div>
        ))}

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
    </aside>
  );
}
