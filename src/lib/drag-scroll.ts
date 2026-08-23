/**
 * Arrastar-para-rolar horizontal global.
 *
 * Em telas dobráveis (Galaxy Z Fold) e desktops com touch, barras horizontais
 * (menu do admin, abas do chat, chips de consultores) ficam cortadas e são
 * difíceis de rolar. Este utilitário permite arrastar qualquer container com
 * overflow horizontal usando dedo/mouse, sem quebrar cliques.
 */

const IGNORAR = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-no-drag-scroll]";

function containerRolavel(alvo: EventTarget | null): HTMLElement | null {
  let el = alvo instanceof Element ? (alvo as HTMLElement) : null;
  while (el && el !== document.body) {
    const estilo = getComputedStyle(el);
    const rolaX = /(auto|scroll)/.test(estilo.overflowX);
    if (rolaX && el.scrollWidth - el.clientWidth > 4) return el;
    el = el.parentElement;
  }
  return null;
}

export function instalarDragScroll(): () => void {
  if (typeof window === "undefined") return () => {};

  let alvo: HTMLElement | null = null;
  let inicioX = 0;
  let inicioY = 0;
  let scrollInicial = 0;
  let arrastando = false;
  let pointerId = -1;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const origem = e.target as Element | null;
    if (origem?.closest(IGNORAR)) return;
    const el = containerRolavel(origem);
    if (!el) return;
    alvo = el;
    inicioX = e.clientX;
    inicioY = e.clientY;
    scrollInicial = el.scrollLeft;
    arrastando = false;
    pointerId = e.pointerId;
  };

  const onMove = (e: PointerEvent) => {
    if (!alvo || e.pointerId !== pointerId) return;
    const dx = e.clientX - inicioX;
    const dy = e.clientY - inicioY;
    if (!arrastando) {
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
      arrastando = true;
      alvo.style.scrollBehavior = "auto";
      alvo.setAttribute("data-dragging", "");
    }
    alvo.scrollLeft = scrollInicial - dx;
    if (e.pointerType !== "touch") e.preventDefault();
  };

  const encerrar = () => {
    if (alvo) {
      alvo.style.scrollBehavior = "";
      alvo.removeAttribute("data-dragging");
    }
    if (arrastando) {
      // Bloqueia o clique que fecharia/abriria algo logo após o arrasto
      const bloquear = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", bloquear, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", bloquear, { capture: true } as any), 60);
    }
    alvo = null;
    arrastando = false;
    pointerId = -1;
  };

  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", encerrar, { passive: true });
  window.addEventListener("pointercancel", encerrar, { passive: true });

  return () => {
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove as any);
    window.removeEventListener("pointerup", encerrar);
    window.removeEventListener("pointercancel", encerrar);
  };
}
