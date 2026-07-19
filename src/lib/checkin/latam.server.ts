/**
 * Script de check-in LATAM executado dentro do Chrome do Browserless.
 * Retorna { boardingPassBase64, boardingPassContentType, meta } ou lança erro.
 *
 * Fluxo:
 * 1. Abre a página pública de check-in da LATAM.
 * 2. Digita localizador + sobrenome do 1º passageiro.
 * 3. Aceita termos, avança até a página de contato de emergência e RECUSA.
 * 4. Baixa o PDF de todos os cartões de embarque.
 */

import { runBrowserlessFunction } from "./browserless.server";

export interface LatamCheckinInput {
  locator: string;
  surname: string;
}

export interface LatamCheckinResult {
  boardingPassBase64: string;
  contentType: string;
  meta?: Record<string, unknown>;
}

// Script executado no browser remoto (isolado — nada de closures do worker).
// Este código roda dentro do Chrome do Browserless.
const LATAM_SCRIPT = /* js */ `
export default async function ({ page, context }) {
  const { locator, surname } = context;
  const log = [];
  const step = (m) => { log.push(new Date().toISOString() + ' — ' + m); };

  page.setDefaultTimeout(45_000);
  await page.setViewportSize({ width: 1366, height: 900 });

  step('open latam check-in');
  await page.goto('https://www.latamairlines.com/br/pt/checkin', { waitUntil: 'domcontentloaded' });

  // Aceita cookies se aparecer
  try {
    const cookieBtn = await page.$('button:has-text("Aceitar")');
    if (cookieBtn) await cookieBtn.click({ timeout: 3000 });
  } catch {}

  step('fill locator');
  const locInput = await page.waitForSelector('input[name="pnr" i], input[placeholder*="localizador" i], input[id*="pnr" i]', { timeout: 30_000 });
  await locInput.fill(locator.trim().toUpperCase());

  step('fill surname');
  const surInput = await page.waitForSelector('input[name*="last" i], input[name*="surname" i], input[placeholder*="sobrenome" i], input[id*="last" i]');
  await surInput.fill(surname.trim());

  step('submit login');
  const submit = await page.waitForSelector('button[type="submit"], button:has-text("Continuar"), button:has-text("Buscar")');
  await submit.click();

  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});

  // A LATAM tem várias telas condicionais. Vamos avançar clicando em "Continuar/Confirmar/Aceitar"
  // e recusando em qualquer tela de "contato de emergência" / "assento pago" / "bagagem".
  for (let i = 0; i < 15; i++) {
    step('flow iteration ' + i);
    // Se apareceu o botão de baixar cartão, saímos do loop.
    const download = await page.$('a:has-text("Baixar cartão"), a:has-text("cartão de embarque"), button:has-text("Baixar")');
    if (download) { step('boarding pass link visible'); break; }

    // Recusa contato de emergência
    const skipEmergency = await page.$(
      'button:has-text("Agora não"), button:has-text("Continuar sem"), button:has-text("Não, obrigado"), button:has-text("Pular")'
    );
    if (skipEmergency) { await skipEmergency.click().catch(() => {}); await page.waitForTimeout(1500); continue; }

    // Recusa assento pago
    const skipSeat = await page.$('button:has-text("Manter assento"), button:has-text("Continuar sem alterar")');
    if (skipSeat) { await skipSeat.click().catch(() => {}); await page.waitForTimeout(1500); continue; }

    // Aceita termos genéricos
    const acceptTerms = await page.$('input[type="checkbox"][name*="term" i], input[type="checkbox"][id*="term" i]');
    if (acceptTerms) { await acceptTerms.check().catch(() => {}); }

    // Clica em Continuar/Confirmar
    const next = await page.$('button:has-text("Continuar"), button:has-text("Confirmar"), button:has-text("Aceitar")');
    if (next) { await next.click().catch(() => {}); await page.waitForTimeout(2000); continue; }

    // Nenhum botão conhecido — quebra
    step('no known button, breaking');
    break;
  }

  step('try to download boarding pass');
  // Tenta capturar o PDF.
  // Opção A: link direto pro PDF (mais comum na LATAM)
  const pdfLink = await page.$('a[href*=".pdf"], a:has-text("PDF"), a:has-text("Baixar cartão")');
  let pdfBuffer = null;
  let contentType = 'application/pdf';

  if (pdfLink) {
    const href = await pdfLink.getAttribute('href');
    if (href) {
      const abs = new URL(href, page.url()).toString();
      step('fetching pdf: ' + abs.slice(0, 100));
      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map(c => c.name + '=' + c.value).join('; ');
      const resp = await page.request.get(abs, { headers: { cookie: cookieHeader } });
      if (resp.ok()) {
        pdfBuffer = await resp.body();
        contentType = resp.headers()['content-type'] || 'application/pdf';
      }
    }
  }

  // Fallback: imprime a página atual como PDF
  if (!pdfBuffer) {
    step('fallback: print page as pdf');
    pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    contentType = 'application/pdf';
  }

  return {
    data: {
      boardingPassBase64: pdfBuffer.toString('base64'),
      contentType,
      meta: { log, url: page.url() },
    },
    type: 'application/json',
  };
}
`;

export async function runLatamCheckin(input: LatamCheckinInput): Promise<LatamCheckinResult> {
  const res = await runBrowserlessFunction<LatamCheckinResult>(LATAM_SCRIPT, {
    locator: input.locator,
    surname: input.surname,
  }, { timeoutMs: 150_000 });
  if (!res.data?.boardingPassBase64) {
    throw new Error("Browserless não devolveu PDF");
  }
  return res.data;
}
