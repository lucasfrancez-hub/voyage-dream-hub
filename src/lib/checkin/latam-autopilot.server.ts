/**
 * Piloto automático de check-in — 100% autônomo.
 *
 * Loop no Browserless:
 *   1. screenshot da tela
 *   2. envia pro Gemini (Lovable AI Gateway) junto com o histórico e o objetivo
 *   3. IA devolve UMA ação { click | type | press | scroll | wait | done | abort }
 *   4. executa a ação
 *   5. repete até "done" (PDF capturado) ou "abort"
 *
 * Captura de PDF: escuta TODAS as respostas com Content-Type application/pdf
 * durante a sessão. Quando a IA diz "done", devolve o último PDF capturado.
 * Fallback: se não houver PDF interceptado, imprime a página atual em PDF.
 */

export interface AutopilotInput {
  checkinUrl: string;
  locator: string;
  surname: string;
  maxSteps?: number;
}

export interface AutopilotResult {
  boardingPassBase64: string;
  contentType: string;
  meta: {
    steps: number;
    transcript: Array<{ i: number; action: string; reason?: string; ok: boolean; err?: string }>;
    visionCostCents: number;
    finalUrl: string;
    source: "intercepted-pdf" | "printed-page";
  };
}

const BROWSERLESS_URL = "https://production-sfo.browserless.io/function";

