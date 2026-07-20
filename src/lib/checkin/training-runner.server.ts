/**
 * Runner compartilhado do robô de check-in por script salvo.
 * Usado tanto pelo treinador (`runTrainingScript`) quanto pelo check-in
 * automático de produção (`runCheckin` / `runCheckinGroup`).
 *
 * Recebe passos gravados no treinador (com {{locator}}/{{surname}}),
 * substitui os placeholders pelos dados reais da reserva, abre a página
 * no Browserless com proxy residencial BR + stealth e devolve:
 *   - screenshot final
 *   - logs de cada passo
 *   - captures (PNG das regiões `capture_region` — normalmente o cartão)
 */
import type { TrainingStep } from "./training.functions";

export type ScriptRunResult = {
  screenshot: string;
  currentUrl: string;
  title: string;
  logs: Array<{ i?: number; step?: string; action?: string; url?: string; ok: boolean; err?: string }>;
  captures: Array<{ i: number; kind: "region"; pngBase64: string; filename: string | null; width: number; height: number }>;
  width: number;
  height: number;
};

/**
 * Executa um script salvo usando exatamente a mesma sessão viva/CDP usada
 * pelo botão "Repetir do zero" do treinador. Não usa o endpoint /function.
 */
export async function runScriptInLiveSession(opts: {
  userId: string;
  url: string;
  steps: TrainingStep[];
  viewportWidth?: number;
  viewportHeight?: number;
  locator?: string;
  surname?: string;
}): Promise<ScriptRunResult> {
  const viewportWidth = opts.viewportWidth ?? 1280;
  const viewportHeight = opts.viewportHeight ?? 900;
  const locator = (opts.locator || "").trim();
  const surname = (opts.surname || "").trim();
  const resolvedSteps = opts.steps.map((step) => {
    if (step.action === "type") {
      return {
        ...step,
        text: step.text
          .replaceAll("{{locator}}", locator)
          .replaceAll("{{surname}}", surname),
      };
    }
    if (step.action === "goto") {
      return {
        ...step,
        url: rebuildInitialUrlForOrder(
          step.url
            .replaceAll("{{locator}}", encodeURIComponent(locator))
            .replaceAll("{{surname}}", encodeURIComponent(surname)),
          locator,
          surname,
        ),
      };
    }
    return step;
  });

  const {
    openLiveSession,
    runLiveStep,
    captureRegionPng,
    screenshotLiveSession,
    closeLiveSession,
  } = await import("./training-session.server");
  const logs: ScriptRunResult["logs"] = [];
  const captures: ScriptRunResult["captures"] = [];
  let sessionId = "";
  let latest: { screenshot: string; currentUrl: string; title: string } | null = null;

  try {
    const opened = await openLiveSession({
      userId: opts.userId,
      url: opts.url,
      viewportWidth,
      viewportHeight,
      useResidentialProxy: true,
    });
    sessionId = opened.sessionId;
    latest = opened;
    logs.push({ step: "goto", url: opts.url, ok: true });

    for (let i = 0; i < resolvedSteps.length; i += 1) {
      const step = resolvedSteps[i];
      try {
        if (step.action === "capture_region") {
          const captured = await captureRegionPng({
            userId: opts.userId,
            sessionId,
            x: step.x,
            y: step.y,
            width: step.width,
            height: step.height,
          });
          captures.push({
            i,
            kind: "region",
            pngBase64: captured.pngBase64,
            filename: step.filename || null,
            width: Math.max(10, Math.round(step.width)),
            height: Math.max(10, Math.round(step.height)),
          });
          latest = await screenshotLiveSession({ userId: opts.userId, sessionId });
        } else {
          latest = await runLiveStep({ userId: opts.userId, sessionId, step });
        }
        logs.push({ i, action: step.action, ok: true, url: latest.currentUrl });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logs.push({ i, action: step.action, ok: false, err: detail });
        throw new Error(`Etapa ${i + 1} (${step.action}) falhou: ${detail}`);
      }
    }

    if (!latest) throw new Error("A sessão não devolveu a tela final");
    return {
      ...latest,
      logs,
      captures,
      width: viewportWidth,
      height: viewportHeight,
    };
  } finally {
    if (sessionId) {
      await closeLiveSession({ userId: opts.userId, sessionId }).catch(() => undefined);
    }
  }
}

