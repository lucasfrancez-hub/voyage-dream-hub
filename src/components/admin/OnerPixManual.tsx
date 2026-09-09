/**
 * PIX — Preparar manualmente.
 * Mostra tudo que a equipe precisa para refazer a oferta na Comprar Viagem
 * e registrar cada passo feito à mão (carrinho, valor líquido, pedido F-…,
 * Pix, pagamentos, localizador e bilhetes).
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDollarSign, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import {
  onerConcluirPix,
  onerListarTarefasPix,
  onerMarcarEtapaPix,
  onerRegistrarDadosPix,
  type TarefaPixResumo,
} from "@/lib/integrations/oner/admin.functions";

function moeda(v: number | null | undefined, m: string | null) {
  if (v == null) return "—";
  return `${m ?? "BRL"} ${Number(v).toFixed(2)}`;
}

export function OnerPixManual() {
  const qc = useQueryClient();
  const listar = useServerFn(onerListarTarefasPix);
  const marcar = useServerFn(onerMarcarEtapaPix);
  const registrar = useServerFn(onerRegistrarDadosPix);
  const concluir = useServerFn(onerConcluirPix);

  const [aberta, setAberta] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const tarefas = useQuery({
    queryKey: ["oner", "pix"],
    queryFn: (): Promise<TarefaPixResumo[]> => listar({}) as Promise<TarefaPixResumo[]>,
    refetchInterval: 30_000,
  });

  const recarregar = () => void qc.invalidateQueries({ queryKey: ["oner", "pix"] });

  const mMarcar = useMutation({
    mutationFn: (v: { id: string; etapa: string; feito: boolean }) => marcar({ data: v }),
    onSuccess: recarregar,
  });
  const mRegistrar = useMutation({
    mutationFn: (v: Record<string, unknown>) => registrar({ data: v as never }),
    onSuccess: () => {
      toast.success("Dados registrados");
      recarregar();
    },
  });
  const mConcluir = useMutation({
    mutationFn: (id: string) => concluir({ data: { id } }),
    onSuccess: () => {
      toast.success("Reserva Pix concluída");
      recarregar();
    },
  });

  const pendentes = (tarefas.data ?? []).filter((t) => t.pendente).length;

  const salvar = (t: TarefaPixResumo) => {
    const campo = (k: string) => form[`${t.id}:${k}`];
    mRegistrar.mutate({
      id: t.id,
      valorLiquido: campo("liquido") ? Number(campo("liquido")!.replace(",", ".")) : null,
      numeroPedido: campo("pedido") ?? null,
      brcode: campo("brcode") ?? null,
      localizador: campo("localizador") ?? null,
      observacoes: campo("obs") ?? null,
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
            <QrCode className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold">PIX — Preparar manualmente</h2>
            <p className="text-xs text-muted-foreground">
              Reservas em Pix ficam sob controle da equipe: refazer a oferta, zerar a comissão e pagar a Oner.
            </p>
          </div>
        </div>
        {pendentes > 0 ? (
          <span className="rounded-full bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-600">
            {pendentes} aguardando
          </span>
        ) : null}
      </div>

      {tarefas.isPending ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : !tarefas.data?.length ? (
        <p className="p-6 text-sm text-muted-foreground">Nenhuma reserva em Pix por enquanto.</p>
      ) : (
        <ul className="divide-y divide-border">
          {tarefas.data.map((t) => (
            <li key={t.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {t.cliente ?? "Cliente sem nome"}{" "}
                    <span className="text-muted-foreground">· {t.etapa}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.criado_em).toLocaleString("pt-BR")}
                    {t.produto ? ` · ${t.produto}` : ""}
                    {t.pedido ? ` · ${t.pedido}` : ""}
                    {t.localizador ? ` · localizador ${t.localizador}` : ""}
                  </p>
                  <p className="mt-1 text-xs">
                    <span className="text-muted-foreground">Valor ao cliente:</span>{" "}
                    <strong>{moeda(t.valor, t.moeda)}</strong>
                    <span className="text-muted-foreground"> · comissão original:</span>{" "}
                    <strong>{moeda(t.comissao, t.moeda)}</strong>
                    <span className="text-muted-foreground"> · líquido Oner:</span>{" "}
                    <strong>{moeda(t.valor_liquido, t.moeda)}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAberta(aberta === t.id ? null : t.id)}
                  className="rounded-full bg-purple-600 px-4 py-2 text-xs font-bold text-white"
                >
                  {aberta === t.id ? "Fechar" : "PIX — Preparar manualmente"}
                </button>
              </div>

              {aberta === t.id ? (
                <div className="mt-4 space-y-4 rounded-xl bg-muted/40 p-4">
                  {/* Passageiros */}
                  <div>
                    <h3 className="text-xs font-bold uppercase text-muted-foreground">Passageiros</h3>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {t.passageiros.length ? (
                        t.passageiros.map((p, i) => (
                          <li key={i}>
                            {p.nome} · {p.tipo}
                            {p.documento ? ` · doc ${p.documento}` : ""}
                            {p.nascimento ? ` · nasc. ${p.nascimento}` : ""}
                          </li>
                        ))
                      ) : (
                        <li className="text-muted-foreground">Nenhum passageiro guardado.</li>
                      )}
                    </ul>
                  </div>

                  {/* Oferta e referências da busca */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase text-muted-foreground">Oferta original</h3>
                      <pre className="mt-1 max-h-52 overflow-auto rounded-lg bg-background p-2 text-[11px]">
                        {t.oferta}
                      </pre>
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase text-muted-foreground">Referências da busca</h3>
                      <pre className="mt-1 max-h-52 overflow-auto rounded-lg bg-background p-2 text-[11px]">
                        {t.busca}
                      </pre>
                    </div>
                  </div>

                  {/* Lista de conferência */}
                  <div>
                    <h3 className="text-xs font-bold uppercase text-muted-foreground">Passo a passo</h3>
                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {t.etapas.map((e) => (
                        <li key={e.chave}>
                          <button
                            type="button"
                            onClick={() =>
                              mMarcar.mutate({ id: t.id, etapa: e.chave, feito: !e.feito })
                            }
                            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium ${
                              e.feito
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                                : "border-border bg-background"
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded border ${
                                e.feito ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"
                              }`}
                            >
                              {e.feito ? <Check className="h-3 w-3" /> : null}
                            </span>
                            {e.titulo}
                            {e.em ? (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                {new Date(e.em).toLocaleString("pt-BR")}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Campos da operação manual */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { k: "liquido", label: "Valor líquido Oner", ph: "0,00" },
                      { k: "pedido", label: "Pedido F-…", ph: "F-XXXXXX" },
                      { k: "brcode", label: "Pix Oner (copia e cola)", ph: "00020126…" },
                      { k: "localizador", label: "Localizador", ph: "ABC123" },
                      { k: "obs", label: "Observações", ph: "Anotações internas" },
                    ].map((c) => (
                      <label key={c.k} className="text-xs font-medium">
                        {c.label}
                        <input
                          value={form[`${t.id}:${c.k}`] ?? ""}
                          onChange={(ev) =>
                            setForm((f) => ({ ...f, [`${t.id}:${c.k}`]: ev.target.value }))
                          }
                          placeholder={c.ph}
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal"
                        />
                      </label>
                    ))}
                  </div>

                  {t.observacoes ? (
                    <p className="text-xs text-muted-foreground">Última anotação: {t.observacoes}</p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => salvar(t)}
                      disabled={mRegistrar.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
                    >
                      <CircleDollarSign className="h-4 w-4" /> Salvar dados da operação
                    </button>
                    <button
                      type="button"
                      onClick={() => mConcluir.mutate(t.id)}
                      disabled={mConcluir.isPending || !t.pendente}
                      className="rounded-lg border border-border px-4 py-2 text-xs font-bold disabled:opacity-50"
                    >
                      Reserva confirmada — concluir
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
