import { useMemo } from "react";
import { Check } from "lucide-react";

export type ServiceDetail = { grupo?: string | null; titulo: string; detalhe: string };

/**
 * Frases que são detalhamento de cobertura (seguro/condições), não serviço
 * incluso. Não devem aparecer na lista "O que inclui".
 */
const RUIDO = [
  /isen[cç][aã]o de multa/i,
  /cr[eé]dito para nova viagem/i,
  /voucher\)? no valor/i,
  /cobre impedimentos/i,
  /v[aá]lido para pacotes e servi[cç]os/i,
  /cancelamento eleg[ií]vel/i,
  /flexibilidade tarif[aá]ria/i,
  /protec travel/i,
];

const ehRuido = (s: string) => RUIDO.some((r) => r.test(s));

/**
 * Lista simples do que está incluso (modelo aprovado): apenas o nome do
 * serviço, sem botões de detalhes.
 */
export default function IncludedServices({
  includes,
}: {
  includes: string[];
  services?: any;
}) {
  const linhas = useMemo(
    () => (includes ?? []).map((i) => String(i ?? "").trim()).filter((i) => i && !ehRuido(i)),
    [includes],
  );

  if (!linhas.length) return null;

  return (
    <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
      {linhas.map((label, i) => (
        <li key={`${label}-${i}`} className="flex items-start gap-2 text-sm">
          <Check className="h-4 w-4 text-brand-orange mt-0.5 shrink-0" />
          <span className="flex-1">{label}</span>
        </li>
      ))}
    </ul>
  );
}
