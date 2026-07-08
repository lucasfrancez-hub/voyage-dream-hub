import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Link2, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { bitrixCheckoutUrl, whatsappUrl } from "@/lib/checkout-config";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/admin/link-pagamento")({
  component: LinkGenerator,
});

function LinkGenerator() {
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [installments, setInstallments] = useState(10);
  const [orderId, setOrderId] = useState("");

  const totalNumber = Number(total.replace(",", ".")) || 0;

  const url = useMemo(() => {
    if (!totalNumber) return "";
    return bitrixCheckoutUrl({
      installments,
      total: totalNumber,
      orderId: orderId || undefined,
      packageTitle: description || customer || undefined,
    });
  }, [totalNumber, installments, orderId, description, customer]);

  const whatsMessage = url
    ? `Olá${customer ? ` ${customer}` : ""}! Segue seu link de pagamento seguro Via Air:\n\n💳 ${description || "Pagamento"}\n💰 Total: ${formatBRL(totalNumber)} em ${installments}x de ${formatBRL(totalNumber / installments)}${installments <= 10 ? " sem juros" : ""}\n\n🔒 ${url}\n\nQualquer dúvida estamos à disposição.`
    : "";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
        <Link2 className="h-4 w-4" /> Gerar link de pagamento
      </div>
      <h1 className="mt-1 font-display text-3xl font-bold">Link do cofre Bitrix</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Monte um link personalizado com valor e parcelas para enviar ao cliente por WhatsApp ou e-mail.
      </p>

      <div className="mt-8 grid lg:grid-cols-[1fr_400px] gap-6">
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <Field label="Nome do cliente">
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className={inputCls}
              placeholder="Lucas Silva"
            />
          </Field>
          <Field label="Telefone / WhatsApp do cliente">
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
              placeholder="5544999999999"
            />
          </Field>
          <Field label="Descrição / referência">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputCls}
              placeholder="Pacote Cancún 5 dias"
            />
          </Field>
          <Field label="ID do pedido (opcional)">
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className={inputCls}
              placeholder="Ex.: número do orçamento no CRM"
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Valor total (R$) *">
              <input
                required
                inputMode="decimal"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className={inputCls}
                placeholder="4999.90"
              />
            </Field>
            <Field label="Parcelas">
              <select
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className={inputCls}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x{n <= 10 ? " sem juros" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <aside className="rounded-2xl border border-border bg-card p-6 space-y-4 lg:sticky lg:top-24 h-fit">
          <h2 className="font-semibold">Resumo</h2>
          <div className="text-3xl font-display font-bold text-brand-orange">
            {totalNumber ? formatBRL(totalNumber) : "R$ —"}
          </div>
          {totalNumber > 0 && (
            <div className="text-xs text-muted-foreground">
              {installments}x de {formatBRL(totalNumber / installments)}
              {installments <= 10 ? " sem juros" : ""}
            </div>
          )}

          <div className="pt-3 border-t border-border">
            <label className="text-xs text-muted-foreground">Link gerado</label>
            <textarea
              readOnly
              value={url}
              className={`${inputCls} mt-1 min-h-[80px] font-mono text-xs`}
              placeholder="Preencha o valor para gerar…"
            />
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              disabled={!url}
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast.success("Link copiado");
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
              className={`inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm hover:border-brand-orange transition ${!url ? "pointer-events-none opacity-50" : ""}`}
            >
              <ExternalLink className="h-4 w-4" /> Abrir no cofre
            </a>
            <a
              href={url ? (customerPhone ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(whatsMessage)}` : whatsappUrl(whatsMessage)) : "#"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!url}
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

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}
