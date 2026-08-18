import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Loader2, Plane, RefreshCw, Search, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listarPacotesCativa,
  resumoCativa,
  sincronizarCativa,
  reprocessarVoosCativa,
  reprocessarLoteCativa,
  historicoPacoteCativa,
} from "@/lib/cativa/cativa.functions";

export const Route = createFileRoute("/admin/pacotes-cativa")({
  head: () => ({
    meta: [
      { title: "Catálogo Cativa — pacotes importados | VIA AIR" },
      {
        name: "description",
        content:
          "Painel do robô de importação do catálogo Cativa: pacotes ativos, alterações de preço, fila de voos da Infotravel e execuções do robô.",
      },
      { property: "og:title", content: "Catálogo Cativa — pacotes importados | VIA AIR" },
      { property: "og:description", content: "Monitoramento do robô de pacotes Cativa da VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PacotesCativaPage,
});

const brl = (v: number | null | undefined) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const dataBr = (v: string | null | undefined) => (v ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR") : "—");

function StatusVoos({ status, opcoes }: { status: string; opcoes: number }) {
  if (status === "ok") return <Badge variant="secondary">{opcoes} opções de voo</Badge>;
  if (status === "pendente") return <Badge variant="outline">Voos na fila</Badge>;
  if (status === "processando") return <Badge variant="outline">Consultando…</Badge>;
  if (status === "sem_opcoes") return <Badge variant="outline">Sem opções</Badge>;
  return <Badge variant="destructive">{status}</Badge>;
}

function PacotesCativaPage() {
  const qc = useQueryClient();
  const listar = useServerFn(listarPacotesCativa);
  const resumo = useServerFn(resumoCativa);
  const sincronizar = useServerFn(sincronizarCativa);
  const reprocessar = useServerFn(reprocessarVoosCativa);
  const reprocessarLote = useServerFn(reprocessarLoteCativa);
  const historico = useServerFn(historicoPacoteCativa);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [fonte, setFonte] = useState<string>("");
  const [status, setStatus] = useState<string>("ativo");
  const [pagina, setPagina] = useState(0);
  const [detalhe, setDetalhe] = useState<{ id: string; nome: string } | null>(null);
  const [reprocessandoTudo, setReprocessandoTudo] = useState(false);
  const cancelarReprocessamento = useRef(false);

  const resumoQ = useQuery({ queryKey: ["cativa-resumo"], queryFn: () => resumo({ data: undefined }) });
  const listaQ = useQuery({
    queryKey: ["cativa-pacotes", filtro, fonte, status, pagina],
    queryFn: () => listar({ data: { busca: filtro || undefined, fonte: fonte || undefined, status: status || undefined, pagina } }),
  });
  const detalheQ = useQuery({
    queryKey: ["cativa-detalhe", detalhe?.id],
    enabled: !!detalhe,
    queryFn: () => historico({ data: { pacoteId: detalhe!.id } }),
  });

  const sync = useMutation({
    mutationFn: (limiteVoos: number) => sincronizar({ data: { limiteVoos } }),
    onSuccess: (r: any) => {
      if (r?.skipped) toast.info(`Robô não rodou: ${r.motivo}`);
      else
        toast.success(
          `Planilhas: ${r?.planilhas?.novos ?? 0} novos, ${r?.planilhas?.alterados ?? 0} alterados, ${r?.planilhas?.evitados_infotravel ?? 0} consultas evitadas`,
        );
      qc.invalidateQueries({ queryKey: ["cativa-resumo"] });
      qc.invalidateQueries({ queryKey: ["cativa-pacotes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refazVoos = useMutation({
    mutationFn: (pacoteId: string) => reprocessar({ data: { pacoteId } }),
    onSuccess: () => {
      toast.success("Voos reprocessados");
      qc.invalidateQueries({ queryKey: ["cativa-pacotes"] });
      qc.invalidateQueries({ queryKey: ["cativa-detalhe"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refazLote = useMutation({
    mutationFn: (tudo: boolean) => reprocessarLote({ data: { tudo, limite: 5 } }),
    onSuccess: (r: any) => {
      toast.success(`Reprocessados ${r?.processados ?? 0} pacotes (${r?.ok ?? 0} ok, ${r?.erros ?? 0} com erro)`);
      qc.invalidateQueries({ queryKey: ["cativa-resumo"] });
      qc.invalidateQueries({ queryKey: ["cativa-pacotes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!reprocessandoTudo) return;
    cancelarReprocessamento.current = false;
    let ativo = true;

    const continuar = async () => {
      try {
        while (ativo && !cancelarReprocessamento.current) {
          const resultado = await reprocessarLote({ data: { tudo: false, limite: 5 } });
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["cativa-resumo"] }),
            qc.invalidateQueries({ queryKey: ["cativa-pacotes"] }),
          ]);
          if (!resultado.restantes) {
            toast.success("Reprocessamento de voos concluído");
            setReprocessandoTudo(false);
            return;
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "O reprocessamento foi interrompido");
        setReprocessandoTudo(false);
      }
    };
    void continuar();
    return () => {
      ativo = false;
    };
  }, [qc, reprocessarLote, reprocessandoTudo]);

  const total = listaQ.data?.total ?? 0;
  const r = resumoQ.data;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Catálogo Cativa</h1>
          <p className="text-sm text-muted-foreground">
            Importação automática das planilhas do Viajando com Desconto, com consulta à Infotravel só quando algo muda.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => sync.mutate(0)} disabled={sync.isPending}>
            {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sincronizar planilhas
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (reprocessandoTudo) {
                cancelarReprocessamento.current = true;
                setReprocessandoTudo(false);
                toast.info("Reprocessamento pausado");
              } else {
                setReprocessandoTudo(true);
              }
            }}
          >
            {reprocessandoTudo ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {reprocessandoTudo ? "Pausar reprocessamento" : "Reprocessar zerados"}
          </Button>
          <Button onClick={() => sync.mutate(20)} disabled={sync.isPending}>
            <Plane className="mr-2 h-4 w-4" />
            Sincronizar + voos
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "Ativos", valor: r?.ativos },
          { label: "Esgotados", valor: r?.esgotados },
          { label: "Voos na fila", valor: r?.pendentes },
          { label: "Com voos", valor: r?.comVoos },
          { label: "Com erro", valor: r?.erros },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-xl font-semibold">{c.valor ?? "—"}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por pacote, origem ou destino"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPagina(0);
                setFiltro(busca);
              }
            }}
          />
        </div>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={fonte}
          onChange={(e) => {
            setPagina(0);
            setFonte(e.target.value);
          }}
        >
          <option value="">Todas as fontes</option>
          <option value="tradicionais">Tradicionais</option>
          <option value="eventos">Eventos</option>
          <option value="internacionais">Internacionais</option>
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => {
            setPagina(0);
            setStatus(e.target.value);
          }}
        >
          <option value="ativo">Ativos</option>
          <option value="esgotado">Esgotados</option>
          <option value="">Todos</option>
        </select>
      </div>

      <div className="rounded-lg border">
        {listaQ.isLoading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando pacotes…
          </div>
        ) : !listaQ.data?.rows.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum pacote encontrado. Rode a sincronização para carregar o catálogo.
          </div>
        ) : (
          <ul className="divide-y">
            {(listaQ.data.rows as any[]).map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-[240px] flex-1">
                  <div className="font-medium">{p.nome}</div>
                  <div className="text-sm text-muted-foreground">
                    {p.origem_cidade ?? p.origem_iata ?? "—"} → {p.destino ?? "—"} · {dataBr(p.data_viagem)}
                    {p.data_fim ? ` a ${dataBr(p.data_fim)}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{p.fonte}</Badge>
                    {p.categoria ? <Badge variant="outline">{p.categoria}</Badge> : null}
                    <StatusVoos status={p.voos_status} opcoes={p.voos_opcoes ?? 0} />
                    {p.status !== "ativo" ? <Badge variant="destructive">{p.status}</Badge> : null}
                  </div>
                  {p.voos_erro ? (
                    <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" /> {p.voos_erro}
                    </div>
                  ) : null}
                </div>
                <div className="min-w-[150px] text-right">
                  <div className="text-sm text-muted-foreground">Total</div>
                  <div className="font-semibold">
                    {brl(
                      typeof p.valor_total === "number" && p.valor_total > 0
                        ? p.valor_total
                        : typeof p.voo_menor === "number"
                          ? p.voo_menor
                          : null,
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Aéreo {brl(typeof p.aereo_por === "number" && p.aereo_por > 0 ? p.aereo_por : p.voo_menor)} · Taxas{" "}
                    {brl(p.taxas)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setDetalhe({ id: p.id, nome: p.nome })}>
                    <History className="mr-1 h-4 w-4" /> Detalhes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={refazVoos.isPending}
                    onClick={() => refazVoos.mutate(p.id)}
                  >
                    {refazVoos.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  {p.link_orcamento ? (
                    <a href={p.link_orcamento} target="_blank" rel="noreferrer" className="p-2 text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} pacotes</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(pagina + 1) * 50 >= total}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Últimas execuções do robô</h2>
        <ul className="space-y-2 text-sm">
          {(r?.runs ?? []).map((run: any) => (
            <li key={run.id} className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <Badge variant={run.status === "erro" ? "destructive" : "outline"}>{run.status}</Badge>
              <span>{new Date(run.iniciado_em).toLocaleString("pt-BR")}</span>
              <span>· {run.linhas} linhas</span>
              <span>· {run.novos} novos</span>
              <span>· {run.alterados} alterados</span>
              <span>· {run.infotravel_chamadas} consultas</span>
              <span>· {run.infotravel_evitadas} evitadas</span>
              {run.erro ? <span className="text-destructive">· {run.erro}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detalhe?.nome}</DialogTitle>
          </DialogHeader>
          {detalheQ.isLoading ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="mb-2 font-medium">Opções de voo</h3>
                {!detalheQ.data?.voos.length ? (
                  <p className="text-muted-foreground">Nenhuma opção importada ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {(detalheQ.data.voos as any[]).map((o) => (
                      <li key={o.id} className="rounded border p-2">
                        <div className="flex justify-between font-medium">
                          <span>
                            Opção {o.opcao_numero} {o.companhia ? `· ${o.companhia}` : ""}
                          </span>
                          <span>{brl(o.total)}</span>
                        </div>
                        <ul className="mt-1 text-xs text-muted-foreground">
                          {((o.voos as any[]) ?? []).map((f: any, i: number) => (
                            <li key={i}>
                              {f.airline ?? ""} {f.flightNumber ?? ""} {f.fromIata ?? f.from ?? f.origin ?? ""} →{" "}
                              {f.toIata ?? f.to ?? f.destination ?? ""} {f.departure ?? f.departureAt ?? ""}
                            </li>
                          ))}
                        </ul>
                        {((o.hoteis as any[]) ?? []).length ? (
                          <ul className="mt-1 text-xs text-muted-foreground">
                            {((o.hoteis as any[]) ?? []).map((h: any, i: number) => (
                              <li key={i}>
                                🏨 {h.name} {h.board ? `· ${h.board}` : ""} {h.checkin ? `· ${dataBr(h.checkin)}` : ""}
                                {h.checkout ? ` a ${dataBr(h.checkout)}` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {(() => {
                          const r = ((o.detalhes ?? {}) as any).resumo_ia as any[] | undefined;
                          if (!Array.isArray(r) || !r.length) return null;
                          return (
                            <div className="mt-2 space-y-2 rounded bg-muted/40 p-2">
                              {r.map((s: any, i: number) => (
                                <div key={i}>
                                  <div className="text-xs font-medium">{s.nome}</div>
                                  {s.resumo ? <p className="text-xs text-muted-foreground">{s.resumo}</p> : null}
                                  {(s.destaques ?? []).length ? (
                                    <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                                      {(s.destaques as string[]).map((x, j) => (
                                        <li key={j}>{x}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        {(() => {
                          const d = (o.detalhes ?? {}) as any;
                          const extras = [
                            ...(d.transfers ?? []).map((x: any) => ["Transfer", x] as const),
                            ...(d.tickets ?? []).map((x: any) => ["Ingresso", x] as const),
                            ...(d.activities ?? []).map((x: any) => ["Passeio", x] as const),
                            ...(d.insurance ?? []).map((x: any) => ["Seguro", x] as const),
                            ...(d.services ?? []).map((x: any) => ["Serviço", x] as const),
                          ];
                          if (!extras.length) return null;
                          return (
                            <div className="mt-2 rounded bg-muted/40 p-2">
                              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                Serviços adicionais
                              </div>
                              <ul className="space-y-0.5 text-xs text-muted-foreground">
                                {extras.map(([tipo, x]: any, i: number) => (
                                  <li key={i} className="flex justify-between gap-2">
                                    <span>
                                      {tipo}: {x?.name ?? "—"}
                                      {x?.date ? ` · ${dataBr(String(x.date).slice(0, 10))}` : ""}
                                    </span>
                                    <span>{brl(typeof x?.total === "number" ? x.total : null)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Separator />
              <div>
                <h3 className="mb-2 font-medium">Histórico de alterações</h3>
                {!detalheQ.data?.historico.length ? (
                  <p className="text-muted-foreground">Sem alterações registradas.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {(detalheQ.data.historico as any[]).map((h) => (
                      <li key={h.id}>
                        {new Date(h.created_at).toLocaleString("pt-BR")} · {h.tipo}
                        {h.campo ? ` · ${h.campo}: ${h.valor_anterior || "—"} → ${h.valor_novo || "—"}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
