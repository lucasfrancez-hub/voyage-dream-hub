/**
 * Coletor de métricas de uso do site (client-side, sem cookies de terceiros).
 * Envia pageviews, cliques, tempo de navegação e origem do acesso para
 * /api/public/analytics-collect.
 */

const ENDPOINT = "/api/public/analytics-collect";
const SESSION_KEY = "viaair:analytics:session";
const VISITOR_KEY = "viaair:analytics:visitor";
const SESSION_TTL_MS = 30 * 60 * 1000;

type EventoBase = {
  event_type: "pageview" | "click" | "heartbeat" | "session_end";
  path?: string;
  title?: string;
  referrer?: string | null;
  entry?: boolean;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  short_slug?: string | null;
  duration_ms?: number;
  target_label?: string;
  meta?: Record<string, unknown>;
};

function rid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function ler(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function gravar(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    /* modo privado */
  }
}

function visitorId() {
  let v = ler(localStorage, VISITOR_KEY);
  if (!v) {
    v = rid();
    gravar(localStorage, VISITOR_KEY, v);
  }
  return v;
}

/** Sessão nova quando não existe ou passou de 30 min sem atividade. */
function sessao(): { id: string; nova: boolean } {
  const raw = ler(sessionStorage, SESSION_KEY);
  const agora = Date.now();
  if (raw) {
    try {
      const p = JSON.parse(raw) as { id: string; ts: number };
      if (p.id && agora - p.ts < SESSION_TTL_MS) {
        gravar(sessionStorage, SESSION_KEY, JSON.stringify({ id: p.id, ts: agora }));
        return { id: p.id, nova: false };
      }
    } catch {
      /* ignora */
    }
  }
  const id = rid();
  gravar(sessionStorage, SESSION_KEY, JSON.stringify({ id, ts: agora }));
  return { id, nova: true };
}

let inicioSessao = Date.now();
let inicioPagina = Date.now();
let instalado = false;

function enviar(evento: EventoBase, comBeacon = false) {
  if (typeof window === "undefined") return;
  const s = sessao();
  const body = JSON.stringify({
    session_id: s.id,
    visitor_id: visitorId(),
    ...evento,
  });
  try {
    if (comBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* nunca quebra a navegação */
  }
}

function paramsDaUrl() {
  const q = new URLSearchParams(window.location.search);
  return {
    utm_source: q.get("utm_source"),
    utm_medium: q.get("utm_medium"),
    utm_campaign: q.get("utm_campaign"),
    short_slug: q.get("s") || q.get("ref") || null,
  };
}

export function registrarPageview() {
  if (typeof window === "undefined") return;
  const agora = Date.now();
  // fecha a página anterior com o tempo gasto nela
  if (instalado) {
    enviar({
      event_type: "heartbeat",
      path: window.location.pathname,
      duration_ms: agora - inicioPagina,
    });
  }
  inicioPagina = agora;
  const s = sessao();
  enviar({
    event_type: "pageview",
    path: window.location.pathname,
    title: document.title,
    referrer: document.referrer || null,
    entry: s.nova,
    ...paramsDaUrl(),
  });
}

function rotuloDoAlvo(el: Element): string | null {
  const alvo = el.closest<HTMLElement>("[data-track],a,button,[role='button']");
  if (!alvo) return null;
  const explicito = alvo.getAttribute("data-track");
  if (explicito) return explicito.slice(0, 120);
  const texto = (alvo.getAttribute("aria-label") || alvo.textContent || "").trim().replace(/\s+/g, " ");
  const href = alvo.getAttribute("href");
  const base = texto || href || alvo.tagName.toLowerCase();
  return base.slice(0, 120);
}

/** Instala o rastreamento. Retorna a função de limpeza. */
export function instalarAnalytics() {
  if (typeof window === "undefined") return () => undefined;
  if (instalado) return () => undefined;
  inicioSessao = Date.now();
  inicioPagina = Date.now();

  const onClick = (e: MouseEvent) => {
    const alvo = e.target as Element | null;
    if (!alvo || !(alvo instanceof Element)) return;
    const label = rotuloDoAlvo(alvo);
    if (!label) return;
    enviar({
      event_type: "click",
      path: window.location.pathname,
      target_label: label,
    });
  };

  const onHidden = () => {
    if (document.visibilityState !== "hidden") return;
    enviar(
      {
        event_type: "session_end",
        path: window.location.pathname,
        duration_ms: Date.now() - inicioSessao,
      },
      true,
    );
  };

  const timer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    enviar({
      event_type: "heartbeat",
      path: window.location.pathname,
      duration_ms: Date.now() - inicioPagina,
    });
  }, 60_000);

  document.addEventListener("click", onClick, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", onHidden);

  registrarPageview();
  instalado = true;

  return () => {
    document.removeEventListener("click", onClick, { capture: true } as EventListenerOptions);
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", onHidden);
    window.clearInterval(timer);
    instalado = false;
  };
}
