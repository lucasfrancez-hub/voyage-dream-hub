/**
 * Sessão viva do treinador de check-in.
 *
 * Abre a LATAM UMA vez no Browserless via stealth+reconnect e mantém o
 * `browserWSEndpoint` num Map em memória (chaveado por sessionId + userId).
 * Cada ação (click/type/scroll/back) reconecta via puppeteer, executa o
 * passo na MESMA aba, tira print e desconecta — a sessão remota continua
 * viva até o TTL expirar.
 *
 * Se o worker reciclar a memória ou o Browserless matar a sessão, a
 * próxima chamada lança SESSION_EXPIRED e o front pede pra reabrir.
 */

import { randomUUID } from "crypto";
import type { Browser, Page } from "puppeteer-core";

const BROWSERLESS_BASE = "https://production-sfo.browserless.io";
// O plano Free limita reconnect a 10s. O front envia um heartbeat a cada 6s,
// permitindo que a aba continue viva enquanto o treinador estiver aberto.
const SESSION_RECONNECT_MS = 9 * 1000;
const SESSION_INACTIVITY_MS = 10 * 60 * 1000;
const OPEN_REQUEST_TIMEOUT_MS = 70 * 1000;


export type LiveStep =
  | { action: "goto"; url: string }
  | { action: "wait"; ms: number }
  | { action: "click"; x: number; y: number }
  | { action: "type"; x: number; y: number; text: string; clearFirst?: boolean }
  | { action: "press"; key: string }
  | { action: "scroll"; dy: number }
  | { action: "back" };

interface StoredSession {
  id: string;
  userId: string;
  wsEndpoint: string;
  createdAt: number;
  lastUsed: number;
  viewport: { width: number; height: number };
}

// Cache no globalThis pra sobreviver a HMR/reimports do módulo dentro do
// mesmo isolate. Cloudflare pode reciclar o isolate entre requests — quando
// isso acontece, o cliente recebe SESSION_EXPIRED e reabre a sessão.
const g = globalThis as unknown as { __viaTrainingSessions?: Map<string, StoredSession> };
if (!g.__viaTrainingSessions) g.__viaTrainingSessions = new Map();
const sessions = g.__viaTrainingSessions;

export class SessionExpiredError extends Error {
  code = "SESSION_EXPIRED" as const;
  constructor(msg = "Sessão expirou — abra novamente") {
    super(msg);
  }
}

function cleanup() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastUsed > SESSION_INACTIVITY_MS) sessions.delete(id);
  }
}

function requireSession(sessionId: string, userId: string): StoredSession {
  const s = sessions.get(sessionId);
  if (!s || s.userId !== userId) throw new SessionExpiredError();
  if (Date.now() - s.lastUsed > SESSION_INACTIVITY_MS) {
    sessions.delete(sessionId);
    throw new SessionExpiredError();
  }
  return s;
}

