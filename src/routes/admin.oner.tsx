import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyRound, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  onerDetalheOperacao,
  onerEnviarCodigo,
  onerListarOperacoes,
  onerPedirCodigo,
  onerSincronizarAgora,
  onerStatusConexao,
} from "@/lib/integrations/oner/admin.functions";
import { OnerPixManual } from "@/components/admin/OnerPixManual";


export const Route = createFileRoute("/admin/oner")({
  component: PainelOner,
  head: () => ({
    meta: [
      { title: "Comprar Viagem — Integração | Admin Via Air" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PainelOner() {
  const qc = useQueryClient();
  const status = useServerFn(onerStatusConexao);
  const pedir = useServerFn(onerPedirCodigo);
  const enviar = useServerFn(onerEnviarCodigo);
  const listar = useServerFn(onerListarOperacoes);
  const detalhar = useServerFn(onerDetalheOperacao);
  const sincronizar = useServerFn(onerSincronizarAgora);

  const [codigo, setCodigo] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  const conexao = useQuery({ queryKey: ["oner", "conexao"], queryFn: () => status({}), refetchInterval: 20_000 });
  const operacoes = useQuery({ queryKey: ["oner", "operacoes"], queryFn: () => listar({}), refetchInterval: 30_000 });
  const detalhe = useQuery({
    queryKey: ["oner", "detalhe", aberta],
    queryFn: () => detalhar({ data: { id: aberta! } }),
    enabled: Boolean(aberta),
  });

  const mPedir = useMutation({
    mutationFn: () => pedir({}),
    onSuccess: (r) => {
      toast[r.ok ? "success" : "error"](r.mensagem);
      void qc.invalidateQueries({ queryKey: ["oner", "conexao"] });
    },
  });
  const mEnviar = useMutation({
    mutationFn: () => enviar({ data: { codigo } }),
    onSuccess: (r) => {
      toast[r.ok ? "success" : "error"](r.mensagem);
      if (r.ok) setCodigo("");
      void qc.invalidateQueries({ queryKey: ["oner", "conexao"] });
    },
  });
  const mSync = useMutation({
    mutationFn: (id: string) => sincronizar({ data: { id } }),
    onSuccess: () => {
      toast.success("Consulta feita");
      void qc.invalidateQueries({ queryKey: ["oner"] });
    },
  });

  const c = conexao.data;
  const cor =
    c?.status === "conectada"
      ? "bg-emerald-500/10 text-emerald-600"
      : c?.status === "codigo_necessario"
        ? "bg-amber-500/10 text-amber-600"
        : "bg-destructive/10 text-destructive";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PlugZap className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-bold">Comprar Viagem — Integração</h1>
          <p className="text-sm text-muted-foreground">
            Conexão da conta operacional e acompanhamento das compras feitas pelo fornecedor.
          </p>
        </div>
      </div>

      {/* Conexão */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cor}`}>
              {c?.status === "conectada"
                ? "Conectada"
                : c?.status === "codigo_necessario"
                  ? "Aguardando código"
                  : "Desconectada"}
            </span>
            <p className="mt-2 text-sm text-muted-foreground">
              Conta: {c?.accountEmail ?? "—"}
              {c?.authenticatedAt ? ` · desde ${new Date(c.authenticatedAt).toLocaleString("pt-BR")}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => mPedir.mutate()}
            disabled={mPedir.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {mPedir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Pedir código de acesso
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="Código de 6 dígitos"
            className="w-48 rounded-xl border border-border bg-background px-3 py-2 text-sm tracking-widest"
          />
          <button
            type="button"
            onClick={() => mEnviar.mutate()}
            disabled={codigo.length !== 6 || mEnviar.isPending}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {mEnviar.isPending ? "Validando…" : "Conectar"}
          </button>
          <span className="text-xs text-muted-foreground">
            O código chega por e-mail e também pode entrar sozinho pelo encaminhamento automático.
          </span>
        </div>
      </section>

      {/* Operações */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-bold">Compras em andamento</h2>
          <button
            type="button"
            onClick={() => void qc.invalidateQueries({ queryKey: ["oner", "operacoes"] })}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
        {operacoes.isPending ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : !operacoes.data?.length ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma compra registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {operacoes.data.map((o) => (
              <li key={o.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {o.provider_order_number ?? "sem número"}{" "}
                      <span className="text-muted-foreground">· {o.etapa}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {o.customer_name ?? "—"}
                      {o.locator ? ` · localizador ${o.locator}` : ""}
                      {o.amount ? ` · R$ ${Number(o.amount).toFixed(2)}` : ""}
                    </p>
                    {o.last_error ? (
                      <p className="mt-1 text-xs text-destructive">{o.last_error}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => mSync.mutate(o.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                    >
                      Consultar agora
                    </button>
                    <button
                      type="button"
                      onClick={() => setAberta(aberta === o.id ? null : o.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                    >
                      {aberta === o.id ? "Fechar" : "Histórico"}
                    </button>
                  </div>
                </div>

                {aberta === o.id ? (
                  <div className="mt-3 rounded-xl bg-muted/40 p-3">
                    {detalhe.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <ol className="space-y-1.5">
                        {(detalhe.data?.eventos ?? []).map((e) => (
                          <li key={e.id} className="text-xs text-muted-foreground">
                            <span className="text-foreground">
                              {new Date(e.created_at).toLocaleString("pt-BR")}
                            </span>{" "}
                            — {e.message ?? e.event_type}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ) : null}
              </li>
            ))}

          </ul>
        )}
      </section>
    </div>
  );
}
