import { useMemo, useState } from "react";
import { ArrowLeft, Hotel, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brl, diferencaTexto, type HotelPacote } from "@/lib/pacote-motor/mapear";

type Ordem = "recomendado" | "preco" | "estrelas" | "nome";

/** Marketplace de hospedagem: filtros, cards de hotel com fotos e opções de quarto. */
export function SeletorHospedagem({
  hoteis,
  carregando,
  hotelSelecionadoId,
  quartoSelecionadoId,
  baseTotal,
  onSelecionar,
  onVoltar,
  resumo,
}: {
  hoteis: HotelPacote[];
  carregando: boolean;
  hotelSelecionadoId: string | null;
  quartoSelecionadoId: string | null;
  baseTotal: number;
  onSelecionar: (hotel: HotelPacote, quartoId: string | null) => void;
  onVoltar: () => void;
  resumo: React.ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recomendado");
  const [expandido, setExpandido] = useState<string | null>(hotelSelecionadoId);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const arr = hoteis.filter((h) => !b || h.nome.toLowerCase().includes(b) || (h.localizacao ?? "").toLowerCase().includes(b));
    return arr.sort((a, z) => {
      if (ordem === "preco") return a.total - z.total;
      if (ordem === "nome") return a.nome.localeCompare(z.nome, "pt-BR");
      if (ordem === "estrelas") return (z.categoria ?? 0) - (a.categoria ?? 0) || a.posicao - z.posicao;
      // recomendados: mesma ordem que a operadora devolve (FRT/CompreFácil)
      return a.posicao - z.posicao;
    });
  }, [hoteis, busca, ordem]);

  return (
    <div>
      <button onClick={onVoltar} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-white/90">
        <ArrowLeft className="h-4 w-4" /> Voltar ao pacote
      </button>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_310px]">
        <div className="rounded-2xl border border-border/60 bg-card p-4 lg:sticky lg:top-24 lg:self-start">
          <h4 className="mb-2 text-xs font-bold">Buscar hospedagem</h4>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Hotel ou região"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none"
          />
          <h4 className="mb-2 mt-4 text-xs font-bold">Ordenar por</h4>
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none"
          >
            <option value="recomendado">Recomendados</option>
            <option value="preco">Menor valor</option>
            <option value="estrelas">Mais estrelas</option>
            <option value="nome">Nome</option>
          </select>
        </div>

        <div>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Alterar hospedagem</h2>
              <p className="text-xs text-white/70">O aéreo selecionado é mantido ao trocar de hotel.</p>
            </div>
            <span className="text-xs font-semibold text-white/70">{lista.length} opção(ões)</span>
          </div>

          {carregando && (
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando hospedagens…
            </div>
          )}

          <div className="grid gap-2.5">
            {lista.map((h) => {
              const diff = Number((h.total - baseTotal).toFixed(2));
              const selecionado = h.id === hotelSelecionadoId;
              const aberto = expandido === h.id;
              return (
                <article
                  key={h.id}
                  className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${selecionado ? "border-brand-blue ring-2 ring-brand-blue/40" : "border-border/60"}`}
                >
                  <div className="grid gap-3 p-3 sm:grid-cols-[150px_1fr_150px]">
                    <div className="h-[110px] overflow-hidden rounded-xl bg-muted">
                      {h.fotos[0] ? (
                        <img src={h.fotos[0]} alt={`Foto do hotel ${h.nome}`} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-muted-foreground">
                          <Hotel className="h-6 w-6" />
                        </div>
                      )}
                    </div>

                    <div>
                      {h.posicao < 3 && ordem === "recomendado" ? (
                        <span className="mb-1 inline-block rounded-full bg-brand-orange/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-orange">
                          {h.posicao === 0 ? "Mais recomendado" : "Recomendado"}
                        </span>
                      ) : null}
                      <strong className="block text-sm">{h.nome}</strong>
                      <p className="text-[11px] text-muted-foreground">{h.localizacao ?? "—"}</p>
                      {h.categoria ? (
                        <p className="mt-0.5 flex items-center gap-0.5 text-[11px] text-brand-orange">
                          {Array.from({ length: h.categoria }).map((_, i) => (
                            <Star key={i} className="h-3 w-3 fill-current" />
                          ))}
                        </p>
                      ) : null}
                      <ul className="mt-1.5 flex flex-wrap gap-1">
                        {h.beneficios.slice(0, 4).map((b) => (
                          <li key={b} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="text-right">
                      <b className={`text-xs ${diff < 0 ? "text-emerald-600" : "text-foreground"}`}>{diferencaTexto(diff, h.moeda)}</b>
                      <p className="text-[10px] text-muted-foreground">{brl(h.total, h.moeda)} no total</p>
                      <Button
                        size="sm"
                        className="mt-1.5 h-8 w-full rounded-lg text-[11px]"
                        variant={selecionado ? "secondary" : "default"}
                        onClick={() => onSelecionar(h, h.quartos[0]?.id ?? null)}
                      >
                        {selecionado ? "Selecionada" : "Selecionar hospedagem"}
                      </Button>
                      <button onClick={() => setExpandido(aberto ? null : h.id)} className="mt-1.5 text-[10px] font-bold text-brand-blue">
                        {aberto ? "Ocultar quartos" : "Opções de quarto"}
                      </button>
                    </div>
                  </div>

                  {aberto && (
                    <div className="border-t border-border/60 bg-muted/30 p-3">
                      {h.fotos.length > 1 && (
                        <div className="mb-3 flex gap-2 overflow-x-auto">
                          {h.fotos.slice(0, 8).map((f) => (
                            <img key={f} src={f} alt={`Foto do hotel ${h.nome}`} loading="lazy" className="h-20 w-28 flex-none rounded-lg object-cover" />
                          ))}
                        </div>
                      )}
                      {h.quartos.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">Acomodação conforme o pacote da operadora.</p>
                      ) : (
                        <div className="grid gap-2">
                          {h.quartos.map((q) => {
                            const sel = selecionado && q.id === quartoSelecionadoId;
                            return (
                              <div
                                key={q.id}
                                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 ${sel ? "border-brand-blue" : "border-border/60"}`}
                              >
                                <div>
                                  <b className="text-xs">{q.nome}</b>
                                  <p className="text-[10px] text-muted-foreground">
                                    {[q.ocupacao, q.regime, q.reembolsavel === true ? "Reembolsável" : q.reembolsavel === false ? "Não reembolsável" : null]
                                      .filter(Boolean)
                                      .join(" · ") || "—"}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <b className="text-[11px]">{diferencaTexto(q.diferenca, h.moeda)}</b>
                                  <Button size="sm" className="ml-2 h-7 rounded-lg text-[11px]" variant={sel ? "secondary" : "default"} onClick={() => onSelecionar(h, q.id)}>
                                    {sel ? "Selecionado" : "Selecionar quarto"}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {resumo}
      </div>
    </div>
  );
}
