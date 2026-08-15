import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlugZap, Search, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  consultarFrt,
  diagnosticarFrt,
  diagnosticarPesquisaFrt,
  enviarCodigoFrt,
  poll2faFrt,
  buscaAutomatica2faFrt,
  estado2faFrt,
  cancelar2faFrt,
} from "@/lib/frt/frt.functions";
import {
  FrtLocalAutocomplete,
  type FrtAutocompleteDiag,
  type FrtLocalSelecionado,
} from "@/components/frt/FrtLocalAutocomplete";

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
  const diagPesquisa = useServerFn(diagnosticarPesquisaFrt);
  const poll2fa = useServerFn(poll2faFrt);
  const ativarAuto = useServerFn(buscaAutomatica2faFrt);
  const estado2fa = useServerFn(estado2faFrt);
  const cancelar2fa = useServerFn(cancelar2faFrt);
  const [codigo, setCodigo] = useState("");
  const aguardando2faRef = useRef(false);

  const [origem, setOrigem] = useState("MGF");
  const [destino, setDestino] = useState("SSA");
  const [selOrigem, setSelOrigem] = useState<FrtLocalSelecionado | null>(null);
  const [selDestino, setSelDestino] = useState<FrtLocalSelecionado | null>(null);
  const [ida, setIda] = useState("2026-09-23");
  const [volta, setVolta] = useState("2026-09-30");
  const [adultos, setAdultos] = useState(2);
  const [criancas, setCriancas] = useState(0);
  const [diagAuto, setDiagAuto] = useState<Record<string, FrtAutocompleteDiag>>({});
  const registrarDiagAuto = useCallback(
    (d: FrtAutocompleteDiag) => setDiagAuto((prev) => ({ ...prev, [d.componente]: d })),
    [],
  );


  const diagMut = useMutation({
    mutationFn: (novaSessao?: boolean) => diag({ data: { novaSessao: Boolean(novaSessao) } }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Desafio 2FA pendente: enquanto existir, nenhum novo login pode ser disparado.
  const pend = useQuery({
    queryKey: ["frt-2fa"],
    queryFn: () => (aguardando2faRef.current ? poll2fa({ data: undefined }) : estado2fa({ data: undefined })),
    refetchInterval: (q) => (q.state.data?.pendente ? 4_000 : 15_000),
  });
  const aguardando2fa = Boolean(pend.data?.pendente) || Boolean(diagMut.data?.aguardandoCodigo);
  aguardando2faRef.current = aguardando2fa;

  const autoMut = useMutation({
    mutationFn: () => ativarAuto({ data: { ativo: true } }),
    onSettled: () => pend.refetch(),
  });
  const cancelarMut = useMutation({
    mutationFn: () => cancelar2fa({ data: undefined }),
    onSuccess: () => {
      toast.message("Desafio 2FA descartado — novo login liberado");
      pend.refetch();
    },
  });
  const codigoMut = useMutation({
    mutationFn: () => enviarCodigo({ data: { codigo } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Código aceito — sessão liberada");
        setCodigo("");
        pend.refetch();
        diagMut.mutate(false);
      } else {
        toast.error(r.mensagem ?? "Código recusado");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // A pesquisa só usa origem/destino efetivamente selecionados na lista da FRT.
  const prontoParaConsultar = Boolean(selOrigem && selDestino);
  const dadosPesquisa = () => ({
    origem: selOrigem?.value ?? origem,
    destino: selDestino?.value ?? destino,
    origemLabel: selOrigem?.label,
    destinoLabel: selDestino?.label,
    origemValue: selOrigem?.value,
    destinoValue: selDestino?.value,
    ida,
    volta: volta || null,
    adultos,
    criancas,
  });

  const searchMut = useMutation({
    mutationFn: () => consulta({ data: dadosPesquisa() }),
    onSuccess: (r) => {
      if (r.success) toast.success(`${r.results.length} resultado(s) normalizado(s)`);
      else toast.error(`${r.error}: ${r.message ?? ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const diagPesqMut = useMutation({
    mutationFn: () => diagPesquisa({ data: dadosPesquisa() }),
    onError: (e: Error) => toast.error(e.message),
  });


  const dp = diagPesqMut.data;
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

      {aguardando2fa ? (
        <section className="space-y-3 rounded-xl border border-amber-400/50 bg-amber-50/60 p-4 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-4" /> Código de verificação necessário
          </div>
          <p className="text-sm text-muted-foreground">
            A FRT enviou um código por e-mail e a autenticação está pausada nesta tentativa
            (sessão e ViewState preservados). Novos logins estão bloqueados até a validação.
            {pend.data?.segundos ? ` Aguardando há ${pend.data.segundos}s.` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
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
              {codigoMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Validar código"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={autoMut.isPending || Boolean(pend.data?.autoBusca)}
              onClick={() => autoMut.mutate()}
            >
              {autoMut.isPending || pend.data?.autoBusca ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Buscar código automático"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={cancelarMut.isPending}
              onClick={() => cancelarMut.mutate()}
            >
              Descartar desafio
            </Button>
          </div>
          {pend.data?.autoMensagem ? (
            <p className="text-xs text-amber-700">{pend.data.autoMensagem}</p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <PlugZap className="size-4" /> Diagnóstico de conexão
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => diagMut.mutate(false)}
              disabled={diagMut.isPending || aguardando2fa}
              size="sm"
              variant="outline"
            >
              Testar sessão
            </Button>
            <Button
              onClick={() => diagMut.mutate(true)}
              disabled={diagMut.isPending || aguardando2fa}
              size="sm"
            >
              {diagMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Novo login"}
            </Button>
          </div>
        </div>

        {d ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant={d.sessaoValida ? "default" : "destructive"}>
                Login/2FA {d.sessaoValida ? "ok" : "pendente"}
              </Badge>
              <Badge
                variant={
                  d.acessoVenda?.estado === "ok"
                    ? "default"
                    : d.acessoVenda
                      ? "destructive"
                      : "outline"
                }
              >
                Tela de venda{" "}
                {d.acessoVenda?.estado === "ok"
                  ? "ok (motor de pesquisa)"
                  : d.acessoVenda?.estado === "login"
                    ? "voltou pro login"
                    : d.acessoVenda?.estado === "2fa"
                      ? "aguardando código"
                      : d.acessoVenda?.estado === "erro_http"
                        ? `erro HTTP ${d.acessoVenda.status}`
                        : d.acessoVenda
                          ? "shell/AJAX (não carregada)"
                          : "não validada"}
              </Badge>
              <Badge variant={d.viewStatePresente ? "secondary" : "destructive"}>
                ViewState {d.viewStatePresente ? "ok" : "ausente"}
              </Badge>
              <Badge variant="outline">Cookies: {d.cookies.join(", ") || "—"}</Badge>
            </div>
            {d.acessoVenda ? (
              <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p>
                  GET venda.xhtml → status {d.acessoVenda.status} · {d.acessoVenda.tamanhoHtml}{" "}
                  bytes · URL final: {d.acessoVenda.urlFinal}
                </p>
                <p>
                  frmMotorPacote: {String(d.acessoVenda.temFormulario)} ·
                  btnMotorPacotePesquisa: {String(d.acessoVenda.temBotaoPesquisa)} ·
                  login-usuario-input: {String(d.acessoVenda.temLogin)} · auth.xhtml:{" "}
                  {String(d.acessoVenda.temAuthXhtml)} · ViewState:{" "}
                  {String(d.acessoVenda.viewStatePresente)}
                </p>
                <p>Título: {d.acessoVenda.titulo ?? "—"}</p>
                <p>Formulários: {d.acessoVenda.formularios.join(" | ") || "nenhum"}</p>
                <p>Redirects: {d.acessoVenda.redirects.join(" | ") || "nenhum"}</p>
              </div>
            ) : null}
            {d.amostraHtml ? (
              <details className="rounded-lg border p-3 text-xs">
                <summary className="cursor-pointer">
                  Amostra sanitizada do HTML ({d.amostraHtml.estado} ·{" "}
                  {new Date(d.amostraHtml.em).toLocaleString("pt-BR")})
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all">
                  {d.amostraHtml.html}
                </pre>
              </details>
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
          <div className="col-span-2 md:col-span-2">
            <FrtLocalAutocomplete
              id="frt-origem"
              rotulo="Origem"
              componente="origem"
              termo={origem}
              onTermoChange={setOrigem}
              selecionado={selOrigem}
              onSelecionar={setSelOrigem}
              onDiagnostico={registrarDiagAuto}
            />
          </div>
          <div className="col-span-2 md:col-span-2">
            <FrtLocalAutocomplete
              id="frt-destino"
              rotulo="Destino"
              componente="destino"
              termo={destino}
              onTermoChange={setDestino}
              selecionado={selDestino}
              onSelecionar={setSelDestino}
              onDiagnostico={registrarDiagAuto}
            />
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

        {Object.keys(diagAuto).length > 0 ? (
          <div className="space-y-3 rounded-lg border p-3 text-xs">
            <p className="font-medium text-foreground">Diagnóstico do autocomplete (query)</p>
            {(["origem", "destino"] as const).map((c) => {
              const a = diagAuto[c];
              if (!a) return null;
              const pendente = a.status === 0 && !a.erro;
              return (
                <div key={c} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{c}</Badge>
                    <Badge variant="outline">termo “{a.termo}”</Badge>
                    <Badge variant={a.disparado ? "default" : "destructive"}>
                      chamada {a.disparado ? "disparada" : "não disparada"}
                    </Badge>
                    <Badge variant="outline">
                      status {pendente ? "aguardando…" : a.status || "—"}
                    </Badge>
                    <Badge variant="outline">{a.bytes} bytes</Badge>
                    <Badge variant={a.dataItemValue > 0 ? "default" : "destructive"}>
                      data-item-value: {a.dataItemValue}
                    </Badge>
                    <Badge variant={a.opcoes.length > 0 ? "default" : "secondary"}>
                      opções: {a.opcoes.length}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">source: {a.source}</p>
                  <p className="text-muted-foreground">
                    updates:{" "}
                    {a.updates.length
                      ? a.updates.map((u) => `${u.id} (${u.bytes}b)`).join(" | ")
                      : "nenhum"}
                  </p>
                  {a.opcoes.length ? (
                    <p className="text-muted-foreground">
                      primeiras opções:{" "}
                      {a.opcoes.map((o) => `${o.label} [${o.value}]`).join(" · ")}
                    </p>
                  ) : null}
                  {a.erro ? <p className="text-destructive">erro: {a.erro}</p> : null}
                  {a.amostra ? (
                    <details>
                      <summary className="cursor-pointer text-muted-foreground">
                        Amostra sanitizada da resposta PrimeFaces (0 opções)
                      </summary>
                      <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-3 text-[11px]">
                        {a.amostra}
                      </pre>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {!prontoParaConsultar ? (
          <p className="text-xs text-amber-600">
            Selecione origem e destino na lista do autocomplete da FRT para liberar a consulta.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => searchMut.mutate()}
            disabled={searchMut.isPending || !prontoParaConsultar}
          >
            {searchMut.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Consultando FRT…
              </>
            ) : (
              "Consultar"
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => diagPesqMut.mutate()}
            disabled={diagPesqMut.isPending || !prontoParaConsultar}
          >

            {diagPesqMut.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Diagnosticando…
              </>
            ) : (
              "Diagnosticar POST de pesquisa"
            )}
          </Button>
        </div>

        {dp ? (
          <div className="space-y-2 rounded-lg border p-3 text-xs">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">status {dp.amostraPesquisa?.status ?? "—"}</Badge>
              <Badge variant="outline">{dp.amostraPesquisa?.bytes ?? 0} bytes</Badge>
              <Badge variant={dp.amostraPesquisa?.temPnlResultado ? "default" : "destructive"}>
                pnlResultado {dp.amostraPesquisa?.temPnlResultado ? "presente" : "ausente"} (
                {dp.amostraPesquisa?.pnlResultadoBytes ?? 0}b)
              </Badge>
              <Badge variant={dp.amostraPesquisa?.temPrecos ? "default" : "secondary"}>
                preços: {dp.amostraPesquisa?.qtdPrecos ?? 0}
              </Badge>
              <Badge variant={dp.amostraPesquisa?.validationFailed ? "destructive" : "outline"}>
                validationFailed: {dp.amostraPesquisa?.validationFailed ? "true" : "false"}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              updates:{" "}
              {dp.amostraPesquisa?.updates.length
                ? dp.amostraPesquisa.updates.map((u) => `${u.id} (${u.bytes}b)`).join(" | ")
                : "nenhum"}
            </p>
            {dp.amostraPesquisa?.amostraPrecos.length ? (
              <p className="text-muted-foreground">
                amostra de preços: {dp.amostraPesquisa.amostraPrecos.join(" · ")}
              </p>
            ) : null}
            <p className="text-muted-foreground">
              mensagem &quot;nenhum resultado&quot;:{" "}
              {dp.amostraPesquisa?.mensagemNenhumResultado ?? "—"}
            </p>
            <p className="text-muted-foreground">
              payload interno: origem={dp.amostraPesquisa?.payloadResolvido?.origem ?? "—"} · destino=
              {dp.amostraPesquisa?.payloadResolvido?.destino ?? "—"}
            </p>
            {dp.amostraPesquisa?.autocomplete?.length ? (
              <div className="space-y-1 text-muted-foreground">
                <p className="font-medium text-foreground">Diagnóstico AJAX dos autocompletes</p>
                {dp.amostraPesquisa.autocomplete.map((item) => (
                  <p key={item.componente}>
                    {item.componente}: source={item.source} · status {item.status} · {item.bytes}b · updates={item.updates.map((update) => `${update.id} (${update.bytes}b)`).join(", ") || "nenhum"} · j_idt={item.camposJsf.join(", ") || "nenhum"}
                  </p>
                ))}
              </div>
            ) : null}
            {dp.amostraPesquisa?.inventario ? (
              <details open>
                <summary className="cursor-pointer text-muted-foreground">
                  Campos do frmMotorPacote (
                  {dp.amostraPesquisa.inventario.campos.length}) — form{" "}
                  {dp.amostraPesquisa.inventario.encontrouForm ? "encontrado" : "não encontrado"}
                </summary>
                <div className="mt-2 overflow-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left">id</th>
                        <th className="text-left">name</th>
                        <th className="text-left">type</th>
                        <th className="text-left">valor</th>
                        <th className="text-left">widgetVar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dp.amostraPesquisa.inventario.campos.map((c, i) => (
                        <tr key={`${c.id ?? c.name ?? "campo"}-${i}`} className="border-t">
                          <td className="break-all pr-2">{c.id ?? "—"}</td>
                          <td className="break-all pr-2">{c.name ?? "—"}</td>
                          <td className="pr-2">{c.type ?? c.tag}</td>
                          <td className="break-all pr-2">{c.valor}</td>
                          <td className="break-all">{c.widgetVar ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-muted-foreground">
                  widgets: {dp.amostraPesquisa.inventario.widgets.join(", ") || "—"}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground">
                    Scripts idAeroOrigem / idAeroDestino (
                    {dp.amostraPesquisa.inventario.scriptsAutocomplete.length})
                  </summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all">
                    {dp.amostraPesquisa.inventario.scriptsAutocomplete.join("\n\n---\n\n") ||
                      "(nenhum script encontrado)"}
                  </pre>
                </details>
              </details>
            ) : null}
            <details>
              <summary className="cursor-pointer text-muted-foreground">
                Resposta bruta sanitizada
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all">
                {dp.amostraPesquisa?.raw ?? "(sem amostra)"}
              </pre>
            </details>
            <details>
              <summary className="cursor-pointer text-muted-foreground">Log técnico</summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-3 text-[11px]">
                {dp.log.join("\n")}
              </pre>
            </details>
          </div>
        ) : null}

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
