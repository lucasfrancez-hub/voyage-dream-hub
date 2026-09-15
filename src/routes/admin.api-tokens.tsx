import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, KeyRound, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import { API_SCOPES, API_SCOPE_LABEL, SKYHUB_DEFAULT_SCOPES, type ApiScope } from "@/lib/api/scopes";
import {
  criarApiClient,
  definirWebhookApiClient,
  estatisticasApiClient,
  listarApiClients,
  revogarApiClient,
  rotacionarApiToken,
} from "@/lib/api/tokens.functions";

export const Route = createFileRoute("/admin/api-tokens")({
  component: PainelTokens,
  head: () => ({
    meta: [
      { title: "API — Tokens de acesso | Admin Via Air" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PainelTokens() {
  const qc = useQueryClient();
  const listar = useServerFn(listarApiClients);
  const criar = useServerFn(criarApiClient);
  const rotacionar = useServerFn(rotacionarApiToken);
  const revogar = useServerFn(revogarApiClient);
  const definirWebhook = useServerFn(definirWebhookApiClient);
  const estatisticas = useServerFn(estatisticasApiClient);

  const [nome, setNome] = useState("Sky Hub");
  const [codigo, setCodigo] = useState("SKY_HUB");
  const [ambiente, setAmbiente] = useState<"live" | "test">("live");
  const [validade, setValidade] = useState<string>("");
  const [scopes, setScopes] = useState<ApiScope[]>([...SKYHUB_DEFAULT_SCOPES]);
  const [tokenNovo, setTokenNovo] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [webhook, setWebhook] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const clientes = useQuery({ queryKey: ["api-clients"], queryFn: () => listar({}) });

  const stats = useQuery({
    queryKey: ["api-client-stats", aberto],
    queryFn: async (): Promise<{ chamadas24h: number }> => {
      const r = (await estatisticas({ data: { id: aberto! } })) as { chamadas24h?: number };
      return { chamadas24h: r.chamadas24h ?? 0 };
    },
    enabled: !!aberto,
  });

  const mCriar = useMutation({
    mutationFn: () =>
      criar({
        data: {
          name: nome,
          clientCode: codigo,
          environment: ambiente,
          scopes,
          expiresInDays: validade ? Number(validade) : null,
          rateLimitPerMin: 120,
        },
      }),
    onSuccess: (r) => {
      setTokenNovo(r.token);
      qc.invalidateQueries({ queryKey: ["api-clients"] });
      toast.success("Token criado. Copie agora — ele não será exibido de novo.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mRotacionar = useMutation({
    mutationFn: (id: string) => rotacionar({ data: { id } }),
    onSuccess: (r: { token: string }) => {
      setTokenNovo(r.token);
      qc.invalidateQueries({ queryKey: ["api-clients"] });
      toast.success("Novo token gerado. O anterior deixou de valer.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mRevogar = useMutation({
    mutationFn: (id: string) => revogar({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-clients"] });
      toast.success("Acesso revogado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mWebhook = useMutation({
    mutationFn: (id: string) =>
      definirWebhook({ data: { id, url: webhook, secret: webhookSecret, events: [] } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-clients"] });
      toast.success("Endereço de aviso salvo.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function alternarScope(s: ApiScope) {
    setScopes((a) => (a.includes(s) ? a.filter((x) => x !== s) : [...a, s]));
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <KeyRound className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">API — Tokens de acesso</h1>
          <p className="text-sm text-muted-foreground">
            Cada sistema que consome a API da VIA AIR usa um token próprio, com permissões separadas.
          </p>
        </div>
      </header>

      {tokenNovo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-primary/40 bg-card p-5 shadow-xl">
            <p className="text-sm font-semibold">
              Token gerado — copie agora, ele não aparece de novo:
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Começa com <code>vai_test_</code> (teste) ou <code>vai_live_</code> (produção) e tem 57
              caracteres. Esse é o único valor que o outro sistema deve usar no header
              <code> Authorization: Bearer …</code>. Não é o código do acesso nem o ID.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-background px-3 py-2 text-xs">
                {tokenNovo}
              </code>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                onClick={() => {
                  void navigator.clipboard.writeText(tokenNovo);
                  toast.success("Copiado.");
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copiar
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-xs"
                onClick={() => setTokenNovo(null)}
              >
                Já copiei — fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Novo acesso</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <label className="text-xs">
            Nome
            <input
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
          <label className="text-xs">
            Código
            <input
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            />
          </label>
          <label className="text-xs">
            Ambiente
            <select
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value as "live" | "test")}
            >
              <option value="live">Produção (vai_live_)</option>
              <option value="test">Teste (vai_test_)</option>
            </select>
          </label>
          <label className="text-xs">
            Validade (dias, vazio = sem prazo)
            <input
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={validade}
              inputMode="numeric"
              onChange={(e) => setValidade(e.target.value.replace(/\D/g, ""))}
            />
          </label>
        </div>

        <p className="mt-4 text-xs font-medium">Permissões</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {API_SCOPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => alternarScope(s)}
              className={`rounded-full border px-3 py-1 text-xs ${
                scopes.includes(s) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              {API_SCOPE_LABEL[s]}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={mCriar.isPending || !scopes.length}
          onClick={() => mCriar.mutate()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {mCriar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Criar token
        </button>
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">Acessos existentes</h2>
        {clientes.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
        ) : !clientes.data?.length ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum acesso criado ainda.</p>
        ) : (
          <ul className="divide-y">
            {clientes.data.map((c) => (
              <li key={c.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {c.name}{" "}
                      <span className="text-xs text-muted-foreground">({c.clientCode})</span>
                      {c.revokedAt ? (
                        <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                          revogado
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.tokenPrefix}…{c.tokenLast4} · criado em{" "}
                      {new Date(c.createdAt).toLocaleString("pt-BR")} · último uso{" "}
                      {c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString("pt-BR") : "nunca"}
                      {c.expiresAt ? ` · expira ${new Date(c.expiresAt).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs"
                      onClick={() => {
                        setAberto(aberto === c.id ? null : c.id);
                        setWebhook(c.webhookUrl ?? "");
                        setWebhookSecret("");
                      }}
                    >
                      Detalhes
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: "Gerar novo token?",
                            description: "O token atual deixa de funcionar imediatamente.",
                          })
                        )
                          mRotacionar.mutate(c.id);
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Rotacionar
                    </button>
                    {!c.revokedAt ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs text-destructive"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Revogar acesso?",
                              description: "O sistema deixa de conseguir usar a API.",
                            })
                          )
                            mRevogar.mutate(c.id);
                        }}
                      >
                        <ShieldOff className="h-3.5 w-3.5" /> Revogar
                      </button>
                    ) : null}
                  </div>
                </div>

                {aberto === c.id ? (
                  <div className="mt-3 space-y-3 rounded-lg bg-background p-3">
                    <div className="flex flex-wrap gap-1">
                      {c.scopes.map((s) => (
                        <span key={s} className="rounded-full border px-2 py-0.5 text-[11px]">
                          {API_SCOPE_LABEL[s as ApiScope] ?? s}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex-1 text-xs">
                        Endereço para receber avisos (webhook)
                        <input
                          className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm"
                          placeholder="https://skyhub.exemplo.com/webhooks/viaair"
                          value={webhook}
                          onChange={(e) => setWebhook(e.target.value)}
                        />
                      </label>
                      <label className="flex-1 text-xs">
                        {c.webhookSecretHint
                          ? `Senha de assinatura (guardada: ${c.webhookSecretHint})`
                          : "Senha de assinatura (mínimo 16 caracteres)"}
                        <input
                          className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm"
                          placeholder={
                            c.webhookSecretHint
                              ? "Já salva — preencha só para trocar"
                              : "mínimo 16 caracteres"
                          }
                          value={webhookSecret}
                          onChange={(e) => setWebhookSecret(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={
                          !webhook ||
                          (webhookSecret.length < 16 && !(c.webhookSecretHint && !webhookSecret))
                        }
                        className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                        onClick={() => mWebhook.mutate(c.id)}
                      >
                        Salvar
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Chamadas nas últimas 24 horas: {stats.data?.chamadas24h ?? "—"}
                    </p>
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
