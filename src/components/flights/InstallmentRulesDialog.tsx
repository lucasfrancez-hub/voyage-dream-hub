/**
 * Tabela pública de parcelamento por companhia aérea.
 * Abre a partir do rodapé do motor de busca ("Consulte aqui").
 */
import { useMemo, useState, type ReactNode } from "react";
import { CreditCard, Search, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AIRLINE_INSTALLMENT_TABLE,
  ruleInstallmentsLabel,
  ruleMinLabel,
  isPixOnly,
} from "@/lib/airline-installments";

export function InstallmentRulesDialog({ trigger }: { trigger: ReactNode }) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return AIRLINE_INSTALLMENT_TABLE;
    return AIRLINE_INSTALLMENT_TABLE.filter(
      (r) =>
        r.name.toLowerCase().includes(term) || r.iata.toLowerCase().includes(term),
    );
  }, [q]);

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:w-full max-w-3xl p-0 gap-0 overflow-hidden rounded-3xl border-border bg-card/80 backdrop-blur-2xl shadow-2xl flex flex-col max-h-[88vh]">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CreditCard className="h-5 w-5 text-primary" />
            Parcelamento por companhia aérea
          </DialogTitle>
          <DialogDescription>
            O número de parcelas sem juros varia conforme a companhia e o valor da
            passagem, respeitando a parcela mínima de cada uma.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 border-b border-border/60">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar companhia (ex.: LATAM, TAP, AA)"
              className="w-full rounded-full border border-border/60 bg-background/60 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-primary/60"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-6 sm:py-4">
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_9rem_10rem] gap-4 px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span>Companhia</span>
            <span className="text-right">Parcelamento</span>
            <span className="text-right">Parcela mínima</span>
          </div>
          <div className="space-y-1">
            {rows.map((r) => (
              <div
                key={r.iata}
                className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_9rem_10rem] items-center gap-x-4 gap-y-1 rounded-xl px-3 py-2.5 transition hover:bg-primary/5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    {r.iata}
                  </div>
                </div>
                <div className="whitespace-nowrap text-right text-sm font-semibold text-primary tabular-nums">
                  {ruleInstallmentsLabel(r.rule)}
                </div>
                <div
                  className={`col-span-2 text-left text-xs sm:col-span-1 sm:text-right sm:text-sm tabular-nums ${
                    isPixOnly(r.rule)
                      ? "font-semibold text-emerald-500"
                      : r.rule.min == null
                        ? "text-muted-foreground"
                        : "text-muted-foreground sm:text-foreground"
                  }`}
                >
                  <span className="sm:hidden">Parcela mínima: </span>
                  {ruleMinLabel(r.rule)}
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nenhuma companhia encontrada. Fale com um especialista VIA AIR.
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-border/60 bg-background/40 px-6 py-4">
          <ul className="space-y-2 text-xs text-muted-foreground">
            {[
              "O parcelamento segue as regras da companhia aérea, e a quantidade final de parcelas é informada antes da finalização do pedido.",
              "Válido apenas para viagens com origem ou destino no Brasil.",
              "Pagamento em até 3 cartões de crédito.",
              "Parcelas mínimas em USD são convertidas pela cotação do dia.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
        </div>


      </DialogContent>
    </Dialog>
  );
}
