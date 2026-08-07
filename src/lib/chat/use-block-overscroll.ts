import { useEffect } from "react";

/**
 * Bloqueia o "rubber band" (tela subindo/descendo e mostrando o fundo azul)
 * quando o dedo arrasta numa área que não é rolável — típico do PWA no iOS.
 *
 * Não altera layout: só cancela o gesto quando não existe container rolável
 * sob o dedo (ou quando ele já está no topo/fim e continua puxando).
 */
function encontrarRolavel(alvo: EventTarget | null, direcaoParaBaixo: boolean): boolean {
  let el = alvo as HTMLElement | null;
  while (el && el !== document.body && el !== document.documentElement) {
    const estilo = getComputedStyle(el);
    const podeRolar = /(auto|scroll|overlay)/.test(estilo.overflowY);
    if (podeRolar && el.scrollHeight > el.clientHeight + 1) {
      const noTopo = el.scrollTop <= 0;
      const noFim = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (direcaoParaBaixo ? !noFim : !noTopo) return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function useBlockOverscroll(ativo = true) {
  useEffect(() => {
    if (!ativo || typeof window === "undefined") return;

    let inicioY = 0;

    const onTouchStart = (e: TouchEvent) => {
      inicioY = e.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = inicioY - y; // > 0 = arrastando para cima (conteúdo desce)
      if (Math.abs(delta) < 1) return;
      if (encontrarRolavel(e.target, delta > 0)) return;
      if (e.cancelable) e.preventDefault();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [ativo]);
}
