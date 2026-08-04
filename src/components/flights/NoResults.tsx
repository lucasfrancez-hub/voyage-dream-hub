import noFlights from "@/assets/no-flights.png";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";

type Props = {
  /** Título principal, ex.: "Desculpe, nenhum voo foi encontrado." */
  title?: string;
  /** Instrução abaixo do título. */
  hint?: string;
  /** Quando informado, mostra o botão de limpar filtros. */
  onClearFilters?: () => void;
  className?: string;
};

/**
 * Estado vazio ilustrado para resultados de busca (voos, hotéis, seguros,
 * exclusivos) quando os filtros aplicados não retornam nenhuma opção — por
 * exemplo, classe executiva em rota nacional ou voo direto inexistente.
 */
export function NoResults({
  title = "Desculpe, nenhum voo foi encontrado.",
  hint = "Selecione outra opção de filtro.",
  onClearFilters,
  className = "",
}: Props) {
  return (
    <div
      className={`flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center ${className}`}
    >
      <img
        src={noFlights}
        alt=""
        aria-hidden
        loading="lazy"
        width={896}
        height={752}
        className="h-40 w-auto select-none sm:h-48"
      />
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {onClearFilters && (
        <Button variant="outline" size="sm" onClick={onClearFilters} className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
