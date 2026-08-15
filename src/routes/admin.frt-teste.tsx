import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlugZap, Search, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { consultarFrt, diagnosticarFrt, enviarCodigoFrt } from "@/lib/frt/frt.functions";

export const Route = createFileRoute("/admin/frt-teste")({
  head: () => ({
    meta: [
      { title: "Conector FRT — Ambiente de teste | VIA AIR" },
      {
        name: "description",
        content:
          "Ambiente interno para validar o conector read-only da FRT/Infotravel: login, ViewState, campos do formulário e normalização dos resultados.",
      },
      { property: "og:title", content: "Conector FRT — Ambiente de teste | VIA AIR" },
      {
        property: "og:description",
        content: "Teste de conexão e pesquisa read-only na FRT/Infotravel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FrtTestePage,
});

function FrtTestePage() {
  const diag = useServerFn(diagnosticarFrt);
  const consulta = useServerFn(consultarFrt);
  const enviarCodigo = useServerFn(enviarCodigoFrt);
  const [codigo, setCodigo] = useState("");

  const [origem, setOrigem] = useState("MGF");
  const [destino, setDestino] = useState("SSA");
  const [ida, setIda] = useState("2026-09-23");
  const [volta, setVolta] = useState("2026-09-30");
  const [adultos, setAdultos] = useState(2);
  const [criancas, setCriancas] = useState(0);

  const diagMut = useMutation({
    mutationFn: (novaSessao?: boolean) => diag({ data: { novaSessao: Boolean(novaSessao) } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const codigoMut = useMutation({
    mutationFn: () => enviarCodigo({ data: { codigo } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Código aceito — sessão liberada");
        setCodigo("");
        diagMut.mutate(false);
      } else {
        toast.error(r.mensagem ?? "Código recusado");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const searchMut = useMutation({
    mutationFn: () =>
      consulta({
        data: {
          origem,
          destino,
          ida,
          volta: volta || null,
          adultos,
          criancas,
        },
      }),
    onSuccess: (r) => {
      if (r.success) toast.success(`${r.results.length} resultado(s) normalizado(s)`);
      else toast.error(`${r.error}: ${r.message ?? ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = diagMut.data;
  const r = searchMut.data;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Conector FRT — ambiente de teste</h1>
        <p className="text-sm text-muted-foreground">
          Somente consulta. O conector nunca reserva, adiciona ao carrinho nem altera dados
          no portal.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <PlugZap className="size-4" /> Diagnóstico de conexão
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => diagMut.mutate(false)}
              disabled={diagMut.isPending}
              size="sm"
              variant="outline"
            >
              Testar sessão
            </Button>
            <Button onClick={() => diagMut.mutate(true)} disabled={diagMut.isPending} size="sm">
              {diagMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Novo login"}
            </Button>
          </div>
        </div>

        {d ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant={d.autenticado ? "default" : "destructive"}>
                {d.autenticado ? "Sessão autenticada" : "Não autenticado"}
              </Badge>
              <Badge variant={d.viewStatePresente ? "secondary" : "destructive"}>
                ViewState {d.viewStatePresente ? "ok" : "ausente"}
              </Badge>
              <Badge variant="outline">Cookies: {d.cookies.join(", ") || "—"}</Badge>
            </div>
            {d.aguardandoCodigo ? (
              <div className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-50/50 p-3 dark:bg-amber-950/20">
                <p className="text-sm">
                  A FRT enviou um código de verificação para o e-mail cadastrado. Informe-o
                  abaixo para liberar a sessão do conector.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Código do e-mail"
                    className="max-w-[220px]"
                  />
                  <Button
                    size="sm"
                    disabled={codigoMut.isPending || codigo.trim().length < 3}
                    onClick={() => codigoMut.mutate()}
                  >
                    {codigoMut.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Validar código"
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
            {d.erro ? (
              <p className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-4" /> {d.erro} — {d.mensagem}
              </p>
            ) : null}
            {d.camposAlterados?.length ? (
              <p className="text-amber-600">
                Campos redetectados: {d.camposAlterados.join(" | ")}
              </p>
            ) : null}
            {d.camposAusentes?.length ? (
              <p className="text-destructive">
                Campos ausentes: {d.camposAusentes.join(", ")}
              </p>
            ) : null}
            {d.campos ? (
              <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs">
                {JSON.stringify(d.campos, null, 2)}
              </pre>
            ) : null}
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Log técnico (mascarado)
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-3 text-[11px]">
                {d.log.join("\n")}
              </pre>
            </details>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Search className="size-4" /> Pesquisa (read-only)
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <div className="space-y-1">
            <Label htmlFor="frt-origem">Origem</Label>
            <Input id="frt-origem" value={origem} onChange={(e) => setOrigem(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="frt-destino">Destino</Label>
            <Input id="frt-destino" value={destino} onChange={(e) => setDestino(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="frt-ida">Ida</Label>
            <Input id="frt-ida" type="date" value={ida} onChange={(e) => setIda(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="frt-volta">Volta</Label>
            <Input id="frt-volta" type="date" value={volta} onChange={(e) => setVolta(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="frt-adt">Adultos</Label>
            <Input
              id="frt-adt"
              type="number"
              min={1}
              max={9}
              value={adultos}
              onChange={(e) => setAdultos(Number(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="frt-chd">Crianças</Label>
            <Input
              id="frt-chd"
              type="number"
              min={0}
              max={9}
              value={criancas}
              onChange={(e) => setCriancas(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <Button onClick={() => searchMut.mutate()} disabled={searchMut.isPending}>
          {searchMut.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Consultando FRT…
            </>
          ) : (
            "Consultar"
          )}
        </Button>

        {r ? (
          <>
            <Separator />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={r.success ? "default" : "destructive"}>
                {r.success ? "Sucesso" : (r.error ?? "Erro")}
              </Badge>
              <Badge variant="outline">{r.results.length} resultados normalizados</Badge>
              <Badge variant="outline">Disponíveis: {r.availableResults}</Badge>
              <span className="text-muted-foreground">{r.searchedAt}</span>
            </div>
            {r.message ? <p className="text-sm text-destructive">{r.message}</p> : null}
            <pre className="max-h-[420px] overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(r, null, 2)}
            </pre>
          </>
        ) : null}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" /> Credenciais e cookies permanecem apenas no
        backend; o navegador recebe somente JSON normalizado.
      </p>
    </div>
  );
}