export async function runScriptOnBrowserless(opts: {
  url: string;
  steps: TrainingStep[];
  viewportWidth?: number;
  viewportHeight?: number;
  locator?: string;
  surname?: string;
  timeoutMs?: number;
}): Promise<ScriptRunResult> {
  const viewportWidth = opts.viewportWidth ?? 1280;
  const viewportHeight = opts.viewportHeight ?? 900;
  const locator = (opts.locator || "").trim();
  const surname = (opts.surname || "").trim();

  const resolvedSteps = opts.steps.map((s) => {
    if (s.action !== "type") return s;
    const text = s.text
      .replaceAll("{{locator}}", locator)
      .replaceAll("{{surname}}", surname);
    return { ...s, text };
  });

  const payload = { url: opts.url, steps: resolvedSteps, viewportWidth, viewportHeight };

  const code = `
export default async ({ page, browser, context }) => {
  const { url, steps, viewportWidth, viewportHeight } = context;
  const logs = [];
  const captures = [];
  const configuredPages = new WeakSet();
  const unusablePages = new WeakSet();
  const activeBrowser = browser || (page && typeof page.browser === "function" ? page.browser() : null);
  let activePage = page;

  const configurePage = async (candidate) => {
    if (!candidate || candidate.isClosed() || configuredPages.has(candidate)) return;
    configuredPages.add(candidate);
    await candidate.setViewport({ width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1 }).catch(() => {});
    await candidate.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36").catch(() => {});
  };

  const resolveActivePage = async (createIfMissing = false) => {
    let pages = [];
    try { pages = activeBrowser ? await activeBrowser.pages() : []; } catch (_) {}
    const openPages = pages.filter((c) => c && !c.isClosed() && !unusablePages.has(c));
    const preferred = [...openPages].reverse().find((c) => {
      try { return /latamairlines|voegol|voeazul/.test(c.url()); } catch (_) { return false; }
    });
    const currentStillOpen = activePage && !activePage.isClosed() ? activePage : null;
    activePage = preferred || openPages[openPages.length - 1] || currentStillOpen;
    if ((!activePage || activePage.isClosed() || unusablePages.has(activePage)) && createIfMissing && activeBrowser) {
      activePage = await activeBrowser.newPage();
      await configurePage(activePage);
      await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    }
    if (!activePage || activePage.isClosed()) throw new Error("A aba foi fechada durante a execução do script");
    await configurePage(activePage);
    await activePage.bringToFront().catch(() => {});
    return activePage;
  };

  const captureActivePage = async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = await resolveActivePage(attempt > 0);
      try {
        await new Promise((r) => setTimeout(r, 250 + attempt * 400));
        return await candidate.screenshot({ type: "jpeg", quality: 60, encoding: "base64", fullPage: false });
      } catch (error) {
        lastError = error;
        const msg = String(error && error.message || error);
        if (!/not attached|target closed|session closed|detached|most likely the page has been closed/i.test(msg)) throw error;
        unusablePages.add(candidate);
        if (activePage === candidate) activePage = null;
        await new Promise((r) => setTimeout(r, 700));
      }
    }
    throw lastError || new Error("Não foi possível capturar a tela ativa");
  };

  await configurePage(activePage);

  try {
    await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    logs.push({ step: "goto", url, ok: true });
    await new Promise((r) => setTimeout(r, 900));
  } catch (e) {
    logs.push({ step: "goto", url, ok: false, err: String(e && e.message || e) });
  }

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    try {
      const currentPage = await resolveActivePage();
      if (s.action === "goto") {
        await currentPage.goto(s.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise((r) => setTimeout(r, 1500));
      } else if (s.action === "wait") {
        await new Promise((r) => setTimeout(r, s.ms));
      } else if (s.action === "click") {
        await currentPage.mouse.move(s.x, s.y, { steps: 8 });
        await currentPage.mouse.click(s.x, s.y, { delay: 60 });
        await new Promise((r) => setTimeout(r, 800));
      } else if (s.action === "type") {
        await currentPage.mouse.click(s.x, s.y, { delay: 60 });
        await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 180)));
        if (s.clearFirst) {
          await currentPage.keyboard.down("Control");
          await currentPage.keyboard.press("A");
          await currentPage.keyboard.up("Control");
          await currentPage.keyboard.press("Backspace");
        }
        for (const ch of s.text) {
          await currentPage.keyboard.type(ch);
          await new Promise((r) => setTimeout(r, 90 + Math.floor(Math.random() * 100)));
        }
        await new Promise((r) => setTimeout(r, 350 + Math.floor(Math.random() * 300)));
      } else if (s.action === "press") {
        await currentPage.keyboard.press(s.key);
        await new Promise((r) => setTimeout(r, 600));
      } else if (s.action === "scroll") {
        await currentPage.evaluate((dy) => window.scrollBy(0, dy), s.dy);
        await new Promise((r) => setTimeout(r, 500));
      } else if (s.action === "capture_region") {
        const clip = { x: Math.max(0, s.x), y: Math.max(0, s.y), width: Math.max(1, s.width), height: Math.max(1, s.height) };
        const pngB64 = await currentPage.screenshot({ type: "png", encoding: "base64", clip });
        captures.push({ i, kind: "region", pngBase64: pngB64, filename: s.filename || null, width: clip.width, height: clip.height });
      }
      logs.push({ i, action: s.action, ok: true });
    } catch (e) {
      logs.push({ i, action: s.action, ok: false, err: String(e && e.message || e) });
      break;
    }
  }

  const screenshot = await captureActivePage();
  const finalPage = await resolveActivePage();
  const currentUrl = finalPage.url();
  const title = await finalPage.title().catch(() => "");
  const bodyText = await finalPage.evaluate(() => document.body?.innerText || "").catch(() => "");
  if (currentUrl.startsWith("chrome-error://") || /ERR_HTTP2_PROTOCOL_ERROR|This site can.t be reached/i.test(bodyText)) {
    throw new Error("A companhia recusou a conexão desta sessão do navegador");
  }
  return { data: { screenshot, currentUrl, title, logs, captures, width: viewportWidth, height: viewportHeight } };
};
`;

  const { runBrowserlessFunction } = await import("@/lib/checkin/browserless.server");
  const result = await runBrowserlessFunction<ScriptRunResult>(code, payload, {
    timeoutMs: opts.timeoutMs ?? 180_000,
    launch: {
      headless: true,
      stealth: true,
      args: ["--disable-http2", "--disable-quic", "--lang=pt-BR"],
    },
    proxy: "residential",
    proxyCountry: "br",
    proxySticky: true,
  });
  if (!result.data) throw new Error("O navegador remoto não devolveu resultado");
  return result.data;
}

/**
 * Reconstrói a URL inicial de um script salvo usando o localizador/sobrenome
 * reais da reserva. Só age em URLs LATAM check-in/status (deep-link).
 * Para outras companhias devolve a URL original — os passos digitam os dados.
 */
export function rebuildInitialUrlForOrder(originalUrl: string, locator: string, surname: string): string {
  try {
    const u = new URL(originalUrl);
    if (/latamairlines\.com$/i.test(u.hostname) && /\/check-in\/status/i.test(u.pathname)) {
      u.searchParams.set("orderId", locator.trim().toUpperCase());
      u.searchParams.set("lastName", surname.trim().toLowerCase());
      return u.toString();
    }
  } catch { /* URL inválida, ignora */ }
  return originalUrl;
}
