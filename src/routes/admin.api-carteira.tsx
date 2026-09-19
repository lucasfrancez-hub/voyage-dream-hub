import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, KeyRound, Loader2, RefreshCw, ShieldOff, Wallet } from "lucide-react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import {
  criarApiClient,
  listarApiClients,
  revogarApiClient,
  rotacionarApiToken,
} from "@/lib/api/tokens.functions";

// Token dedicado da camada financeira. Nunca compartilha permissão com
// aéreo, serviços ou carros: só as quatro permissões da carteira.
const NOME_FIXO = "Sky Hub — Carteira VIA AIR";
const CODIGO_FIXO = "SKY_HUB_CARTEIRA";
const PERMISSOES = ["wallet:charge", "wallet:read", "wallet:payout", "wallet:refund"] as const;

export const Route = createFileRoute("/admin/api-carteira")({
  component: PainelTokenCarteira,
  head: () => ({
    meta: [
      { title: "API — Carteira (pagamentos) | Admin Via Air" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PainelTokenCarteira() {
  const qc = useQueryClient();
  const listar = useServerFn(listarApiClients);
  const criar = useServerFn(criarApiClient);
  const rotacionar = useServerFn(rotacionarApiToken);
  const revogar = useServerFn(revogarApiClient);

  const [ambiente, setAmbiente] = useState<"live" | "test">("test");
  const [tokenNovo, setTokenNovo] = useState<string | null>(null);

  const clientes = useQuery({ queryKey: ["api-clients"], queryFn: () => listar({}) });
  const tokensCarteira = (clientes.data ?? []).filter((c) =>
    c.scopes.some((s) => s.startsWith("wallet:")),
  );

  const mCriar = useMutation({
    mutationFn: () =>
      criar({
        data: {
          name: NOME_FIXO,
          clientCode: CODIGO_FIXO,
          environment: ambiente,
          scopes: [...PERMISSOES],
          expiresInDays: null,
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <Wallet className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">API — Carteira (pagamentos)</h1>
          <p className="text-sm text-muted-foreground">
            Token exclusivo da camada financeira: gerar o Pix do cliente, consultar, pagar o Pix
            interno do fornecedor e abrir devolução. Não dá acesso a voos, serviços ou carros.
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
              Use somente servidor a servidor, no header <code>Authorization: Bearer …</code>.
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
        <h2 className="text-sm font-semibold">Criar token da carteira</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Nome: <strong>{NOME_FIXO}</strong> · Permissões: cobrar, consultar, pagar saída e devolver
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs">
            Ambiente
            <select
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm md:w-56"
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value as "live" | "test")}
            >
              <option value="test">Teste (vai_test_)</option>
              <option value="live">Produção (vai_live_)</option>
            </select>
          </label>
          <button
            type="button"
            disabled={mCriar.isPending}
            onClick={() => mCriar.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {mCriar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Criar token
          </button>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">Tokens de carteira existentes</h2>
        {clientes.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
        ) : !tokensCarteira.length ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum token de carteira criado ainda.</p>
        ) : (
          <ul className="divide-y">
            {tokensCarteira.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">
                    {c.name} <span className="text-xs text-muted-foreground">({c.clientCode})</span>
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
                  </p>
                </div>
                <div className="flex gap-2">
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
                            description: "O sistema deixa de conseguir usar a carteira.",
                          })
                        )
                          mRevogar.mutate(c.id);
                      }}
                    >
                      <ShieldOff className="h-3.5 w-3.5" /> Revogar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
