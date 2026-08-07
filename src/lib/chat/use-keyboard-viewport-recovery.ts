import { useEffect, useRef } from "react";

/**
 * Recuperação PÓS-TECLADO (iOS/WebKit em PWA standalone).
 *
 * O bug observado: depois de abrir e fechar o teclado, o WebKit deixa a
 * layout/dynamic viewport presa numa altura menor (ex.: 956 → 894), e o
 * `height: 100dvh` do root passa a valer 894 — sobra uma faixa embaixo.
 *
 * Regras (intencionais):
 *  - nada é medido nem alterado ENQUANTO o teclado está aberto;
 *  - só age depois do focusout de um elemento editável;
 *  - o override é temporário e cai assim que o WebKit se recupera;
 *  - a altura-base nunca é rebaixada por causa do teclado (só por rotação).
 */

const TOLERANCIA = 24; // px
const JANELA_POS_TECLADO = 2500; // ms em que uma base menor é considerada suspeita

function temEditavelFocado(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
}

function alturaAtual(): number {
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

export function useKeyboardViewportRecovery<T extends HTMLElement>() {
  const rootRef = useRef<T | null>(null);
  const baseRef = useRef<number>(0);
  const ultimaInteracaoTecladoRef = useRef<number>(0);
  const overrideRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const aplicarOverride = (altura: number) => {
      const el = rootRef.current;
      if (!el) return;
      overrideRef.current = true;
      el.style.height = `${altura}px`;
    };

    const removerOverride = () => {
      const el = rootRef.current;
      overrideRef.current = false;
      if (el) el.style.height = "100dvh";
    };

    /** Guarda a base só quando é seguro: sem foco em campo e sem teclado recente. */
    const talvezAtualizarBase = () => {
      if (temEditavelFocado()) return;
      const h = alturaAtual();
      if (h <= 0) return;
      const recente = Date.now() - ultimaInteracaoTecladoRef.current < JANELA_POS_TECLADO;
      if (h >= baseRef.current) {
        baseRef.current = h;
        if (overrideRef.current) removerOverride();
        return;
      }
      // altura menor: só aceita se não veio de interação com teclado
      if (!recente && !overrideRef.current) baseRef.current = h;
    };

    // base inicial
    talvezAtualizarBase();

    let timers: number[] = [];
    const limparTimers = () => {
      timers.forEach((t) => clearTimeout(t));
      timers = [];
    };

    const verificarRecuperacao = () => {
      if (temEditavelFocado()) return;
      const esperado = baseRef.current;
      if (esperado <= 0) return;
      const atual = alturaAtual();
      if (atual < esperado - TOLERANCIA) aplicarOverride(esperado);
      else if (overrideRef.current) removerOverride();
    };

    const agendarVerificacoes = () => {
      limparTimers();
      requestAnimationFrame(verificarRecuperacao);
      [100, 300, 600, 1000, 1600].forEach((ms) => {
        timers.push(window.setTimeout(verificarRecuperacao, ms) as unknown as number);
      });
    };

    const onFocusIn = (e: FocusEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (!alvo) return;
      const tag = alvo.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || alvo.isContentEditable) {
        ultimaInteracaoTecladoRef.current = Date.now();
        // nada de medir/alterar enquanto o teclado está aberto
      }
    };

    const onFocusOut = () => {
      ultimaInteracaoTecladoRef.current = Date.now();
      agendarVerificacoes();
    };

    const onResize = () => {
      if (temEditavelFocado()) return;
      const atual = alturaAtual();
      // WebKit voltou ao normal → tira o override e revalida a base
      if (overrideRef.current && atual >= baseRef.current - TOLERANCIA) removerOverride();
      talvezAtualizarBase();
      if (Date.now() - ultimaInteracaoTecladoRef.current < JANELA_POS_TECLADO) verificarRecuperacao();
    };

    const onOrientation = () => {
      // rotação invalida a base antiga
      baseRef.current = 0;
      ultimaInteracaoTecladoRef.current = 0;
      removerOverride();
      timers.push(window.setTimeout(talvezAtualizarBase, 400) as unknown as number);
      timers.push(window.setTimeout(talvezAtualizarBase, 900) as unknown as number);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // voltar de outro app não pode contaminar a base
      ultimaInteracaoTecladoRef.current = 0;
      timers.push(window.setTimeout(talvezAtualizarBase, 300) as unknown as number);
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      limparTimers();
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
      document.removeEventListener("visibilitychange", onVisibility);
      removerOverride();
    };
  }, []);

  return rootRef;
}
