import { FileText, Check } from "lucide-react";

/**
 * Card informativo do Boleto Pré-pago na página pública do pacote.
 * Só é renderizado quando a condição é elegível (regra em @/lib/packages/prepaid-boleto).
 */
export function PrepaidBoletoCard({
  slug,
  maxInstallments,
  search,
}: {
  slug: string;
  maxInstallments: number;
  search?: Record<string, unknown>;
}) {
  const itens = [
    "Sem consulta ao SPC/SERASA;",
    "Sem necessidade de comprovação de renda;",
    "Parcelamento sem juros.",
  ];

  return (
    <div className="mt-4 rounded-2xl border border-brand-orange/30 bg-gradient-to-br from-brand-orange/[0.07] to-brand-orange/[0.02] p-4">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-orange/20 bg-brand-orange/10 text-brand-orange">
          <FileText className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold leading-tight">Compre no boleto pré-pago</div>
          <p className="mt-1 text-[11px] font-semibold leading-relaxed text-muted-foreground">
            Viaje sem se preocupar com o limite do cartão de crédito.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-[7px]">
        {itens.map((t) => (
          <div key={t} className="flex items-center gap-[7px] text-[11px] text-muted-foreground">
            <Check className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
            {t}
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-brand-orange/15 pt-2.5">
        <p className="text-[10px] leading-snug text-muted-foreground">
          Até <span className="font-bold text-foreground">{maxInstallments}x sem juros</span> disponível para esta viagem.
        </p>
      </div>
    </div>
  );
}
