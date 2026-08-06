/**
 * Handshake de versão do aplicativo.
 *
 * Cada build recebe um identificador único (`__APP_BUILD_ID__`, injetado pelo
 * Vite) que também é publicado em `/version.json`. Comparando os dois o app
 * descobre — antes de tentar importar qualquer chunk — que está rodando uma
 * versão antiga (típico no iPhone, onde o PWA/aba fica congelado por dias e
 * volta exatamente no estado anterior).
 *
 * Nada aqui apaga sessão, cookie `via_chat_dev`, tema ou inscrição de push:
 * a atualização só renova os arquivos da aplicação.
 */

declare global {
  // eslint-disable-next-line no-var
  var __APP_BUILD_ID__: string | undefined;
}

export const APP_BUILD_ID: string =
  typeof __APP_BUILD_ID__ === "string" && __APP_BUILD_ID__ ? __APP_BUILD_ID__ : "dev";

/** Intervalo mínimo entre consultas quando o app segue aberto. */
const INTERVALO_MS = 3 * 60 * 1000;
/** Tempo fora da tela que dispara verificação imediata ao voltar. */
const SEGUNDO_PLANO_LONGO_MS = 60 * 1000;

let ultimaConsulta = 0;
let consultaEmAndamento: Promise<string | null> | null = null;
let escondidoDesde = 0;

/** Lê a versão publicada, sempre sem cache. Devolve null se não der pra saber. */
export async function versaoPublicada(): Promise<string | null> {
  if (typeof fetch === "undefined") return null;
  if (consultaEmAndamento) return consultaEmAndamento;
  consultaEmAndamento = (async () => {
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, {
        cache: "no-store",
        credentials: "omit",
        headers: { "cache-control": "no-cache" },
      });
      if (!r.ok) return null;
      const ct = r.headers.get("content-type") ?? "";
      if (!ct.includes("json")) return null;
      const data = (await r.json()) as { version?: unknown };
      return typeof data.version === "string" ? data.version : null;
    } catch {
      return null;
    } finally {
      ultimaConsulta = Date.now();
      consultaEmAndamento = null;
    }
  })();
  return consultaEmAndamento;
}

/** true quando o servidor já publicou uma build diferente da que está aberta. */
export async function estaDesatualizado(): Promise<boolean> {
  if (APP_BUILD_ID === "dev") return false;
  const publicada = await versaoPublicada();
  if (!publicada) return false;
  return publicada !== APP_BUILD_ID;
}

/**
 * Garante que a tela seguinte vai abrir na versão publicada.
 * Se estiver velha, recarrega com cache-busting e devolve `true`
 * (quem chamou deve parar a navegação — a página vai ser trocada).
 */
export async function garantirVersaoAtual(motivo = "handshake"): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!(await estaDesatualizado())) return false;
  const { hardRefreshApp, registrarDiagnostico } = await import("./stale-app-recovery");
  registrarDiagnostico({ tipo: "versao-antiga", motivo, versaoPublicada: await versaoPublicada() });
  await hardRefreshApp();
  return true;
}

/** Verificação periódica + ao voltar do segundo plano (iOS mantém a aba viva). */
export function instalarHandshakeVersao(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const verificar = (imediato: boolean) => {
    if (document.visibilityState !== "visible") return;
    if (!imediato && Date.now() - ultimaConsulta < INTERVALO_MS) return;
    void garantirVersaoAtual(imediato ? "retorno-segundo-plano" : "periodico");
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      escondidoDesde = Date.now();
      return;
    }
    const tempoFora = escondidoDesde ? Date.now() - escondidoDesde : 0;
    escondidoDesde = 0;
    verificar(tempoFora > SEGUNDO_PLANO_LONGO_MS);
  };
  const onPageShow = (ev: Event) => {
    // `persisted` = página restaurada do bfcache (Safari/iOS).
    verificar((ev as PageTransitionEvent).persisted === true);
  };
  const onFocus = () => verificar(false);

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("focus", onFocus);

  // Primeira verificação logo depois da abertura, sem atrapalhar o boot.
  const inicial = window.setTimeout(() => verificar(true), 4000);

  return () => {
    window.clearTimeout(inicial);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("focus", onFocus);
  };
}
