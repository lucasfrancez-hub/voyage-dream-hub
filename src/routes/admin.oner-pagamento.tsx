import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnerPagamento } from "@/components/checkout/OnerPagamento";

export const Route = createFileRoute("/admin/oner-pagamento")({
  component: TestePagamento,
  head: () => ({
    meta: [
      { title: "Teste de pagamento aéreo | Admin Via Air" },
      { name: "description", content: "Tela interna para testar o pagamento aéreo com cartão e Pix." },
      { property: "og:title", content: "Teste de pagamento aéreo | Admin Via Air" },
      { property: "og:description", content: "Tela interna para testar o pagamento aéreo com cartão e Pix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function extrairCarrinho(entrada: string): string {
  const m = entrada.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : entrada.trim();
}

function TestePagamento() {
  const [campo, setCampo] = useState("");
  const [cartId, setCartId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Teste de pagamento aéreo</h1>
        <p className="text-sm text-muted-foreground">
          Cole o link ou o código da reserva gerada pelo nosso motor de busca.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="min-w-[320px] flex-1">
          <Label className="text-xs">Reserva</Label>
          <Input value={campo} onChange={(e) => setCampo(e.target.value)} placeholder="https://..." />
        </div>
        <Button type="button" onClick={() => setCartId(extrairCarrinho(campo) || null)}>
          Abrir pagamento
        </Button>
        {cartId ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}/pagar-viagem/${cartId}`);
            }}
          >
            Copiar link de pagamento
          </Button>
        ) : null}
      </div>

      {cartId ? <OnerPagamento key={cartId} cartId={cartId} modoAdmin /> : null}
    </div>
  );
}
