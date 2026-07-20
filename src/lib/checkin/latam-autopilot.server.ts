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

export async function runLatamAutopilot(input: AutopilotInput): Promise<AutopilotResult> {
  const token = process.env.BROWSERLESS_TOKEN;
  const aiKey = process.env.LOVABLE_API_KEY;
  if (!token) throw new Error("BROWSERLESS_TOKEN ausente");
  if (!aiKey) throw new Error("LOVABLE_API_KEY ausente");

  // Sempre abre o deep-link da LATAM já preenchido — pula o formulário de busca.
  const directUrl = `https://www.latamairlines.com/br/pt/check-in/status?orderId=${encodeURIComponent(input.locator.trim().toUpperCase())}&lastName=${encodeURIComponent(input.surname.trim().toLowerCase())}`;

  const goal = `Fazer o check-in online da LATAM e baixar o cartão de embarque em PDF, exatamente como um humano faria.

DADOS DO PEDIDO (use SEMPRE estes valores — não invente, não altere):
- Localizador da reserva (PNR / código de 6 caracteres): ${input.locator}
- Sobrenome do passageiro (o mesmo que está na reserva): ${input.surname}

IMPORTANTE: A página já abre DIRETO na tela de status/passageiros do check-in (URL com orderId + lastName). Você NÃO precisa digitar localizador nem sobrenome — a LATAM já reconheceu a reserva pela URL. Se por acaso cair no formulário de busca, aí sim preencha:
- Campo "Código da reserva" / "Localizador" / "PNR" → ${input.locator}
- Campo "Sobrenome" / "Last name" → ${input.surname}
- Botão "Buscar" / "Continuar" → clique.

Fluxo esperado a partir da tela inicial:
1. Se pedir pra escolher passageiros, marque TODOS os checkboxes e clique "Continuar".
2. Se pedir aceite de termos / condições / bagagem, marque TODOS os checkboxes de aceite.
3. Tela de assento → procure "Pular" / "Continuar sem selecionar" / "Escolher depois" / "Skip". NUNCA selecione assento pago.
4. Tela de bagagem / upgrade / seguro → "Pular" / "Não, obrigado". NUNCA compre extras.
5. Tela final → botão "Baixar cartão de embarque" / "Baixar PDF" / "Download boarding pass" — clique e responda { "action": "done" }.

REGRAS DE OURO:
- Trabalhe SEMPRE com base no que está visível no screenshot atual. Não tente adivinhar a próxima tela.
- Antes de digitar num campo, dê UM clique nele pra focar (use clearFirst:true no type pra apagar valor antigo).
- Se um popup de cookies aparecer ("Aceitar todos", "Accept all", "OK"), aceite antes de qualquer outra ação.
- Se aparecer aviso de que a reserva tem bebê (INF) ou criança (CHD) e o check-in online NÃO é permitido, responda { "action": "abort", "reason": "reserva com bebê/criança exige check-in no aeroporto" }.
- Se ficar preso na mesma tela por 3 tentativas seguidas sem progresso, responda abort explicando o motivo.
- Se a página estiver carregando (spinner, tela em branco), responda { "action": "wait", "ms": 2500 } em vez de clicar no escuro.
- Nunca clique em "Sair", "Cancelar reserva", "Alterar voo" ou qualquer coisa que não seja o fluxo de check-in.

COORDENADAS: x cresce pra direita, y cresce pra baixo. Origem (0,0) é o canto superior esquerdo. Aponte pro CENTRO do elemento que você quer clicar.`;


  const script = `
export default async ({ page, browser, context }) => {
  const { checkinUrl, goal, aiKey, maxSteps, viewportWidth, viewportHeight } = context;
  const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
  const MODEL = "google/gemini-3.5-flash";

  const transcript = [];
  const pdfCaptures = [];
  const configuredPages = new WeakSet();
  const unusablePages = new WeakSet();
  const activeBrowser = browser || (page && typeof page.browser === "function" ? page.browser() : null);
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
    try { pages = activeBrowser ? await activeBrowser.pages() : []; } catch (_) {}
    const openPages = pages.filter((candidate) => candidate && !candidate.isClosed() && !unusablePages.has(candidate));
    const latamPage = [...openPages].reverse().find((candidate) => {
      try { return candidate.url().includes("latamairlines.com"); } catch (_) { return false; }
    });
    const currentStillOpen = activePage && !activePage.isClosed() ? activePage : null;
    activePage = latamPage || openPages[openPages.length - 1] || currentStillOpen;
    if ((!activePage || activePage.isClosed() || unusablePages.has(activePage)) && createIfMissing && activeBrowser) {
      activePage = await activeBrowser.newPage();
      await configurePage(activePage);
      await activePage.goto(checkinUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    }
    if (!activePage || activePage.isClosed()) throw new Error("A aba da LATAM foi fechada durante a automação");
    await configurePage(activePage);
    await activePage.bringToFront().catch(() => {});
    return activePage;
  };

  const captureActivePage = async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = await resolveActivePage(attempt > 0);
      try {
        await new Promise((r) => setTimeout(r, 500 + attempt * 500));
        return await candidate.screenshot({ type: "jpeg", quality: 60, encoding: "base64", fullPage: false });
      } catch (error) {
        lastError = error;
        const message = String(error && error.message || error);
        if (!/not attached|target closed|session closed|detached|most likely the page has been closed/i.test(message)) throw error;
        unusablePages.add(candidate);
        if (activePage === candidate) activePage = null;
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
      if (activePage) unusablePages.add(activePage);
      activePage = null;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (navigationError) throw navigationError;
  await new Promise((r) => setTimeout(r, 3000));

  const navigationPage = await resolveActivePage();
  const navigationUrl = navigationPage.url();
  const navigationText = await navigationPage.evaluate(() => document.body?.innerText || "").catch(() => "");
  if (navigationUrl.startsWith("chrome-error://") || /ERR_HTTP2_PROTOCOL_ERROR|This site can.t be reached/i.test(navigationText)) {
    throw new Error("A LATAM recusou a conexão desta sessão do navegador");
  }

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
        await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 180)));
        if (decision.clearFirst) {
          await currentPage.keyboard.down("Control"); await currentPage.keyboard.press("A"); await currentPage.keyboard.up("Control");
          await currentPage.keyboard.press("Backspace");
        }
        for (const character of String(decision.text || "")) {
          await currentPage.keyboard.type(character);
          await new Promise((r) => setTimeout(r, 90 + Math.floor(Math.random() * 100)));
        }
        await new Promise((r) => setTimeout(r, 350 + Math.floor(Math.random() * 300)));
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

  type BrowserlessOut = {
    pdfB64: string;
    transcript: Array<{ i: number; action: string; reason?: string; ok: boolean; err?: string }>;
    finalUrl: string;
    costCents: number;
    doneReason: string;
    source: "intercepted-pdf" | "printed-page";
    steps: number;
  };
  const { runBrowserlessFunction } = await import("./browserless.server");
  const browserContext = {
    checkinUrl: directUrl,
    goal,
    aiKey,
    maxSteps: input.maxSteps ?? 25,
    viewportWidth: 1280,
    viewportHeight: 900,
  };
  const strategies = [
    { proxy: "residential" as const, proxyCountry: "br", proxySticky: true },
    { proxy: undefined, proxyCountry: undefined, proxySticky: undefined },
  ];
  let d: BrowserlessOut | undefined;
  let lastError: unknown;
  for (const strategy of strategies) {
    try {
      const result = await runBrowserlessFunction<BrowserlessOut>(script, browserContext, {
        timeoutMs: 600_000,
        launch: {
          headless: true,
          stealth: true,
          args: ["--disable-http2", "--disable-quic", "--lang=pt-BR"],
        },
        ...strategy,
      });
      if (result.data?.pdfB64) {
        d = result.data;
        break;
      }
      throw new Error("Piloto automático não capturou PDF");
    } catch (error) {
      lastError = error;
    }
  }
  if (!d) {
    const detail = lastError instanceof Error ? lastError.message : String(lastError || "erro desconhecido");
    throw new Error(`Não foi possível abrir a LATAM no navegador protegido: ${detail}`);
  }
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
