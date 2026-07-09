import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Link2, Copy, ExternalLink, MessageCircle, Vault, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { paymentLinkUrl, whatsappUrl, splitInstallments } from "@/lib/checkout-config";
import { formatBRL } from "@/lib/format";
import { saveCofreEntry } from "@/lib/cofre-storage";

export const Route = createFileRoute("/admin/link-pagamento")({
  component: LinkGenerator,
});

function LinkGenerator() {
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [total, setTotal] = useState("");
  const [installments, setInstallments] = useState(10);
  const [orderRef, setOrderRef] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [locator, setLocator] = useState("");
  const [tripRoute, setTripRoute] = useState("");
  const [travelDate, setTravelDate] = useState("");

  const [imageUrl, setImageUrl] = useState("");
  const [mode, setMode] = useState<"equal" | "first-higher">("equal");
  const [firstAmount, setFirstAmount] = useState("");

  const totalNumber = Number(total.replace(",", ".")) || 0;
  const firstAmountNumber = Number(firstAmount.replace(",", ".")) || 0;
  const effectiveFirst =
    mode === "first-higher" && installments > 1 ? firstAmountNumber : undefined;

  const split = splitInstallments(totalNumber, installments, effectiveFirst);

  const url = useMemo(() => {
    if (!totalNumber || !description || !supplier.trim()) return "";
    return paymentLinkUrl({
      description,
      total: totalNumber,
      installments,
      firstAmount: effectiveFirst,
      orderRef: orderRef || undefined,
      orderNumber: orderNumber.trim() || undefined,
      customerName: customer || undefined,
      imageUrl: imageUrl || undefined,
      supplier: supplier.trim(),
    });
  }, [totalNumber, installments, orderRef, orderNumber, description, customer, effectiveFirst, imageUrl, supplier]);


  const parcelaLabel = split.equal
    ? `${installments}x de ${formatBRL(split.first)} sem juros`
    : `1ª de ${formatBRL(split.first)} + ${split.restCount}x de ${formatBRL(split.rest)}`;

  const whatsMessage = url
    ? `Olá${customer ? ` ${customer}` : ""}! Segue seu link de pagamento seguro Via Air:\n\n💳 ${description}\n💰 Total: ${formatBRL(totalNumber)}\n📆 ${parcelaLabel}\n\n🔒 ${url}\n\nQualquer dúvida estamos à disposição.`
    : "";

  function persistToCofre() {
    if (!url) return;
    saveCofreEntry({
      customer: customer || undefined,
      customerPhone: customerPhone || undefined,
      description,
      total: totalNumber,
      installments,
      firstAmount: effectiveFirst,
      orderRef: orderRef || undefined,
      orderNumber: orderNumber.trim() || undefined,
      imageUrl: imageUrl || undefined,
      url,
    });
  }


  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
            <Link2 className="h-4 w-4" /> Gerar link de pagamento
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">Link do cofre Via Air</h1>
        </div>
        <Link
          to="/admin/cofre"
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs hover:border-brand-orange transition"
        >
          <Vault className="h-4 w-4" /> Ver cofre
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Monte um link personalizado com valor e parcelas. O cliente abre em <code>/pagar</code>{" "}
        dentro do próprio domínio e preenche os dados do cartão.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-3 text-xs text-yellow-900 dark:text-yellow-200">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <strong>Atenção:</strong> para clientes vindo da internet, desconhecidos ou que você nunca atendeu, use sempre este
          <strong> link seguro</strong>.
          O link convencional é exclusivo para clientes já conhecidos e de confiança.
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-[1fr_400px] gap-6">
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <Field label="Nome do cliente">
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} className={cls} placeholder="Lucas Silva" />
          </Field>
          <Field label="Telefone / WhatsApp do cliente (com DDI)">
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ""))}
              className={cls}
              placeholder="5544999999999"
            />
          </Field>
          <Field label="Descrição / referência *">
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={cls} placeholder="Pacote Cancún 5 dias" />
          </Field>
          <Field label="Fornecedor (nome que aparecerá na fatura do cartão) *">
            <input required value={supplier} onChange={(e) => setSupplier(e.target.value)} className={cls} placeholder="Ex.: LATAM AIRLINES, CVC, Decolar" />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Quem aparecerá na fatura e no documento de autorização de débito. Pode ser Via Air, uma companhia aérea ou operadora.
            </span>
          </Field>
          <Field label="Número do pedido (opcional)">
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className={cls}
              placeholder="Ex.: localizador da cia (ABC123) ou ID da operadora"
              maxLength={40}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Aparecerá como número oficial do pedido no PDF de autorização de débito. Deixe em branco para usar o ID interno.
            </span>
          </Field>
          <Field label="Referência interna (opcional)">
            <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} className={cls} placeholder="Ex.: número do orçamento no CRM" />
          </Field>

          <Field label="Imagem do destino (URL) — aparece no topo do link do cliente">
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className={cls}
              placeholder="https://…foto-do-destino.jpg"
            />
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Prévia do destino"
                className="mt-2 h-28 w-full rounded-lg object-cover border border-border"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            )}
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Valor total (R$) *">
              <input required inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={cls} placeholder="4999.90" />
            </Field>
            <Field label="Parcelas">
              <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className={cls}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x sem juros
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="space-y-2 pt-2">
            <span className="block text-xs text-muted-foreground">Divisão das parcelas</span>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition ${mode === "equal" ? "border-brand-orange bg-brand-orange/5" : "border-border hover:border-brand-orange/50"}`}>
                <input type="radio" name="mode" checked={mode === "equal"} onChange={() => setMode("equal")} className="mt-0.5 accent-brand-orange" />
                <span className="text-sm">
                  <span className="block font-medium">Tudo dividido igual</span>
                  <span className="block text-xs text-muted-foreground">Todas as parcelas com o mesmo valor.</span>
                </span>
              </label>
              <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition ${mode === "first-higher" ? "border-brand-orange bg-brand-orange/5" : "border-border hover:border-brand-orange/50"}`}>
                <input type="radio" name="mode" checked={mode === "first-higher"} onChange={() => setMode("first-higher")} disabled={installments < 2} className="mt-0.5 accent-brand-orange" />
                <span className="text-sm">
                  <span className="block font-medium">1ª parcela mais alta</span>
                  <span className="block text-xs text-muted-foreground">Soma a taxa de embarque na 1ª parcela; o restante do total é dividido igualmente.</span>
                </span>
              </label>
            </div>
            {mode === "first-higher" && installments > 1 && (
              <Field label="Valor da taxa de embarque (R$)">
                <input
                  inputMode="decimal"
                  value={firstAmount}
                  onChange={(e) => setFirstAmount(e.target.value)}
                  className={cls}
                  placeholder="Ex.: 150.00"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Esse valor é somado à 1ª parcela. Se a parcela normal já for maior que a taxa, ela é ignorada e as parcelas ficam iguais.
                </span>
              </Field>
            )}
          </div>
        </section>

        <aside className="rounded-2xl border border-border bg-card p-6 space-y-4 lg:sticky lg:top-24 h-fit">
          <h2 className="font-semibold">Resumo</h2>
          <div className="text-3xl font-display font-bold text-brand-orange">
            {totalNumber ? formatBRL(totalNumber) : "R$ —"}
          </div>
          {totalNumber > 0 && (
            <div className="text-xs text-muted-foreground">{parcelaLabel}</div>
          )}

          <div className="pt-3 border-t border-border">
            <label className="text-xs text-muted-foreground">Link gerado</label>
            <textarea readOnly value={url} className={`${cls} mt-1 min-h-[90px] font-mono text-xs`} placeholder="Preencha descrição e valor para gerar…" />
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              disabled={!url}
              onClick={() => {
                navigator.clipboard.writeText(url);
                persistToCofre();
                toast.success("Link copiado e salvo no cofre");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-50"
            >
              <Copy className="h-4 w-4" /> Copiar link
            </button>
            <a
              href={url || "#"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!url}
              onClick={() => persistToCofre()}
              className={`inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm hover:border-brand-orange transition ${!url ? "pointer-events-none opacity-50" : ""}`}
            >
              <ExternalLink className="h-4 w-4" /> Abrir cofre
            </a>
            <a
              href={url ? (customerPhone ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(whatsMessage)}` : whatsappUrl(whatsMessage)) : "#"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!url}
              onClick={() => persistToCofre()}
              className={`inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm hover:border-brand-orange transition ${!url ? "pointer-events-none opacity-50" : ""}`}
            >
              <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

const cls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}
