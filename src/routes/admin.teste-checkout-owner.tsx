import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ownerConsultarCarrinho,
  ownerExtrairCartId,
  ownerGravarPassageiros,
  ownerSolicitar2fa,
  ownerValidar2fa,
} from "@/lib/owner-checkout/owner-checkout.functions";

export const Route = createFileRoute("/admin/teste-checkout-owner")({
  head: () => ({
    meta: [
      { title: "Teste Checkout Owner | VIA AIR" },
      {
        name: "description",
        content:
          "Ambiente interno de homologação do checkout Owner: cartId, 2FA, consulta do carrinho, passageiros e link final de pagamento.",
      },
      { property: "og:title", content: "Teste Checkout Owner | VIA AIR" },
      {
        property: "og:description",
        content: "Homologação ponta a ponta do fluxo de checkout Owner.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TesteCheckoutOwnerPage,
});

type Passageiro = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: number;
  title: string;
  passengerTypeCode: string;
  documentTypeId: number;
  documentNumber: string;
  nationalityCountryId: number;
  emailAddress: string;
  ddi: number;
  phoneNumber: string;
};

const passageiroVazio = (): Passageiro => ({
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: 1,
  title: "MR",
  passengerTypeCode: "ADT",
  documentTypeId: 1,
  documentNumber: "",
  nationalityCountryId: 30,
  emailAddress: "",
  ddi: 55,
  phoneNumber: "",
});

type LogItem = { ok: boolean; texto: string; detalhe?: string };

function fmtData(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const temHora = /\d{2}:\d{2}/.test(v);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(temHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}


function LogLinha({ item }: { item: LogItem }) {
  return (
    <li className="flex flex-col gap-0.5 py-1">
      <span className={item.ok ? "text-emerald-600" : "text-destructive"}>
        {item.ok ? "✓" : "✗"} {item.texto}
      </span>
      {item.detalhe ? (
        <span className="pl-4 text-xs text-muted-foreground break-all">{item.detalhe}</span>
      ) : null}
    </li>
  );
}

function TesteCheckoutOwnerPage() {
  const extrair = useServerFn(ownerExtrairCartId);
  const solicitar = useServerFn(ownerSolicitar2fa);
  const validar = useServerFn(ownerValidar2fa);
  const consultar = useServerFn(ownerConsultarCarrinho);
  const gravar = useServerFn(ownerGravarPassageiros);

  const [entrada, setEntrada] = useState("");
  const [cartId, setCartId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  // JWT vive só nesta sessão de teste (memória do componente). Nunca persistido.
  const [token, setToken] = useState<string | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [passageiros, setPassageiros] = useState<Passageiro[]>([passageiroVazio()]);
  const [checkout, setCheckout] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ultimaConsulta, setUltimaConsulta] = useState<
    Awaited<ReturnType<typeof ownerConsultarCarrinho>> | null
  >(null);


  const addLog = (item: LogItem) => setLog((l) => [...l, item]);
  const logErro = (
    texto: string,
    call?: { endpoint: string; method: string; status: number; message?: string | null },
  ) =>
    addLog({
      ok: false,
      texto,
      detalhe: call
        ? `${call.method} ${call.endpoint} → HTTP ${call.status}${call.message ? ` · ${call.message}` : ""}`
        : undefined,
    });

  const extrairMut = useMutation({
    mutationFn: () => extrair({ data: { entrada } }),
    onSuccess: (r) => {
      if (r.cartId) {
        setCartId(r.cartId);
        addLog({ ok: true, texto: "cartId identificado", detalhe: r.cartId });
      } else {
        setCartId(null);
        logErro("cartId não encontrado no link informado");
      }
    },
    onError: (e: Error) => logErro(e.message),
  });

  const solicitarMut = useMutation({
    mutationFn: () => solicitar({ data: undefined }),
    onSuccess: (r) => {
      if (r.success) addLog({ ok: true, texto: "2FA solicitado (lucas@voeair.com)" });
      else logErro("Falha ao solicitar 2FA", r.call);
    },
    onError: (e: Error) => logErro(e.message),
  });

  const validarMut = useMutation({
    mutationFn: () => validar({ data: { codigo } }),
    onSuccess: (r) => {
      if (r.success && r.token) {
        setToken(r.token);
        addLog({ ok: true, texto: "2FA validado" });
        addLog({ ok: true, texto: "JWT obtido (somente nesta sessão de teste)" });
      } else {
        logErro("Código 2FA recusado", r.call);
      }
    },
    onError: (e: Error) => logErro(e.message),
  });

  const TIMEOUT_MS = 120_000;
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Consulta em loop até a Owner consolidar (ou estourar 2 min). */
  const aguardar = async (
    pronto: (r: Awaited<ReturnType<typeof ownerConsultarCarrinho>>) => boolean,
    rotulo: string,
  ) => {
    const inicio = Date.now();
    let tentativa = 0;
    for (;;) {
      tentativa += 1;
      const r = await consultar({ data: { cartId: cartId!, token: token! } });
      setUltimaConsulta(r);
      if (!r.call.ok) throw new Error(`HTTP ${r.call.status}${r.call.message ? ` · ${r.call.message}` : ""}`);
      if (r.resumo?.cartExpired === true) throw new Error("carrinho EXPIRADO (cartExpired = true)");
      if (pronto(r)) return r;
      const restante = TIMEOUT_MS - (Date.now() - inicio);
      if (restante <= 0) {
        throw new Error(
          `${rotulo} não consolidou em 2 minutos${r.resumo?.faltando.length ? ` · faltando: ${r.resumo.faltando.join(", ")}` : ""}`,
        );
      }
      const segundos = Math.round((Date.now() - inicio) / 1000);
      setStatus(
        `${rotulo}... (tentativa ${tentativa} · ${segundos}s${r.resumo?.faltando.length ? ` · faltando: ${r.resumo.faltando.join(", ")}` : ""})`,
      );
      await espera(Math.min(4000, Math.max(3000, restante)));
    }
  };

  const carrinhoMut = useMutation({
    mutationFn: async () => {
      setStatus("Aguardando consolidação do carrinho...");
      return await aguardar((r) => r.carrinhoPronto, "Aguardando consolidação do carrinho");
    },
    onSuccess: () => {
      setStatus("Carrinho pronto");
      addLog({ ok: true, texto: "carrinho consolidado (trechos, preço e parcelamento)" });
    },
    onError: (e: Error) => {
      setStatus(null);
      logErro(`Carrinho não consolidado: ${e.message}`);
    },
  });


  const gravarMut = useMutation({
    mutationFn: async () => {
      addLog({ ok: true, texto: "passageiros enviados" });
      const r = await gravar({
        data: {
          cartId: cartId!,
          token: token!,
          passageiros: passageiros.map((p) => ({
            firstName: p.firstName.trim(),
            lastName: p.lastName.trim(),
            documentNumber: p.documentNumber.replace(/\D/g, ""),
            documentTypeId: Number(p.documentTypeId),
            dateOfBirth: p.dateOfBirth,
            gender: Number(p.gender),
            nationalityCountryId: Number(p.nationalityCountryId),
            passengerTypeCode: p.passengerTypeCode,
            typeCode: p.passengerTypeCode,
            title: p.title,
            contact: {
              emailAddress: p.emailAddress.trim(),
              ddi: Number(p.ddi),
              phoneNumber: p.phoneNumber.replace(/\D/g, ""),
            },
          })),
        },
      });
      if (!r.success) return { r, confirmado: false };
      setStatus("Aguardando processamento dos passageiros...");
      await aguardar((c) => c.checkoutPronto, "Aguardando processamento dos passageiros");
      return { r, confirmado: true };
    },
    onSuccess: ({ r, confirmado }) => {
      if (!r.success || !r.checkoutUrl) {
        setStatus(null);
        return logErro("Falha ao gravar passageiros", r.call);
      }
      addLog({ ok: true, texto: "passageiros gravados" });
      if (confirmado) {
        setStatus("Checkout pronto");
        addLog({ ok: true, texto: "Owner confirmou passageiros — checkout pronto" });
      }
      setCheckout(r.checkoutUrl);
      addLog({ ok: true, texto: "checkout final criado", detalhe: r.checkoutUrl });
    },
    onError: (e: Error) => {
      setStatus(null);
      logErro(e.message);
    },
  });

  const resumo = ultimaConsulta?.resumo ?? carrinhoMut.data?.resumo ?? null;

  const podeConsultar = Boolean(cartId && token);
  const copiar = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Link de pagamento copiado");
  };

  const setPax = (i: number, patch: Partial<Passageiro>) =>
    setPassageiros((l) => l.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const campos = useMemo(
    () =>
      [
        { k: "firstName", label: "Nome" },
        { k: "lastName", label: "Sobrenome" },
        { k: "dateOfBirth", label: "Nascimento (AAAA-MM-DD)" },
        { k: "documentNumber", label: "Número do documento" },
        { k: "emailAddress", label: "E-mail" },
        { k: "phoneNumber", label: "Telefone" },
      ] as const,
    [],
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Teste Checkout Owner</h1>
        <p className="text-sm text-muted-foreground">
          Homologação ponta a ponta: cartId → 2FA → carrinho → passageiros → link de pagamento.
          O código 2FA é digitado manualmente nesta versão.
        </p>
      </header>

      {/* 1. Entrada */}
      <section className="space-y-3 rounded-xl border p-4">
        <Label htmlFor="cart">Link/Carrinho Owner</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="cart"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder="Cole a URL do carrinho ou o cartId"
          />
          <Button onClick={() => extrairMut.mutate()} disabled={!entrada || extrairMut.isPending}>
            {extrairMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Identificar"}
          </Button>
        </div>
        {cartId ? <Badge variant="secondary">cartId: {cartId}</Badge> : null}
      </section>

      {/* 2 e 3. 2FA */}
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => solicitarMut.mutate()}
            disabled={solicitarMut.isPending}
          >
            {solicitarMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Solicitar 2FA (lucas@voeair.com)
          </Button>
          {token ? <Badge className="bg-emerald-600">JWT ativo nesta sessão</Badge> : null}
        </div>
        {solicitarMut.data?.success ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="codigo">Código 2FA</Label>
              <Input
                id="codigo"
                inputMode="numeric"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Código recebido por e-mail"
              />
            </div>
            <Button onClick={() => validarMut.mutate()} disabled={!codigo || validarMut.isPending}>
              {validarMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Validar"}
            </Button>
          </div>
        ) : null}
      </section>

      {/* 4. Carrinho */}
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Carrinho</h2>
          <Button
            variant="outline"
            onClick={() => carrinhoMut.mutate()}
            disabled={!podeConsultar || carrinhoMut.isPending}
          >
            {carrinhoMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Consultar"}
          </Button>
        </div>
        {status ? (
          <div className="flex items-center gap-2 text-sm">
            {carrinhoMut.isPending || gravarMut.isPending ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : null}
            <span
              className={
                status === "Carrinho pronto" || status === "Checkout pronto"
                  ? "text-emerald-600"
                  : "text-muted-foreground"
              }
            >
              {status}
            </span>
          </div>
        ) : null}
        {resumo ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>cartId: {resumo.cartId ?? "—"}</div>
            <div>cartExpired: {String(resumo.cartExpired)}</div>
            <div>cartType: {resumo.cartType ?? "—"}</div>
            <div>
              Passageiros esperados: {resumo.adultos ?? 0} ADT / {resumo.criancas ?? 0} CHD /{" "}
              {resumo.bebes ?? 0} INF
            </div>
            <div>
              Trecho: {resumo.origem ?? "—"} → {resumo.destino ?? "—"}
            </div>
            <div>
              Datas: {fmtData(resumo.ida)} {resumo.volta ? `· ${fmtData(resumo.volta)}` : ""}
            </div>
            <div>
              Preço:{" "}
              {resumo.total != null
                ? resumo.total.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: resumo.moeda === "USD" ? "USD" : "BRL",
                  })
                : "—"}
            </div>
            <div>Parcelamento: {resumo.parcelas ?? "—"}</div>
            {resumo.faltando.length ? (
              <div className="sm:col-span-2 text-amber-600">
                Pendente na Owner: {resumo.faltando.join(", ")}
              </div>
            ) : null}
            <div className="sm:col-span-2 space-y-1">
              {resumo.voos.map((v, i) => (
                <div key={i} className="text-muted-foreground">
                  {v.trecho} · {fmtData(v.data)} · {v.cia} {v.voo}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {ultimaConsulta ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Retorno bruto</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2">
              {ultimaConsulta.payloadJson}
            </pre>
          </details>
        ) : null}

      </section>

      {/* 5 e 6. Passageiros */}
      <section className="space-y-4 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Passageiros</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPassageiros((l) => [...l, passageiroVazio()])}
          >
            <Plus className="size-4" /> Adicionar
          </Button>
        </div>
        {passageiros.map((p, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Passageiro {i + 1}</span>
              {passageiros.length > 1 ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setPassageiros((l) => l.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {campos.map((c) => (
                <div key={c.k} className="space-y-1">
                  <Label htmlFor={`${c.k}-${i}`}>{c.label}</Label>
                  <Input
                    id={`${c.k}-${i}`}
                    value={String(p[c.k])}
                    onChange={(e) => setPax(i, { [c.k]: e.target.value } as Partial<Passageiro>)}
                  />
                </div>
              ))}
              <div className="space-y-1">
                <Label htmlFor={`gender-${i}`}>Sexo (1 masc / 2 fem)</Label>
                <Input
                  id={`gender-${i}`}
                  type="number"
                  value={p.gender}
                  onChange={(e) => setPax(i, { gender: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`title-${i}`}>Tratamento</Label>
                <Input
                  id={`title-${i}`}
                  value={p.title}
                  onChange={(e) => setPax(i, { title: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`type-${i}`}>Tipo de passageiro</Label>
                <Input
                  id={`type-${i}`}
                  value={p.passengerTypeCode}
                  onChange={(e) => setPax(i, { passengerTypeCode: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`doct-${i}`}>Tipo de documento (id)</Label>
                <Input
                  id={`doct-${i}`}
                  type="number"
                  value={p.documentTypeId}
                  onChange={(e) => setPax(i, { documentTypeId: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`nat-${i}`}>Nacionalidade (countryId)</Label>
                <Input
                  id={`nat-${i}`}
                  type="number"
                  value={p.nationalityCountryId}
                  onChange={(e) => setPax(i, { nationalityCountryId: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`ddi-${i}`}>DDI</Label>
                <Input
                  id={`ddi-${i}`}
                  type="number"
                  value={p.ddi}
                  onChange={(e) => setPax(i, { ddi: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
        ))}
        <Button
          onClick={() => gravarMut.mutate()}
          disabled={!podeConsultar || gravarMut.isPending}
        >
          {gravarMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Gravar passageiros
        </Button>
        {gravarMut.data ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Payload enviado / resposta
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2">
              {gravarMut.data.r.payloadEnviado}
              {"\n\n"}
              {gravarMut.data.r.respostaJson}
            </pre>
          </details>
        ) : null}
      </section>

      {/* 7. Link final */}
      {checkout ? (
        <section className="space-y-3 rounded-xl border border-emerald-500/50 p-4">
          <h2 className="font-medium">Checkout final</h2>
          <p className="text-sm break-all text-muted-foreground">{checkout}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={checkout} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Abrir checkout
              </a>
            </Button>
            <Button variant="outline" onClick={() => void copiar(checkout)}>
              <Copy className="size-4" /> Copiar link de pagamento
            </Button>
          </div>
        </section>
      ) : null}

      {/* 8. Log */}
      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="font-medium">Log de homologação</h2>
        <Separator />
        <ul className="font-mono text-sm">
          {log.length === 0 ? (
            <li className="text-muted-foreground">Nenhuma etapa executada ainda.</li>
          ) : (
            log.map((item, i) => <LogLinha key={i} item={item} />)
          )}
        </ul>
      </section>
    </div>
  );
}
