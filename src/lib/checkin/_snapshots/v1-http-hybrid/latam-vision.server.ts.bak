/**
 * Robô LATAM — modo Visão IA.
 *
 * Em vez de seletores HTML, tira screenshot a cada passo, manda pro Gemini
 * Vision e usa as coordenadas devolvidas pra clicar/digitar como um humano.
 *
 * Fluxo:
 *   1. Abre latamairlines.com/br/pt/check-in/status?orderId=...&lastName=...
 *   2. Aceita cookies (se aparecer)
 *   3. Clica "Fazer check-in" no trecho elegível
 *   4. Dispensa avisos (Entendi / hazmat)
 *   5. Recusa contato de emergência → Salvar
 *   6. Baixa PDF (mesmo caminho canônico do robô código)
 *
 * Mantém a captura por URL canônica /cartao-de-embarque quando possível —
 * essa parte é determinística e não precisa de IA.
 */

import { connectBrowserlessStealth } from "./browserless.server";
import { decideNextAction } from "./vision-decide.server";

export interface LatamVisionInput {
  locator: string; // LA957... ou PNR 6 letras
  surname: string;
  checkinUrl?: string;
}

export interface LatamVisionPass {
  label: string;
  flightNumber?: string;
  fromIata?: string;
  toIata?: string;
  base64: string;
  contentType: string;
}

export interface LatamVisionResult {
  boardingPassBase64: string;
  contentType: string;
  boardingPasses: LatamVisionPass[];
  meta: {
    log: string[];
    visionCalls: number;
    visionCostCents: number;
    finalUrl: string;
  };
}

const VIEWPORT = { width: 1280, height: 900 };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function screenshotBase64(page: any): Promise<string> {
  const buf: Buffer | Uint8Array = await page.screenshot({ type: "png", fullPage: false });
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as any);
  return bytesToBase64(bytes);
}

async function humanMouseTo(page: any, x: number, y: number) {
  await page.mouse.move(x, y, { steps: 20 }).catch(() => {});
}

async function humanClick(page: any, x: number, y: number) {
  await humanMouseTo(page, x, y);
  await new Promise((r) => setTimeout(r, 120));
  await page.mouse.click(x, y, { delay: 60 }).catch(() => {});
}

async function humanType(page: any, x: number, y: number, text: string) {
  await humanClick(page, x, y);
  await new Promise((r) => setTimeout(r, 150));
  // Limpa o campo antes
  await page.keyboard.down("Control").catch(() => {});
  await page.keyboard.press("KeyA").catch(() => {});
  await page.keyboard.up("Control").catch(() => {});
  await page.keyboard.press("Backspace").catch(() => {});
  await page.keyboard.type(text, { delay: 70 });
}

