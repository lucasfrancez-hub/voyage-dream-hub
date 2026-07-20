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
        // Cadência humana entre passos — replica o roundtrip HTTP que o
        // trainer tem naturalmente quando o botão "Repetir do zero" roda
        // do navegador. Sem essa pausa, LATAM detecta velocidade e bloqueia.
        if (i < resolvedSteps.length - 1) {
          const jitter = 450 + Math.floor(Math.random() * 550); // 450–1000 ms
          await new Promise((r) => setTimeout(r, jitter));
        }
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