export async function runLatamAutopilot(input: AutopilotInput): Promise<AutopilotResult> {
  const token = process.env.BROWSERLESS_TOKEN;
  const aiKey = process.env.LOVABLE_API_KEY;
  if (!token) throw new Error("BROWSERLESS_TOKEN ausente");
  if (!aiKey) throw new Error("LOVABLE_API_KEY ausente");

  const goal = `Fazer o check-in online da LATAM até baixar o cartão de embarque em PDF.
Localizador (orderId): ${input.locator}
Sobrenome: ${input.surname}

REGRAS:
- NUNCA selecione bagagem paga, assento pago, upgrade, seguro ou qualquer produto extra.
- Se aparecer tela de assento/bagagem, procure "Pular", "Continuar sem selecionar", "Não, obrigado" ou similar.
- Se aparecer aviso de bebê (INF) ou criança (CHD) que não permite check-in online, aborte com motivo.
- Marque TODOS os passageiros/checkboxes de aceite quando pedir.
- Quando chegar na tela final com botão "Baixar PDF" / "Download boarding pass" / "Imprimir cartão", clique nele e depois responda done.
- Se um popup de cookies aparecer, aceite (clique em "Aceitar" / "OK").`;

  const script = `
export default async ({ page, browser, context }) => {
  const { checkinUrl, goal, aiKey, maxSteps, viewportWidth, viewportHeight } = context;
  const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
  const MODEL = "google/gemini-3.5-flash";

  const transcript = [];
  const pdfCaptures = [];
  const configuredPages = new WeakSet();
  let activePage = page;

  const configurePage = async (candidate) => {
    if (!candidate || candidate.isClosed() || configuredPages.has(candidate)) return;
    configuredPages.add(candidate);
    await candidate.setViewport({ width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1 }).catch(() => {});
    await candidate.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36").catch(() => {});
    candidate.on("response", async (resp) => {
      try {
        const ct = (resp.headers()["content-type"] || "").toLowerCase();
        if (ct.includes("application/pdf") || (resp.url() || "").toLowerCase().endsWith(".pdf")) {
          const buf = await resp.buffer();
          if (buf && buf.length > 1000) {
            pdfCaptures.push({ url: resp.url(), b64: buf.toString("base64") });
          }
        }
      } catch (_) {}
    });
    try {
      const client = await candidate.target().createCDPSession();
      await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: "/tmp" });
    } catch (_) {}
  };

  const resolveActivePage = async (createIfMissing = false) => {
    let pages = [];
    try { pages = browser ? await browser.pages() : []; } catch (_) {}
    const openPages = pages.filter((candidate) => candidate && !candidate.isClosed());
    const latamPage = [...openPages].reverse().find((candidate) => {
      try { return candidate.url().includes("latamairlines.com"); } catch (_) { return false; }
    });
    const currentStillOpen = activePage && !activePage.isClosed() ? activePage : null;
    activePage = latamPage || openPages[openPages.length - 1] || currentStillOpen;
    if ((!activePage || activePage.isClosed()) && createIfMissing && browser) {
      activePage = await browser.newPage();
    }
    if (!activePage || activePage.isClosed()) throw new Error("A aba da LATAM foi fechada durante a automação");
    await configurePage(activePage);
    await activePage.bringToFront().catch(() => {});
    return activePage;
  };

  const captureActivePage = async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = await resolveActivePage(attempt === 2);
      try {
        await new Promise((r) => setTimeout(r, 500 + attempt * 500));
        return await candidate.screenshot({ type: "jpeg", quality: 60, encoding: "base64", fullPage: false });
      } catch (error) {
        lastError = error;
        const message = String(error && error.message || error);
        if (!/not attached|target closed|session closed|detached|most likely the page has been closed/i.test(message)) throw error;
        await new Promise((r) => setTimeout(r, 700));
      }
    }
    throw lastError || new Error("Não foi possível capturar a tela ativa da LATAM");
  };

  await configurePage(activePage);
  let navigationError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const navigationPage = attempt === 0 ? activePage : await resolveActivePage(true);
      if (navigationPage.url() === "about:blank" || !navigationPage.url().includes("latamairlines.com")) {
        await navigationPage.goto(checkinUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      }
      navigationError = null;
      break;
    } catch (error) {
      navigationError = error;
      activePage = null;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (navigationError) throw navigationError;
  await new Promise((r) => setTimeout(r, 3000));

  let totalCostCents = 0;
  let doneReason = "";
  let source = "printed-page";

  for (let i = 0; i < maxSteps; i++) {
    const screenshotB64 = await captureActivePage();
    const currentPage = await resolveActivePage();
    const url = currentPage.url();
    const title = await currentPage.title().catch(() => "");
    const historySummary = transcript.slice(-8).map((t) => \`\${t.i}. \${t.action}\${t.reason ? " (" + t.reason + ")" : ""}\`).join(" | ");

    const system = \`Você é um agente autônomo que controla um browser para completar um objetivo.
Viewport: \${viewportWidth}x\${viewportHeight}. Origem (0,0) no canto superior esquerdo.
Responda APENAS um JSON válido com UMA ação:
{"action":"click","x":123,"y":456,"reason":"..."}
{"action":"type","x":123,"y":456,"text":"...","clearFirst":true,"reason":"..."}
{"action":"press","key":"Enter","reason":"..."}
{"action":"scroll","dy":600,"reason":"..."}
{"action":"wait","ms":2000,"reason":"aguardando carregar"}
{"action":"done","reason":"cartão baixado / botão de download já foi clicado"}
{"action":"abort","reason":"por que não dá pra continuar"}

Objetivo:
\${goal}

URL atual: \${url}
Título: \${title}
Passos anteriores: \${historySummary || "(nenhum)"}
PDFs capturados até agora: \${pdfCaptures.length}\`;

    let decision = null;
    try {
      const resp = await fetch(GATEWAY, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: [
              { type: "text", text: "Qual a próxima ação para avançar no check-in? Devolva SÓ o JSON." },
              { type: "image_url", image_url: { url: "data:image/jpeg;base64," + screenshotB64 } },
            ]},
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error("IA " + resp.status + ": " + t.slice(0, 300));
      }
      const j = await resp.json();
      const raw = j.choices?.[0]?.message?.content ?? "{}";
      const usage = j.usage || {};
      // Gemini flash ~ $0.075/M input, $0.30/M output → cents
      const inTok = usage.prompt_tokens || 0;
      const outTok = usage.completion_tokens || 0;
      totalCostCents += (inTok * 0.0000075 + outTok * 0.00003) * 100;
      const m = String(raw).match(/\\{[\\s\\S]*\\}/);
      decision = JSON.parse(m ? m[0] : raw);
    } catch (e) {
      transcript.push({ i, action: "ia_error", ok: false, err: String(e && e.message || e) });
      break;
    }

    const a = String(decision.action || "").toLowerCase();
    try {
      if (a === "done") { doneReason = decision.reason || ""; transcript.push({ i, action: "done", reason: decision.reason, ok: true }); break; }
      if (a === "abort") { throw new Error("IA abortou: " + (decision.reason || "sem motivo")); }

      if (a === "click") {
        await currentPage.mouse.move(+decision.x, +decision.y, { steps: 6 });
        await currentPage.mouse.click(+decision.x, +decision.y, { delay: 40 });
      } else if (a === "type") {
        await currentPage.mouse.click(+decision.x, +decision.y, { delay: 40 });
        if (decision.clearFirst) {
          await currentPage.keyboard.down("Control"); await currentPage.keyboard.press("A"); await currentPage.keyboard.up("Control");
          await currentPage.keyboard.press("Backspace");
        }
        await currentPage.keyboard.type(String(decision.text || ""), { delay: 25 });
      } else if (a === "press") {
        await currentPage.keyboard.press(String(decision.key || "Enter"));
      } else if (a === "scroll") {
        await currentPage.evaluate((dy) => window.scrollBy(0, dy), +decision.dy || 400);
      } else if (a === "wait") {
        await new Promise((r) => setTimeout(r, Math.min(+decision.ms || 1500, 8000)));
      } else {
        throw new Error("ação desconhecida: " + a);
      }
      transcript.push({ i, action: a, reason: decision.reason, ok: true });
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      transcript.push({ i, action: a, reason: decision.reason, ok: false, err: String(e && e.message || e) });
      break;
    }
  }

  // Espera um pouco pra qualquer PDF em vôo terminar
  await new Promise((r) => setTimeout(r, 2500));

  let pdfB64 = null;
  if (pdfCaptures.length > 0) {
    pdfB64 = pdfCaptures[pdfCaptures.length - 1].b64;
    source = "intercepted-pdf";
  } else {
    // fallback: printa a página atual (provável tela com cartão)
    const finalPage = await resolveActivePage();
    let buf;
    try {
      buf = await finalPage.pdf({ format: "A4", printBackground: true });
    } catch (error) {
      const recoveredPage = await resolveActivePage();
      buf = await recoveredPage.pdf({ format: "A4", printBackground: true });
    }
    pdfB64 = Buffer.from(buf).toString("base64");
    source = "printed-page";
  }

  const finalPage = await resolveActivePage();

  return {
    data: {
      pdfB64,
      transcript,
      finalUrl: finalPage.url(),
      costCents: Math.round(totalCostCents * 100) / 100,
      doneReason,
      source,
      steps: transcript.length,
    },
  };
};
`;

  const params = new URLSearchParams({ token, timeout: "600000" });
  const res = await fetch(`${BROWSERLESS_URL}?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: script,
      context: {
        checkinUrl: input.checkinUrl,
        goal,
        aiKey,
        maxSteps: input.maxSteps ?? 25,
        viewportWidth: 1280,
        viewportHeight: 900,
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Browserless HTTP ${res.status}: ${t.slice(0, 1500)}`);
  }
  type BrowserlessOut = {
    data: {
      pdfB64: string;
      transcript: Array<{ i: number; action: string; reason?: string; ok: boolean; err?: string }>;
      finalUrl: string;
      costCents: number;
      doneReason: string;
      source: "intercepted-pdf" | "printed-page";
      steps: number;
    };
  };
  const json = (await res.json()) as BrowserlessOut;
  const d = json.data;
  if (!d?.pdfB64) throw new Error("Piloto automático não capturou PDF");
  return {
    boardingPassBase64: d.pdfB64,
    contentType: "application/pdf",
    meta: {
      steps: d.steps,
      transcript: d.transcript,
      visionCostCents: d.costCents,
      finalUrl: d.finalUrl,
      source: d.source,
    },
  };
}
