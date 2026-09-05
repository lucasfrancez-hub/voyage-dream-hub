/**
 * Gesto de voltar arrastando da borda esquerda para a direita (igual iOS/WhatsApp).
 *
 * A tela atual acompanha o dedo: conforme arrasta, ela desliza pra direita
 * revelando um fundo escuro atrás (como se a tela anterior estivesse ali).
 * Soltou antes da metade → volta suave pro lugar. Passou do limiar → desliza
 * até o fim e só então dispara o "voltar".
 *
 * Telas com "voltar" próprio (como a conversa do chat) escutam o evento
 * cancelável `app:swipe-back`, chamam preventDefault() e fecham só a camada
 * delas. Se ninguém tratar, o app volta uma página no histórico.
 */
export function instalarGestoVoltar(): () => void {
  if (typeof window === "undefined") return () => {};

  const BORDA = 28; // px a partir da esquerda pra iniciar o gesto
  const DESVIO_VERTICAL = 50; // px de tolerância no eixo Y antes de engatar
  const ENGATE = 8; // px horizontais pra considerar que o gesto começou

  let alvo: HTMLElement | null = null;
  let x0 = 0;
  let y0 = 0;
  let dx = 0;
  let decidido = false; // já sabemos se é gesto horizontal ou rolagem vertical
  let arrastando = false;
  let animando = false;

  const limiar = () => Math.min(window.innerWidth * 0.35, 160);

  const encontrarAlvo = (): HTMLElement | null =>
    (document.getElementById("root") as HTMLElement | null) ??
    (document.body.firstElementChild as HTMLElement | null) ??
    document.body;

  const aplicar = (deslocamento: number, comTransicao: boolean) => {
    if (!alvo) return;
    const w = window.innerWidth || 1;
    const progresso = Math.min(deslocamento / w, 1);
    alvo.style.transition = comTransicao
      ? "transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1), border-radius 220ms, box-shadow 220ms"
      : "none";
    alvo.style.transform = `translateX(${deslocamento}px)`;
    alvo.style.borderRadius = deslocamento > 2 ? "14px" : "0";
    alvo.style.boxShadow =
      deslocamento > 2 ? "-18px 0 42px rgba(0,0,0,0.4)" : "none";
    alvo.style.overflow = deslocamento > 2 ? "hidden" : "";
    document.body.style.backgroundColor = `rgba(0,0,0,${0.25 + progresso * 0.45})`;
  };

  const limpar = () => {
    if (!alvo) return;
    alvo.style.transition = "";
    alvo.style.transform = "";
    alvo.style.borderRadius = "";
    alvo.style.boxShadow = "";
    alvo.style.overflow = "";
    alvo.style.willChange = "";
    document.body.style.backgroundColor = "";
  };

  const voltar = () => {
    const evento = new CustomEvent("app:swipe-back", { cancelable: true });
    const seguiu = window.dispatchEvent(evento);
    if (seguiu && window.history.length > 1) window.history.back();
  };

  const inicio = (e: TouchEvent) => {
    if (animando || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > BORDA) return;
    x0 = t.clientX;
    y0 = t.clientY;
    dx = 0;
    decidido = false;
    arrastando = true;
  };

  const mover = (e: TouchEvent) => {
    if (!arrastando || animando) return;
    const t = e.touches[0];
    const deltaX = t.clientX - x0;
    const deltaY = t.clientY - y0;

    if (!decidido) {
      if (Math.abs(deltaY) > DESVIO_VERTICAL && Math.abs(deltaY) > Math.abs(deltaX)) {
        arrastando = false; // era rolagem vertical
        return;
      }
      if (deltaX > ENGATE && Math.abs(deltaX) > Math.abs(deltaY)) {
        decidido = true;
        alvo = encontrarAlvo();
        if (alvo) alvo.style.willChange = "transform";
      } else {
        return;
      }
    }

    if (deltaX < 0) {
      dx = 0;
      aplicar(0, false);
      return;
    }
    dx = deltaX;
    aplicar(dx, false);
  };

  const fim = () => {
    if (!arrastando) return;
    arrastando = false;
    if (!decidido || !alvo) {
      decidido = false;
      return;
    }
    decidido = false;
    animando = true;

    if (dx >= limiar()) {
      // completa o gesto: desliza até o fim e navega
      aplicar(window.innerWidth, true);
      window.setTimeout(() => {
        voltar();
        // dá um tempo pra rota trocar antes de limpar os estilos
        window.setTimeout(() => {
          limpar();
          animando = false;
          alvo = null;
        }, 120);
      }, 230);
    } else {
      // volta suave pro lugar
      aplicar(0, true);
      window.setTimeout(() => {
        limpar();
        animando = false;
        alvo = null;
      }, 240);
    }
    dx = 0;
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
    limpar();
  };
}
