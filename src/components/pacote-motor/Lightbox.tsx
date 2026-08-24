import { useCallback, useEffect } from "react";

/**
 * Visualizador de fotos em tela cheia do Motor de Pacotes.
 * Abre a galeria do hotel a partir de qualquer miniatura, com navegação
 * por setas, teclado e clique fora para fechar.
 */
export function Lightbox({
  fotos,
  indice,
  titulo,
  onIndice,
  onFechar,
}: {
  fotos: string[];
  indice: number;
  titulo: string;
  onIndice: (i: number) => void;
  onFechar: () => void;
}) {
  const total = fotos.length;

  const mover = useCallback(
    (delta: number) => {
      if (!total) return;
      onIndice((indice + delta + total) % total);
    },
    [indice, onIndice, total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
      if (e.key === "ArrowRight") mover(1);
      if (e.key === "ArrowLeft") mover(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mover, onFechar]);

  if (!total) return null;

  return (
    <div className="mkt-lightbox" role="dialog" aria-modal="true" aria-label={`Fotos de ${titulo}`} onClick={onFechar}>
      <div className="lb-inner" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lb-close" onClick={onFechar} aria-label="Fechar galeria">
          ✕
        </button>
        {total > 1 ? (
          <button type="button" className="lb-nav prev" onClick={() => mover(-1)} aria-label="Foto anterior">
            ‹
          </button>
        ) : null}
        <img src={fotos[indice]} alt={`Foto ${indice + 1} de ${titulo}`} />
        {total > 1 ? (
          <button type="button" className="lb-nav next" onClick={() => mover(1)} aria-label="Próxima foto">
            ›
          </button>
        ) : null}
        <div className="lb-caption">
          <b>{titulo}</b>
          <span>
            {indice + 1} / {total}
          </span>
        </div>
      </div>
    </div>
  );
}