export async function runLatamCheckinVision(input: LatamVisionInput): Promise<LatamVisionResult> {
  const loc = String(input.locator || "").trim().toUpperCase();
  const sur = String(input.surname || "").trim();
  if (!loc || !sur) throw new Error("locator e surname obrigatórios");

  const isFullOrderId = /^LA[A-Z0-9]{6,}$/i.test(loc);
  const startUrl = isFullOrderId
    ? `https://www.latamairlines.com/br/pt/check-in/status?orderId=${encodeURIComponent(loc)}&lastName=${encodeURIComponent(sur.toLowerCase())}`
    : "https://www.latamairlines.com/br/pt/check-in";

  const log: string[] = [];
  const step = (m: string) => log.push(new Date().toISOString() + " — " + m);
  let visionCalls = 0;
  let visionCostCents = 0;

  const session = await connectBrowserlessStealth(startUrl, 150_000);
  const { browser } = session;
  let page = session.page;

  try {
    await page.setViewport(VIEWPORT);
    page.setDefaultTimeout(30_000);
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" });

    step(`abrindo ${startUrl}`);
    if (!page.url().includes("latamairlines.com")) {
      await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 3500));

    // Se veio código curto (PNR), preenche o formulário via visão.
    if (!isFullOrderId) {
      await visionAct(
        `Localize o campo "Nº de compra" ou "Código da reserva" e digite: ${loc}`,
        { type: true, text: loc, contextHint: "formulário de busca de check-in" },
      );
      await new Promise((r) => setTimeout(r, 400));
      await visionAct(
        `Localize o campo "Sobrenome" e digite: ${sur}`,
        { type: true, text: sur.toLowerCase(), contextHint: "formulário de busca de check-in" },
      );
      await visionAct("Clique no botão de buscar / continuar / avançar do formulário.", { contextHint: "botão de submeter busca" });
      await new Promise((r) => setTimeout(r, 4000));
    }

    // Aceita cookies (best-effort)
    await tryVisionOnce("Se aparecer um aviso de cookies com 'Aceitar todos' ou similar, clique. Se não houver, responda notfound.");

    // Loop de decisão até chegar em algo que sinalize cartão pronto.
    for (let iter = 0; iter < 12; iter++) {
      const url = page.url().toLowerCase();
      if (url.includes("cartao-de-embarque") || url.includes("boarding")) {
        step(`iter ${iter}: já estou na tela de cartão`);
        break;
      }

      const decision = await visionAct(
        [
          "Este é o painel 'Minhas viagens' ou etapa do check-in da LATAM.",
          "Escolha UMA ação abaixo, na ordem de prioridade:",
          "  1) Se houver botão 'Baixar PDF' ou 'Ver cartão(ões) de embarque' visível, clique.",
          "  2) Se houver popup 'Entendi' ou aviso de materiais perigosos, clique em 'Entendi'.",
          "  3) Se houver botão 'Fazer check-in' num trecho AINDA NÃO REALIZADO (ignore trechos marcados 'Voo realizado' ou 'Concluído'), clique.",
          "  4) Se houver opção 'Não quero entregar contato de emergência' (radio/label), clique.",
          "  5) Se houver botão 'Salvar' ou 'Continuar' após recusar contato, clique.",
          "  6) Se nada acima estiver visível, responda notfound.",
        ].join("\n"),
        { contextHint: `iter ${iter} · url=${page.url()}` },
      );

      if (decision.action === "notfound" || decision.action === "done") {
        step(`iter ${iter}: sem ação (${decision.reason ?? decision.action}), aguardando`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }

    // ==== Captura canônica por URL — mesmo caminho do robô código ====
    // Para orderId + sobrenome dá pra ir direto em /cartao-de-embarque?segmentIndex=N
    const collected: LatamVisionPass[] = [];
    const currentUrl = new URL(page.url());
    const orderId = currentUrl.searchParams.get("orderId") || (isFullOrderId ? loc : "");
    const lastNameParam = (currentUrl.searchParams.get("lastName") || sur).toLowerCase();
    const itineraryId = currentUrl.searchParams.get("itineraryId") || "1";

    if (orderId && lastNameParam) {
      const passengerIds: string[] = await page.evaluate(() => {
        const ids = new Set<string>();
        const rx = /tripPassengerId=([A-Z0-9_]+)/gi;
        const scan = (s: string) => { let m; while ((m = rx.exec(s || ""))) ids.add(m[1]); };
        scan(document.documentElement.outerHTML);
        return Array.from(ids);
      }).catch(() => [] as string[]);
      const uniquePax = Array.from(new Set(passengerIds.length ? passengerIds : ["ADT_1"]));
      step(`passageiros: ${JSON.stringify(uniquePax)}`);

      const buildUrl = (segmentIndex: number, tripPassengerId: string) =>
        "https://www.latamairlines.com/br/pt/cartao-de-embarque?orderId=" + encodeURIComponent(orderId) +
        "&lastName=" + encodeURIComponent(lastNameParam) +
        "&segmentIndex=" + segmentIndex +
        "&itineraryId=" + encodeURIComponent(itineraryId) +
        "&tripPassengerId=" + encodeURIComponent(tripPassengerId);

      for (const paxId of uniquePax) {
        let emptyStreak = 0;
        for (let seg = 0; seg < 6; seg++) {
          const url = buildUrl(seg, paxId);
          step(`BP trecho=${seg} pax=${paxId}`);
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
          } catch (e: any) {
            step(`falha ao abrir BP: ${e?.message}`);
            emptyStreak++;
            if (emptyStreak >= 2) break;
            continue;
          }
          await new Promise((r) => setTimeout(r, 1250));

          // Dispensa "Entendi" com visão
          await tryVisionOnce("Se aparecer um modal com 'Entendi' ou aviso de itens perigosos, clique em 'Entendi'. Se não houver modal, responda notfound.");

          const hasBp = await page.evaluate(() => {
            const t = ((document.body?.innerText) || "").toLowerCase();
            return /cart[aã]o de embarque|boarding pass|port[aã]o/.test(t);
          }).catch(() => false);
          if (!hasBp) {
            emptyStreak++;
            if (emptyStreak >= 2) break;
            continue;
          }
          emptyStreak = 0;

          try {
            await page.emulateMediaType("screen").catch(() => {});
            await new Promise((r) => setTimeout(r, 600));
            const bytes = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
            const meta = await page.evaluate(() => {
              const t = ((document.body?.innerText) || "").replace(/\s+/g, " ");
              const route = t.match(/\b([A-Z]{3})\s*(?:→|->|–|—|-|>)\s*([A-Z]{3})\b/);
              const flight = t.match(/\b((?:LA|JJ)\s?\d{2,4})\b/);
              return { fromIata: route?.[1], toIata: route?.[2], flightNumber: flight?.[1]?.replace(/\s+/g, "") };
            }).catch(() => ({}) as any);
            const label = (meta.fromIata && meta.toIata)
              ? `${meta.fromIata} → ${meta.toIata}${meta.flightNumber ? " · " + meta.flightNumber : ""} · ${paxId}`
              : `Trecho ${seg + 1} · ${paxId}`;
            collected.push({
              label,
              flightNumber: meta.flightNumber,
              fromIata: meta.fromIata,
              toIata: meta.toIata,
              base64: bytesToBase64(new Uint8Array(bytes)),
              contentType: "application/pdf",
            });
            step(`capturou ${label}`);
          } catch (e: any) {
            step(`captura falhou: ${e?.message}`);
          }
        }
      }
    }

    if (collected.length === 0) {
      // Último recurso: imprime a tela atual
      try {
        await page.emulateMediaType("screen").catch(() => {});
        const bytes = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
        collected.push({
          label: "Cartão de embarque",
          base64: bytesToBase64(new Uint8Array(bytes)),
          contentType: "application/pdf",
        });
      } catch (e: any) {
        throw new Error(`Robô visão não capturou PDF: ${e?.message}. Log: ${log.slice(-6).join(" | ")}`);
      }
    }

    return {
      boardingPassBase64: collected[0].base64,
      contentType: collected[0].contentType,
      boardingPasses: collected,
      meta: { log, visionCalls, visionCostCents, finalUrl: page.url() },
    };
  } finally {
    await browser.close().catch(() => {});
  }

  // ---- helpers internos ----
  async function visionAct(
    instruction: string,
    opts: { type?: boolean; text?: string; contextHint?: string } = {},
  ) {
    const screenshotB64 = await screenshotBase64(page).catch(() => "");
    if (!screenshotB64) {
      step("screenshot falhou, pulando passo");
      return { action: "notfound", reason: "screenshot vazio" } as const;
    }
    const { decision, costCents } = await decideNextAction({
      screenshotBase64: screenshotB64,
      instruction,
      context: opts.contextHint,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
    });
    visionCalls++;
    visionCostCents += costCents;
    step(`vision: ${decision.action}${(decision as any).x ? ` @${(decision as any).x},${(decision as any).y}` : ""} — ${decision.reason ?? ""}`);

    if (decision.action === "click") {
      await humanClick(page, decision.x, decision.y);
    } else if (decision.action === "type") {
      await humanType(page, decision.x, decision.y, opts.text ?? decision.text);
    }
    return decision;
  }

  async function tryVisionOnce(instruction: string) {
    try {
      return await visionAct(instruction);
    } catch (e: any) {
      step(`visionOnce falhou: ${e?.message}`);
      return { action: "notfound", reason: "erro" } as const;
    }
  }
}
