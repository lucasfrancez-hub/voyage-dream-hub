import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MailCheck, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  diagnosticoCodigosAuth,
  listarProvedoresCodigo,
  testarRecebimentoCodigo,
} from "@/lib/auth-code/auth-code.functions";
import { registrarCodigoManual } from "@/lib/auth-code/otp-manual.functions";

export const Route = createFileRoute("/admin/codigos-auth")({
  head: () => ({
    meta: [
      { title: "Códigos de autenticação por e-mail | VIA AIR" },
      {
        name: "description",
        content:
          "Diagnóstico da caixa dedicada que recebe os códigos 2FA encaminhados dos fornecedores da VIA AIR.",
      },
      { property: "og:title", content: "Códigos de autenticação por e-mail | VIA AIR" },
      {
        property: "og:description",
        content: "Status da leitura automática de códigos 2FA recebidos por e-mail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CodigosAuthPage,
});

const ROTULO_STATUS: Record<string, string> = {
  aguardando_codigo: "Aguardando código",
  codigo_encontrado: "Código identificado",
  codigo_utilizado: "Código identificado",
  expirado: "Nenhum código encontrado",
  erro: "Erro",
};

function dataHora(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function CodigosAuthPage() {
  const diagFn = useServerFn(diagnosticoCodigosAuth);
  const provFn = useServerFn(listarProvedoresCodigo);
  const testarFn = useServerFn(testarRecebimentoCodigo);
  const manualFn = useServerFn(registrarCodigoManual);
  const [provider, setProvider] = useState("generico");
  const [codigoManual, setCodigoManual] = useState("");

  const diag = useQuery({
    queryKey: ["codigos-auth", "diagnostico"],
    queryFn: () => diagFn(),
    refetchInterval: 60_000,
  });
  const provedores = useQuery({
    queryKey: ["codigos-auth", "provedores"],
    queryFn: () => provFn(),
    staleTime: 5 * 60_000,
  });

  const teste = useMutation({
    mutationFn: () => testarFn({ data: { provider, timeoutSegundos: 120 } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Código de autenticação identificado com sucesso.");
      else toast.error(r.erro);
      diag.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const manual = useMutation({
    mutationFn: () => manualFn({ data: { provider, codigo: codigoManual } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Código enviado para a automação.");
        setCodigoManual("");
      } else toast.error("Não foi possível registrar esse código.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = diag.data;
  const ultima = d?.ultimaTentativa ?? null;
  const resultado = teste.data;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Códigos de autenticação por e-mail
        </h1>
        <p className="text-sm text-muted-foreground">
          Leitura automática dos códigos 2FA encaminhados para a caixa dedicada. O código completo
          nunca é exibido aqui — ele vai direto para a automação.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Gmail de autenticação</Label>
            <p className="font-medium">{d?.conta ?? "encaminhamentoviaair@gmail.com"}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => diag.refetch()}
            disabled={diag.isFetching}
          >
            {diag.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>

        <Separator className="my-4" />

        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Status</dt>
            <dd className="mt-1">
              {diag.isLoading ? (
                <span className="text-sm text-muted-foreground">Verificando…</span>
              ) : d?.conectado ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">Conectado</Badge>
              ) : (
                <Badge variant="destructive">Desconectado</Badge>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Última sincronização</dt>
            <dd className="mt-1 text-sm">{dataHora(d?.ultimaSincronizacao)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">
              Último e-mail de autenticação
            </dt>
            <dd className="mt-1 text-sm">
              {ultima
                ? `${ultima.fornecedor} · ${dataHora(ultima.recebidoEm ?? ultima.solicitadoEm)}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Último resultado</dt>
            <dd className="mt-1 text-sm">
              {ultima ? (
                <span className="inline-flex items-center gap-2">
                  {ROTULO_STATUS[ultima.status] ?? ultima.status}
                  {ultima.codigoMascarado ? (
                    <code className="rounded bg-muted px-1.5 py-0.5">{ultima.codigoMascarado}</code>
                  ) : null}
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>

        {d?.erro ? (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {d.erro}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-medium">Testar recebimento de código</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Peça um código no fornecedor e clique abaixo. Aguardamos até 2 minutos pelo e-mail
          encaminhado.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label>Fornecedor</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(provedores.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => teste.mutate()} disabled={teste.isPending}>
            {teste.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MailCheck className="h-4 w-4" />
            )}
            Testar recebimento de código
          </Button>
        </div>

        <Separator className="my-5" />

        <div className="space-y-1.5">
          <Label>Recebi o código no celular</Label>
          <p className="text-sm text-muted-foreground">
            Quando o fornecedor mandar o token por SMS ou WhatsApp em um aparelho da equipe,
            digite aqui: o robô que estiver esperando usa esse código na hora.
          </p>
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <Input
              value={codigoManual}
              onChange={(e) => setCodigoManual(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 10))}
              placeholder="Ex.: 483920"
              className="w-40 text-center tracking-[0.3em]"
              inputMode="numeric"
            />
            <Button
              variant="secondary"
              disabled={codigoManual.length < 4 || manual.isPending}
              onClick={() => manual.mutate()}
            >
              {manual.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Enviar código para o robô
            </Button>
          </div>
        </div>


        {teste.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Aguardando o e-mail chegar na caixa…
          </p>
        ) : null}

        {resultado?.ok ? (
          <div className="mt-4 space-y-1 rounded-md bg-emerald-500/10 p-3 text-sm">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">
              Código de autenticação identificado com sucesso.
            </p>
            <p>
              <span className="text-muted-foreground">Remetente:</span> {resultado.remetente || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Assunto:</span> {resultado.assunto || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Horário:</span>{" "}
              {dataHora(resultado.recebidoEm)}
            </p>
            <p>
              <span className="text-muted-foreground">Código:</span>{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">{resultado.codigoMascarado}</code>
            </p>
          </div>
        ) : null}

        {resultado && !resultado.ok ? (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {resultado.erro}
          </p>
        ) : null}
      </section>
    </div>
  );
}
