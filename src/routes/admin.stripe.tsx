import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Validacao3DSCartao } from "@/components/passhub/Validacao3DSCartao";

/**
 * Ambiente de testes da validação de cartão por 3D Secure (Stripe).
 * Usa um identificador de "reserva" fictício — nada aqui afeta reservas reais.
 */
export const Route = createFileRoute("/admin/stripe")({
  component: AdminStripeTeste,
  head: () => ({
    meta: [
      { title: "Stripe — Testes 3DS | Admin Via Air" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AdminStripeTeste() {
  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-bold">Stripe — Testes de 3D Secure</h1>
          <p className="text-sm text-muted-foreground">
            Autorização temporária de R$ 1,00 sem captura. Área de testes, não vinculada a
            nenhuma reserva.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <Validacao3DSCartao reservaId="TESTE-STRIPE" />
      </div>

      <p className="text-xs text-muted-foreground">
        O cartão é digitado somente no campo oficial da Stripe — número e CVV nunca passam
        pelo nosso sistema. A autorização de R$ 1,00 é cancelada logo após a validação, sem
        cobrança ao cliente.
      </p>
    </div>
  );
}
