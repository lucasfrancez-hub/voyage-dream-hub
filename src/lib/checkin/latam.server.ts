/**
 * Script de check-in LATAM executado dentro do Chrome do Browserless.
 * Fluxo real (jul/2026):
 *   1. Abre https://www.latamairlines.com/br/pt/check-in
 *   2. Preenche Nº de compra (LA...) OU código de reserva (6 letras) + sobrenome
 *   3. Se check-in já foi feito → clica "Ver cartão(ões) de embarque"
 *   4. Aceita "Entendi" na tela de elementos perigosos
 *   5. Marca "Não quero entregar um contato de emergência" e clica "Salvar"
 *   6. Clica "Baixar PDF" e captura o download
 */

import { runBrowserlessFunction } from "./browserless.server";

export interface LatamCheckinInput {
  /** LA957... (nº de compra) OU 6 letras (código de reserva) */
  locator: string;
  surname: string;
}

export interface LatamCheckinResult {
  boardingPassBase64: string;
  contentType: string;
  meta?: Record<string, unknown>;
}

const LATAM_SCRIPT = /* js */ `
export default async function ({ page, context }) {
  const { locator, surname } = context;
  const log = [];
  const step = (m) => { log.push(new Date().toISOString() + ' — ' + m); };

  page.setDefaultTimeout(45_000);
  await page.setViewport({ width: 1366, height: 900 });

  const loc = String(locator || '').trim().toUpperCase();
  const sur = String(surname || '').trim();
  if (!loc || !sur) throw new Error('locator e surname obrigatórios');

  step('open latam check-in page');
  await page.goto('https://www.latamairlines.com/br/pt/check-in', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Cookies / OneTrust
  for (const sel of ['#onetrust-accept-btn-handler', 'button:has-text("Aceitar")', 'button:has-text("Aceito")']) {
    const b = await page.$(sel);
    if (b) { await b.click().catch(() => {}); await page.waitForTimeout(500); break; }
  }

  step('fill locator');
  // A LATAM tem 2 abas: "Nº de compra" e "Código de reserva". O input geralmente é o mesmo.
  // Tentamos vários seletores.
  const locSelectors = [
    'input[name="reservationCode"]',
    'input[name="pnr"]',
    'input[id*="pnr" i]',
    'input[id*="reservation" i]',
    'input[placeholder*="localizador" i]',
    'input[placeholder*="reserva" i]',
    'input[placeholder*="compra" i]',
  ];
  let locInput = null;
  for (const s of locSelectors) {
    locInput = await page.$(s);
    if (locInput) { step('using loc selector: ' + s); break; }
  }
  if (!locInput) throw new Error('Campo de localizador não encontrado');
  await locInput.click();
  await locInput.fill('');
  await locInput.type(loc, { delay: 40 });

  step('fill surname');
  const surSelectors = [
    'input[name*="last" i]',
    'input[name*="surname" i]',
    'input[id*="last" i]',
    'input[id*="surname" i]',
    'input[placeholder*="sobrenome" i]',
    'input[placeholder*="apellido" i]',
  ];
  let surInput = null;
  for (const s of surSelectors) {
    surInput = await page.$(s);
    if (surInput) { step('using surname selector: ' + s); break; }
  }
  if (!surInput) throw new Error('Campo de sobrenome não encontrado');
  await surInput.click();
  await surInput.fill('');
  await surInput.type(sur, { delay: 40 });

  step('submit login');
  const submit = await page.waitForSelector(
    'button[type="submit"], button:has-text("Continuar"), button:has-text("Buscar"), button:has-text("Consultar")'
  );
  await submit.click();
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // ==== State machine unificado ====
  // Cobre TODOS os cenários: check-in já feito (vai direto pro cartão), fluxo completo,
  // múltiplos passos condicionais. Prioriza sempre o "Baixar PDF" — se aparecer, terminou.
  step('start unified state machine');
  let done = false;
  for (let i = 0; i < 40; i++) {
    // (1) PDF disponível → sai do loop
    const baixar = await page.$(
      'a:has-text("Baixar PDF"), button:has-text("Baixar PDF"), ' +
      'a:has-text("Baixar cartão"), button:has-text("Baixar cartão"), ' +
      'a[download][href*=".pdf" i]'
    );
    if (baixar) { step('iter ' + i + ': "Baixar PDF" visível'); done = true; break; }

    // (2) Título/URL indica que já estamos no cartão de embarque (sem botão Baixar ainda visível)
    const url = page.url().toLowerCase();
    const isBoardingPage = url.includes('boarding') || url.includes('cartao') || url.includes('cartão');
    const heading = await page.$('h1:has-text("Cartão de Embarque"), h1:has-text("Cartão de embarque"), h2:has-text("Cartão de Embarque")');
    if (isBoardingPage && heading) {
      step('iter ' + i + ': página de cartão detectada, aguardando botão de download');
      await page.waitForTimeout(2000);
      continue;
    }

    // (3) Lista de voos → "Ver cartão(ões) de embarque"
    const verCartao = await page.$(
      'button:has-text("Ver cartão"), a:has-text("Ver cartão"), ' +
      'button:has-text("cartão de embarque"), a:has-text("cartão de embarque"), ' +
      'button:has-text("cartões de embarque"), a:has-text("cartões de embarque")'
    );
    if (verCartao) { step('iter ' + i + ': clicando "Ver cartão"'); await verCartao.click().catch(() => {}); await page.waitForTimeout(2500); continue; }

    // (4) Lista de voos → "Fazer check-in"
    const fazerCheckin = await page.$('button:has-text("Fazer check-in"), a:has-text("Fazer check-in")');
    if (fazerCheckin) { step('iter ' + i + ': clicando "Fazer check-in"'); await fazerCheckin.click().catch(() => {}); await page.waitForTimeout(2500); continue; }

    // (5) Elementos perigosos → "Entendi"
    const entendi = await page.$('button:has-text("Entendi"), button:has-text("Entendido")');
    if (entendi) { step('iter ' + i + ': clicando Entendi (bagagem)'); await entendi.click().catch(() => {}); await page.waitForTimeout(2000); continue; }

    // (6) Contato de emergência → marcar "Não quero" + Salvar
    const naoQueroLabel = await page.$(
      'label:has-text("Não quero entregar"), label:has-text("Não quero informar"), ' +
      'label:has-text("Não desejo informar")'
    );
    if (naoQueroLabel) {
      step('iter ' + i + ': marcando "Não quero entregar contato de emergência"');
      await naoQueroLabel.click().catch(() => {});
      await page.waitForTimeout(600);
      const salvar = await page.$('button:has-text("Salvar"), button:has-text("Continuar")');
      if (salvar) { await salvar.click().catch(() => {}); await page.waitForTimeout(2500); }
      continue;
    }

    // (7) Seleção de passageiros (checkbox de todos) → marcar todos
    const passSelectAll = await page.$('input[type="checkbox"][id*="all" i], label:has-text("Todos os passageiros")');
    if (passSelectAll) {
      step('iter ' + i + ': marcando todos os passageiros');
      await passSelectAll.click().catch(() => {});
      await page.waitForTimeout(600);
      const cont = await page.$('button:has-text("Continuar"), button:has-text("Confirmar")');
      if (cont) { await cont.click().catch(() => {}); await page.waitForTimeout(2000); }
      continue;
    }

    // (8) Seguro / upgrade / assento pago / bagagem extra → pular
    const skip = await page.$(
      'button:has-text("Agora não"), a:has-text("Agora não"), ' +
      'button:has-text("Não, obrigado"), a:has-text("Não, obrigado"), ' +
      'button:has-text("Pular"), a:has-text("Pular"), ' +
      'button:has-text("Manter assento"), button:has-text("Continuar sem alterar"), ' +
      'button:has-text("Continuar sem"), a:has-text("Continuar sem"), ' +
      'button:has-text("Recusar"), a:has-text("Recusar"), ' +
      'button:has-text("Dispensar"), a:has-text("Dispensar")'
    );
    if (skip) { step('iter ' + i + ': skip (seguro/upgrade)'); await skip.click().catch(() => {}); await page.waitForTimeout(2000); continue; }

    // (9) Fechar modais eventuais
    const closeBtn = await page.$('button[aria-label*="Fechar" i], button[aria-label*="Close" i], button[aria-label*="Cerrar" i]');
    if (closeBtn) { step('iter ' + i + ': fechando modal'); await closeBtn.click().catch(() => {}); await page.waitForTimeout(1000); continue; }

    // (10) Continuar/Confirmar/Aceitar genérico
    const cont = await page.$(
      'button:has-text("Continuar"), button:has-text("Confirmar"), button:has-text("Aceitar"), ' +
      'a:has-text("Continuar"), a:has-text("Confirmar")'
    );
    if (cont) { step('iter ' + i + ': clicando Continuar/Confirmar'); await cont.click().catch(() => {}); await page.waitForTimeout(2000); continue; }

    step('iter ' + i + ': nenhuma ação conhecida, aguardando 2s');
    await page.waitForTimeout(2000);
    // Se após 3 iterações sem ação nada aconteceu, sai
    if (i > 5) { step('sem progresso, encerrando loop'); break; }
  }

  if (!done) step('atenção: loop terminou sem detectar botão de download');



  // Baixar PDF — pode ser (a) link direto, (b) download event, (c) fallback: page.pdf()
  let pdfBuffer = null;
  let contentType = 'application/pdf';

  step('trying direct pdf link');
  const pdfAnchor = await page.$('a[href*=".pdf" i], a:has-text("Baixar PDF"), a:has-text("Baixar cartão")');
  if (pdfAnchor) {
    const href = await pdfAnchor.getAttribute('href');
    if (href) {
      const abs = new URL(href, page.url()).toString();
      step('fetching pdf: ' + abs.slice(0, 120));
      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map(c => c.name + '=' + c.value).join('; ');
      try {
        const resp = await page.request.get(abs, { headers: { cookie: cookieHeader, referer: page.url() } });
        if (resp.ok()) {
          pdfBuffer = await resp.body();
          contentType = resp.headers()['content-type'] || 'application/pdf';
        }
      } catch (e) { step('pdf fetch failed: ' + e.message); }
    }
  }

  // Download event (botão que dispara download em vez de link)
  if (!pdfBuffer) {
    step('trying download event');
    const btn = await page.$('button:has-text("Baixar PDF"), button:has-text("Baixar cartão"), a:has-text("Baixar PDF"), a:has-text("Baixar cartão")');
    if (btn) {
      try {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 20_000 }),
          btn.click(),
        ]);
        const path = await download.path();
        if (path) {
          const fs = await import('fs/promises');
          pdfBuffer = await fs.readFile(path);
          contentType = 'application/pdf';
          step('download captured: ' + download.suggestedFilename());
        }
      } catch (e) { step('download event failed: ' + e.message); }
    }
  }

  // Fallback: imprimir a página atual como PDF
  if (!pdfBuffer) {
    step('fallback: print page as pdf');
    pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    contentType = 'application/pdf';
  }

  return {
    data: {
      boardingPassBase64: pdfBuffer.toString('base64'),
      contentType,
      meta: { log, finalUrl: page.url() },
    },
    type: 'application/json',
  };
}
`;

export async function runLatamCheckin(input: LatamCheckinInput): Promise<LatamCheckinResult> {
  const res = await runBrowserlessFunction<LatamCheckinResult>(
    LATAM_SCRIPT,
    { locator: input.locator, surname: input.surname },
    { timeoutMs: 180_000 },
  );
  if (!res.data?.boardingPassBase64) {
    throw new Error("Browserless não devolveu PDF");
  }
  return res.data;
}