async function withConnection<T>(
  session: StoredSession,
  fn: (page: Page, browser: Browser) => Promise<T>,
): Promise<T> {
  const puppeteer = await import("puppeteer-core");
  let browser: Browser;
  try {
    browser = (await puppeteer.default.connect({
      browserWSEndpoint: session.wsEndpoint,
    })) as unknown as Browser;
  } catch (e) {
    sessions.delete(session.id);
    throw new SessionExpiredError(
      `Sessão do navegador remoto encerrada: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    const pages = await browser.pages();
    let page =
      pages.find((p) => {
        try {
          return p.url().includes("latamairlines.com");
        } catch {
          return false;
        }
      }) || pages[pages.length - 1];
    if (!page) page = await browser.newPage();
    await page
      .setViewport({
        width: session.viewport.width,
        height: session.viewport.height,
        deviceScaleFactor: 1,
      })
      .catch(() => {});
    await page.bringToFront().catch(() => {});
    const result = await fn(page, browser);
    // `reconnect(timeout)` vale a partir do momento em que foi solicitado.
    // Renove antes de cada disconnect; apenas reconectar via Puppeteer não
    // reinicia esse relógio no Browserless.
    try {
      const cdp = await page.createCDPSession();
      const renewed = await cdp.send("Browserless.reconnect" as never, {
        timeout: SESSION_RECONNECT_MS,
      } as never) as unknown as { browserWSEndpoint?: string };
      if (renewed.browserWSEndpoint) {
        const token = process.env.BROWSERLESS_TOKEN;
        const ws = new URL(renewed.browserWSEndpoint);
        if (token && !ws.searchParams.has("token")) ws.searchParams.set("token", token);
        session.wsEndpoint = ws.toString();
      }
      await cdp.detach().catch(() => {});
    } catch (error) {
      sessions.delete(session.id);
      throw new SessionExpiredError(
        `Não foi possível renovar a sessão remota: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    session.lastUsed = Date.now();
    return result;
  } finally {
    try {
      browser.disconnect();
    } catch {
      /* ignore */
    }
  }
}

async function capture(page: Page) {
  await new Promise((r) => setTimeout(r, 300));
  const screenshot = (await page.screenshot({
    type: "jpeg",
    quality: 60,
    encoding: "base64",
    fullPage: false,
  })) as string;
  const currentUrl = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  if (
    currentUrl.startsWith("chrome-error://") ||
    /ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|ERR_CONNECTION_RESET|This site can.t be reached/i.test(bodyText)
  ) {
    throw new Error("LATAM_NAVIGATION_BLOCKED");
  }
  return { screenshot, currentUrl, title };
}

export interface OpenSessionOpts {
  userId: string;
  url: string;
  viewportWidth: number;
  viewportHeight: number;
  useResidentialProxy?: boolean;
}

export async function openLiveSession(opts: OpenSessionOpts) {
  cleanup();

  // fecha sessão anterior do mesmo usuário
  for (const [id, s] of sessions.entries()) {
    if (s.userId === opts.userId) {
      sessions.delete(id);
      closeRemote(s.wsEndpoint).catch(() => {});
    }
  }

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN não configurado");

  const params = new URLSearchParams({
    token,
    timeout: String(OPEN_REQUEST_TIMEOUT_MS),
  });
  if (opts.useResidentialProxy) {
    params.set("proxy", "residential");
    params.set("proxyCountry", "br");
    params.set("proxySticky", "true");
    params.set("proxyLocaleMatch", "true");
  }
  const endpoint = `${BROWSERLESS_BASE}/stealth/bql?${params.toString()}`;
  const query = `
    mutation OpenLive($url: String!) {
      goto(url: $url, waitUntil: domContentLoaded, timeout: 35000) { status }
      reconnect(timeout: ${SESSION_RECONNECT_MS}) { browserWSEndpoint }
    }
  `;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_REQUEST_TIMEOUT_MS + 2_000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { url: opts.url } }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Browserless HTTP ${response.status}: ${body.slice(0, 2000)}`);
  }
  const payload = JSON.parse(body) as {
    data?: { reconnect?: { browserWSEndpoint?: string } };
    errors?: Array<{ message?: string }>;
  };
  const raw = payload.data?.reconnect?.browserWSEndpoint;
  if (!raw) {
    const detail = payload.errors?.map((e) => e.message).filter(Boolean).join("; ") || body;
    throw new Error(`Browserless não devolveu sessão: ${detail.slice(0, 1000)}`);
  }
  const ws = new URL(raw);
  if (!ws.searchParams.has("token")) ws.searchParams.set("token", token);
  const wsEndpoint = ws.toString();

  const session: StoredSession = {
    id: randomUUID(),
    userId: opts.userId,
    wsEndpoint,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    viewport: { width: opts.viewportWidth, height: opts.viewportHeight },
  };
  sessions.set(session.id, session);

  let shot: Awaited<ReturnType<typeof capture>>;
  try {
    shot = await withConnection(session, (page) => capture(page));
  } catch (error) {
    sessions.delete(session.id);
    await closeRemote(session.wsEndpoint).catch(() => {});
    throw error;
  }
  return {
    sessionId: session.id,
    ...shot,
    width: opts.viewportWidth,
    height: opts.viewportHeight,
  };
}

export async function runLiveStep(opts: {
  userId: string;
  sessionId: string;
  step: LiveStep;
}) {
  const session = requireSession(opts.sessionId, opts.userId);
  return withConnection(session, async (page) => {
    const s = opts.step;
    if (s.action === "goto") {
      await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 1200));
    } else if (s.action === "wait") {
      await new Promise((r) => setTimeout(r, s.ms));
    } else if (s.action === "click") {
      await page.mouse.move(s.x, s.y, { steps: 8 });
      await page.mouse.click(s.x, s.y, { delay: 60 });
      await new Promise((r) => setTimeout(r, 1200));
    } else if (s.action === "type") {
      await page.mouse.click(s.x, s.y, { delay: 60 });
      if (s.clearFirst) {
        await page.keyboard.down("Control");
        await page.keyboard.press("A");
        await page.keyboard.up("Control");
        await page.keyboard.press("Backspace");
      }
      await page.keyboard.type(s.text, { delay: 30 });
    } else if (s.action === "press") {
      await page.keyboard.press(s.key as never);
      await new Promise((r) => setTimeout(r, 600));
    } else if (s.action === "scroll") {
      await page.evaluate((dy: number) => window.scrollBy(0, dy), s.dy);
      await new Promise((r) => setTimeout(r, 500));
    } else if (s.action === "back") {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 800));
    }
    return capture(page);
  });
}

export async function screenshotLiveSession(opts: { userId: string; sessionId: string }) {
  const session = requireSession(opts.sessionId, opts.userId);
  return withConnection(session, (page) => capture(page));
}

export async function heartbeatLiveSession(opts: { userId: string; sessionId: string }) {
  const session = requireSession(opts.sessionId, opts.userId);
  await withConnection(session, async () => undefined);
  return { alive: true as const };
}

export async function closeLiveSession(opts: { userId: string; sessionId: string }) {
  const session = sessions.get(opts.sessionId);
  if (!session || session.userId !== opts.userId) return { ok: true };
  sessions.delete(opts.sessionId);
  await closeRemote(session.wsEndpoint).catch(() => {});
  return { ok: true };
}

async function closeRemote(wsEndpoint: string) {
  const puppeteer = await import("puppeteer-core");
  try {
    const browser = await puppeteer.default.connect({ browserWSEndpoint: wsEndpoint });
    await browser.close();
  } catch {
    /* ignore */
  }
}
