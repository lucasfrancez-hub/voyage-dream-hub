import { ChevronLeft, ChevronRight } from "lucide-react";

export const ITENS_POR_PAGINA = 7;

export function Paginacao({
  pagina,
  total,
  porPagina = ITENS_POR_PAGINA,
  onChange,
  rotulo = "itens",
}: {
  pagina: number;
  total: number;
  porPagina?: number;
  onChange: (p: number) => void;
  rotulo?: string;
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  if (totalPaginas <= 1) return null;

  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, total);

  return (
    <div className="mkt-paginacao">
      <span className="mkt-paginacao-info">
        Mostrando {inicio}–{fim} de {total} {rotulo}
      </span>
      <div className="mkt-paginacao-btns">
        <button
          type="button"
          disabled={pagina <= 1}
          onClick={() => onChange(pagina - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="mkt-paginacao-page">
          Página {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          disabled={pagina >= totalPaginas}
          onClick={() => onChange(pagina + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
