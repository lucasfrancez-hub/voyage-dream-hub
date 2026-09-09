/**
 * Gesto de voltar arrastando da borda esquerda para a direita (igual iOS/WhatsApp).
 *
 * A tela atual acompanha o dedo: conforme arrasta, ela desliza pra direita
 * revelando A TELA ANTERIOR por trás (uma foto estática da página de onde o
 * usuário veio, capturada a cada navegação interna). Soltou antes da metade →
 * volta suave pro lugar. Passou do limiar → desliza até o fim e só então
 * dispara o "voltar".
 *
 * Se não existe tela anterior (histórico vazio) e nenhuma camada aberta trata
 * o gesto, o arrasto nem começa.
 *
 * Telas com "voltar" próprio (como a conversa do chat) escutam o evento
 * cancelável `app:swipe-back`, chamam preventDefault() e fecham só a camada
 * delas. Para o gesto poder começar mesmo sem histórico, elas também escutam
 * `app:swipe-back-query` e chamam preventDefault() quando consumiriam o gesto.
 */
export function instalarGestoVoltar(): () => void {
  if (typeof window === "undefined") return () => {};

  const BORDA = 28; // px a partir da esquerda pra iniciar o gesto
  const DESVIO_VERTICAL = 50; // px de tolerância no eixo Y antes de engatar
  const ENGATE = 8; // px horizontais pra considerar que o gesto começou

  let alvo: HTMLElement | null = null;
  let fundo: HTMLElement | null = null;
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

  // --- Foto da tela anterior -------------------------------------------------
  // A cada navegação interna (pushState/replaceState), guardamos um clone
  // estático da página atual ANTES da troca. Ao arrastar, esse clone aparece
  // por trás, dando a sensação de que a tela anterior está logo ali.
  let fotoAnterior: HTMLElement | null = null;

  const capturarTelaAtual = () => {
    const raiz = encontrarAlvo();
    if (!raiz) return;
    const clone = raiz.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    clone.setAttribute("aria-hidden", "true");
    fotoAnterior = clone;
  };

  const montarFundo = (): HTMLElement | null => {
    if (!fotoAnterior) return null;
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#000;";
    const conteudo = fotoAnterior.cloneNode(true) as HTMLElement;
    conteudo.style.cssText +=
      ";position:absolute;inset:0;transform:none!important;pointer-events:none;";
    wrap.appendChild(conteudo);
    // leve escurecida pra dar profundidade, como no iOS
    const sombra = document.createElement("div");
    sombra.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,0.18);";
    wrap.appendChild(sombra);
    document.body.appendChild(wrap);
    return wrap;
  };

  const removerFundo = () => {
    if (fundo) {
      fundo.remove();
      fundo = null;
    }
  };

  const aplicar = (deslocamento: number, comTransicao: boolean) => {
    if (!alvo) return;
    alvo.style.transition = comTransicao
      ? "transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1), border-radius 220ms, box-shadow 220ms"
      : "none";
    alvo.style.transform = `translateX(${deslocamento}px)`;
    alvo.style.borderRadius = deslocamento > 2 ? "14px" : "0";
    alvo.style.boxShadow =
      deslocamento > 2 ? "-18px 0 42px rgba(0,0,0,0.4)" : "none";
    alvo.style.overflow = deslocamento > 2 ? "hidden" : "";
  };

  const limpar = () => {
    removerFundo();
    if (!alvo) return;
    alvo.style.transition = "";
    alvo.style.transform = "";
    alvo.style.borderRadius = "";
    alvo.style.boxShadow = "";
    alvo.style.overflow = "";
    alvo.style.willChange = "";
  };

  // Só permite o gesto quando REALMENTE existe pra onde voltar: ou alguma
  // camada aberta (drawer, conversa, foto ampliada) consome o gesto, ou o
  // usuário já navegou aqui dentro e temos a foto da tela anterior.
  // Numa primeira tela (link direto, recarregar) o gesto nem começa — assim
  // nunca aparece fundo vazio nem saímos do app.
  const temPraOndeVoltar = (): boolean => {
    const consulta = new CustomEvent("app:swipe-back-query", { cancelable: true });
    const ninguemTratou = window.dispatchEvent(consulta);
    if (!ninguemTratou) return true;
    return Boolean(fotoAnterior) && window.history.length > 1;
  };

  const voltar = () => {
    const evento = new CustomEvent("app:swipe-back", { cancelable: true });
    const seguiu = window.dispatchEvent(evento);
    if (seguiu && fotoAnterior && window.history.length > 1) window.history.back();
  };


  const inicio = (e: TouchEvent) => {
    if (animando || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > BORDA) return;
    if (!temPraOndeVoltar()) return;
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
        if (alvo) {
          alvo.style.willChange = "transform";
          // tela atual precisa ficar acima da foto da anterior
          alvo.style.position = alvo.style.position || "relative";
          alvo.style.zIndex = "1";
        }
        fundo = montarFundo();
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
      removerFundo();
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
          if (alvo) {
            alvo.style.position = "";
            alvo.style.zIndex = "";
          }
          alvo = null;
        }, 120);
      }, 230);
    } else {
      // volta suave pro lugar
      aplicar(0, true);
      window.setTimeout(() => {
        limpar();
        animando = false;
        if (alvo) {
          alvo.style.position = "";
          alvo.style.zIndex = "";
        }
        alvo = null;
      }, 240);
    }
    dx = 0;
  };

  // Intercepta navegações internas pra fotografar a tela antes da troca.
  const pushOriginal = window.history.pushState.bind(window.history);
  const replaceOriginal = window.history.replaceState.bind(window.history);
  window.history.pushState = ((...args: Parameters<History["pushState"]>) => {
    capturarTelaAtual();
    return pushOriginal(...args);
  }) as History["pushState"];
  window.history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    capturarTelaAtual();
    return replaceOriginal(...args);
  }) as History["replaceState"];

  // Depois de voltar, a foto guardada não vale mais: só volta a existir
  // quando o usuário navegar de novo aqui dentro.
  const aoVoltarHistorico = () => {
    fotoAnterior = null;
  };

  window.addEventListener("popstate", aoVoltarHistorico);
  window.addEventListener("touchstart", inicio, { passive: true });
  window.addEventListener("touchmove", mover, { passive: true });
  window.addEventListener("touchend", fim, { passive: true });
  window.addEventListener("touchcancel", fim, { passive: true });

  return () => {
    window.removeEventListener("popstate", aoVoltarHistorico);
    window.removeEventListener("touchstart", inicio);
    window.removeEventListener("touchmove", mover);
    window.removeEventListener("touchend", fim);
    window.removeEventListener("touchcancel", fim);
    window.history.pushState = pushOriginal;
    window.history.replaceState = replaceOriginal;
    limpar();

  };
}
