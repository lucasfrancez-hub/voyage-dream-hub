import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Copy, ExternalLink, MessageCircle, Vault } from "lucide-react";
import { toast } from "sonner";
import { paymentBoletoLinkUrl, whatsappUrl } from "@/lib/checkout-config";
import { formatBRL } from "@/lib/format";
import { saveCofreEntry } from "@/lib/cofre-storage";

export const Route = createFileRoute("/admin/link-boleto")({
  component: LinkBoletoGenerator,
});

function LinkBoletoGenerator() {
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const totalNumber = Number(total.replace(",", ".")) || 0;

  const url = useMemo(() => {
    if (!totalNumber || !description) return "";
    return paymentBoletoLinkUrl({
      description,
      total: totalNumber,
      orderRef: orderRef || undefined,
      customerName: customer || undefined,
      imageUrl: imageUrl || undefined,
    });
  }, [totalNumber, description, orderRef, customer, imageUrl]);

  const whatsMessage = url
    ? `Olá${customer ? ` ${customer}` : ""}! Segue o link para preencher a ficha de crédito Via Air (boleto bancário):\n\n📄 ${description}\n💰 Total: ${formatBRL(totalNumber)}\n\n🔒 ${url}\n\nApós o envio, um consultor entra em contato pelo WhatsApp com o resultado da análise.`
    : "";

  function persistToCofre() {
    if (!url) return;
    saveCofreEntry({
      customer: customer || undefined,
      customerPhone: customerPhone || undefined,
      description,
      total: totalNumber,
      installments: 1,
      orderRef: orderRef || undefined,
      imageUrl: imageUrl || undefined,
      url,
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
            <FileText className="h-4 w-4" /> Gerar link — Boleto bancário
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">Link de ficha de crédito</h1>
        </div>
        <Link
          to="/admin/cofre"
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs hover:border-brand-orange transition"
        >
          <Vault className="h-4 w-4" /> Ver cofre
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Envie ao cliente um link para preencher a ficha de crédito (passageiros + dados do financiador) do
        boleto bancário. O pedido chega em <code>/admin/pedidos</code> com todos os dados.
      </p>

      <div className="mt-8 grid lg:grid-cols-[1fr_400px] gap-6">
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
          <Field label="Referência interna (opcional)">
            <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} className={cls} placeholder="Ex.: número do orçamento no CRM" />
          </Field>
          <Field label="Imagem do destino (URL) — aparece no topo do link">
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
          <Field label="Valor total (R$) *">
            <input required inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={cls} placeholder="4999.90" />
          </Field>
        </section>

        <aside className="rounded-2xl border border-border bg-card p-6 space-y-4 lg:sticky lg:top-24 h-fit">
          <h2 className="font-semibold">Resumo</h2>
          <div className="text-3xl font-display font-bold text-brand-orange">
            {totalNumber ? formatBRL(totalNumber) : "R$ —"}
          </div>
          <div className="text-xs text-muted-foreground">
            Boleto bancário · sujeito à análise de crédito
          </div>

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
              <ExternalLink className="h-4 w-4" /> Abrir link
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
