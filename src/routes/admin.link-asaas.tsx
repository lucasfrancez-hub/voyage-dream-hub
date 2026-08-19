import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Copy, ExternalLink, MessageCircle, Trash2, Loader2, QrCode, Barcode } from "lucide-react";
import { toast } from "sonner";
import { confirmThen } from "@/lib/confirm";
import { formatBRL } from "@/lib/format";
import { criarLinkAsaas, listarLinksAsaas, excluirLinkAsaas, type AsaasLink } from "@/lib/asaas-links.functions";

export const Route = createFileRoute("/admin/link-asaas")({
  component: LinkAsaasPage,
  head: () => ({
    meta: [
      { title: "Link de pagamento ASAAS | VIA AIR" },
      { name: "description", content: "Crie links de pagamento ASAAS (Pix, boleto e cartão) direto pelo painel da VIA AIR." },
      { property: "og:title", content: "Link de pagamento ASAAS | VIA AIR" },
      { property: "og:description", content: "Gere e gerencie links de cobrança ASAAS da VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const FORMAS = [
  { key: "UNDEFINED", label: "Cliente escolhe" },
  { key: "PIX", label: "Pix" },
  { key: "BOLETO", label: "Boleto" },
  { key: "CREDIT_CARD", label: "Cartão" },
] as const;

const rotuloForma = (v: string) => FORMAS.find((f) => f.key === v)?.label ?? v;

function LinkAsaasPage() {
  const criar = useServerFn(criarLinkAsaas);
  const listar = useServerFn(listarLinksAsaas);
  const excluir = useServerFn(excluirLinkAsaas);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<(typeof FORMAS)[number]["key"]>("UNDEFINED");
  const [parcelado, setParcelado] = useState(false);
  const [parcelas, setParcelas] = useState(10);
  const [diasVencimento, setDiasVencimento] = useState("3");
  const [fim, setFim] = useState("");
  const [referencia, setReferencia] = useState("");
  const [telefone, setTelefone] = useState("");
  const [notificar, setNotificar] = useState(true);

  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [links, setLinks] = useState<AsaasLink[]>([]);
  const [criado, setCriado] = useState<AsaasLink | null>(null);

  const valorNumero = useMemo(() => Number(valor.replace(/\./g, "").replace(",", ".")) || 0, [valor]);

  const recarregar = async () => {
    setCarregando(true);
    try {
      setLinks(await listar());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar os links.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não consegui copiar o link.");
    }
  };

  const gerar = async () => {
    if (nome.trim().length < 2) return toast.error("Dê um nome para a cobrança.");
    setSalvando(true);
    try {
      const link = await criar({
        data: {
          name: nome.trim(),
          description: descricao.trim() || null,
          value: valorNumero > 0 ? valorNumero : null,
          billingType: forma,
          chargeType: parcelado ? "INSTALLMENT" : "DETACHED",
          maxInstallmentCount: parcelado ? parcelas : null,
          dueDateLimitDays: Number(diasVencimento) || null,
          endDate: fim || null,
          notificationEnabled: notificar,
          externalReference: referencia.trim() || null,
        },
      });
      setCriado(link);
      setLinks((atual) => [link, ...atual]);
      toast.success("Link criado no ASAAS.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar o link.");
    } finally {
      setSalvando(false);
    }
  };

  const remover = (l: AsaasLink) =>
    confirmThen(
      {
        title: "Excluir link",
        description: `O link "${l.name}" deixará de aceitar pagamentos. Deseja continuar?`,
        confirmText: "Excluir",
        destructive: true,
      },
      async () => {
        try {
          await excluir({ data: { id: l.id } });
          setLinks((atual) => atual.filter((x) => x.id !== l.id));
          if (criado?.id === l.id) setCriado(null);
          toast.success("Link excluído.");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao excluir.");
        }
      },
    );

  const zap = criado && telefone.replace(/\D/g, "").length >= 10
    ? `https://wa.me/55${telefone.replace(/\D/g, "").replace(/^55/, "")}?text=${encodeURIComponent(
        `Olá! Segue o link para pagamento:\n${criado.url}`,
      )}`
    : "";


  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Link de pagamento ASAAS</h1>
          <p className="text-sm text-muted-foreground">
            Gerado direto pela nossa API do ASAAS — Pix, boleto e cartão, com parcelamento.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Nome da cobrança</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Pacote Maceió — João Silva"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Valor (deixe vazio para o cliente digitar)</span>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="2500,00"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Descrição (aparece para o cliente)</span>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2}
              placeholder="Entrada do pacote, saída em 12/03, 2 passageiros."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </label>

          <div className="text-sm">
            <span className="mb-1 block font-medium">Forma de pagamento</span>
            <div className="flex flex-wrap gap-2">
              {FORMAS.map((f) => (
                <button key={f.key} type="button" onClick={() => setForma(f.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    forma === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-sm">
            <span className="mb-1 block font-medium">Parcelamento</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={parcelado} onChange={(e) => setParcelado(e.target.checked)} />
                Permitir parcelar
              </label>
              <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} disabled={!parcelado}
                className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-50">
                {Array.from({ length: 21 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>até {n}x</option>
                ))}
              </select>
            </div>
          </div>

          <label className="text-sm">
            <span className="mb-1 block font-medium">Vencimento (dias após abrir o link)</span>
            <input value={diasVencimento} onChange={(e) => setDiasVencimento(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Link válido até (opcional)</span>
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Referência interna (pedido)</span>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="PED-1234"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">WhatsApp do cliente (opcional)</span>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="44999999999"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
            <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} />
            Enviar notificações de cobrança pelo ASAAS
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={gerar} disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Criar link no ASAAS
          </button>
          {valorNumero > 0 && (
            <span className="text-xs text-muted-foreground">Valor: {formatBRL(valorNumero)}</span>
          )}
        </div>

        {criado && (
          <div className="mt-5 rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-primary">Link pronto</div>
            <div className="mt-1 break-all text-sm">{criado.url}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => copiar(criado.url)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                <Copy className="h-3.5 w-3.5" /> Copiar
              </button>
              <a href={criado.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </a>
              {zap && (
                <a href={zap} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                  <MessageCircle className="h-3.5 w-3.5" /> Enviar no WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">Links criados</h2>
        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum link criado ainda.</p>
        ) : (
          <div className="space-y-2">
            {links.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {l.billingType === "PIX" ? <QrCode className="h-3 w-3" /> : l.billingType === "BOLETO" ? <Barcode className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
                      {rotuloForma(l.billingType)}
                    </span>
                    {l.value ? <span>{formatBRL(l.value)}</span> : <span>valor livre</span>}
                    {l.chargeType === "INSTALLMENT" && l.maxInstallmentCount ? <span>até {l.maxInstallmentCount}x</span> : null}
                    {!l.active && <span className="text-destructive">inativo</span>}
                  </div>
                </div>
                <button onClick={() => copiar(l.url)} title="Copiar link"
                  className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">
                  <Copy className="h-4 w-4" />
                </button>
                <a href={l.url} target="_blank" rel="noreferrer" title="Abrir"
                  className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button onClick={() => remover(l)} title="Excluir"
                  className="rounded-lg border border-border p-2 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
