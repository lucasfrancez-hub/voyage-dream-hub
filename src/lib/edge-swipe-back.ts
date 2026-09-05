/**
 * Gesto de voltar arrastando da borda esquerda para a direita (igual iOS/WhatsApp).
 *
 * Quando o dedo começa bem na borda esquerda e arrasta pra direita, dispara um
 * evento cancelável `app:swipe-back`. Telas que têm um "voltar" próprio (como a
 * conversa do chat) escutam esse evento, chamam preventDefault() e fecham só a
 * camada delas. Se ninguém tratar, o app volta uma página no histórico.
 */
export function instalarGestoVoltar(): () => void {
  if (typeof window === "undefined") return () => {};

  const BORDA = 28; // px a partir da esquerda pra iniciar o gesto
  const DISTANCIA = 80; // px arrastados pra confirmar
  const DESVIO_VERTICAL = 60; // px de tolerância no eixo Y

  let ativo = false;
  let x0 = 0;
  let y0 = 0;

  const inicio = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > BORDA) return;
    ativo = true;
    x0 = t.clientX;
    y0 = t.clientY;
  };

  const mover = (e: TouchEvent) => {
    if (!ativo) return;
    const t = e.touches[0];
    if (Math.abs(t.clientY - y0) > DESVIO_VERTICAL) {
      ativo = false;
      return;
    }
    if (t.clientX - x0 >= DISTANCIA) {
      ativo = false;
      voltar();
    }
  };

  const fim = () => {
    ativo = false;
  };

  const voltar = () => {
    const evento = new CustomEvent("app:swipe-back", { cancelable: true });
    const seguiu = window.dispatchEvent(evento);
    if (seguiu && window.history.length > 1) window.history.back();
  };

  window.addEventListener("touchstart", inicio, { passive: true });
  window.addEventListener("touchmove", mover, { passive: true });
  window.addEventListener("touchend", fim, { passive: true });
  window.addEventListener("touchcancel", fim, { passive: true });

  return () => {
    window.removeEventListener("touchstart", inicio);
    window.removeEventListener("touchmove", mover);
    window.removeEventListener("touchend", fim);
    window.removeEventListener("touchcancel", fim);
  };
}
