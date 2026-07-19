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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Helpers (Puppeteer não tem :has-text nem fill)
  const findByText = async (texts, tags = ['button','a','label','span','div']) => {
    const arr = Array.isArray(texts) ? texts : [texts];
    return await page.evaluateHandle((tags, arr) => {
      const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
      const wants = arr.map(norm);
      for (const tag of tags) {
        for (const el of Array.from(document.querySelectorAll(tag))) {
          const t = norm(el.innerText || el.textContent || '');
          if (!t) continue;
          if (wants.some((w) => t.includes(w))) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return el;
          }
        }
      }
      return null;
    }, tags, arr).then((h) => h.asElement());
  };
  const clearAndType = async (handle, text) => {
    await handle.click({ clickCount: 3 }).catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await handle.type(text, { delay: 40 });
  };

  page.setDefaultTimeout(60_000);
  await page.setViewport({ width: 1366, height: 900 });
  // Mantém idioma e navegador coerentes com a saída residencial brasileira.
  // Stealth, proxy e desativação de HTTP/2 precisam ser configurados antes
  // da criação da página e por isso ficam nas launch options abaixo.
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Upgrade-Insecure-Requests': '1',
  });

  const loc = String(locator || '').trim().toUpperCase();
  const sur = String(surname || '').trim();
  if (!loc || !sur) throw new Error('locator e surname obrigatórios');

  step('open latam check-in page');
  const gotoWithRetry = async (url) => {
    const attempts = [
      { waitUntil: 'domcontentloaded', timeout: 45_000 },
      { waitUntil: 'load', timeout: 60_000 },
      { waitUntil: 'domcontentloaded', timeout: 60_000 },
    ];
    let lastErr;
    for (let i = 0; i < attempts.length; i++) {
      try {
        await page.goto(url, attempts[i]);
        return;
      } catch (e) {
        lastErr = e;
        step('goto retry ' + (i + 1) + ' after error: ' + ((e && e.message) || e));
        await sleep(2000 + i * 1500);
      }
    }
    throw lastErr;
  };
  await gotoWithRetry('https://www.latamairlines.com/br/pt/check-in');
  await sleep(2500);

  // Cookies / OneTrust
  const okCookies = await page.$('#onetrust-accept-btn-handler');
  if (okCookies) { await okCookies.click().catch(() => {}); await sleep(500); }
  else {
    const aceitar = await findByText(['aceitar','aceito']);
    if (aceitar) { await aceitar.click().catch(() => {}); await sleep(500); }
  }

  // Aguarda inputs aparecerem (LATAM carrega o formulário via JS)
  await page.waitForSelector('input', { timeout: 45_000 }).catch(() => {});
  await sleep(1500);

  // Se houver abas ("Código de reserva" / "Número do bilhete"), garante a de código
  const tabCodigo = await findByText(['código de reserva','codigo de reserva','código da reserva','localizador'], ['button','a','div','span','li']);
  if (tabCodigo) { await tabCodigo.click().catch(() => {}); await sleep(800); }

  // Enumera inputs visíveis e escolhe localizador + sobrenome por heurística ampla
  step('enumerate inputs');
  const inputsInfo = await page.evaluate(() => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
    const findLabel = (el) => {
      const id = el.getAttribute('id');
      if (id) {
        const lbl = document.querySelector('label[for="' + id + '"]');
        if (lbl) return lbl.innerText || lbl.textContent || '';
      }
      const parentLbl = el.closest('label');
      if (parentLbl) return parentLbl.innerText || parentLbl.textContent || '';
      const wrap = el.closest('div,section,form');
      if (wrap) return (wrap.innerText || '').slice(0, 200);
      return '';
    };
    return Array.from(document.querySelectorAll('input')).map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        i,
        type: (el.getAttribute('type') || 'text').toLowerCase(),
        name: el.getAttribute('name') || '',
        id: el.getAttribute('id') || '',
        placeholder: el.getAttribute('placeholder') || '',
        aria: el.getAttribute('aria-label') || '',
        label: norm(findLabel(el)),
        visible: r.width > 0 && r.height > 0 && !el.disabled && !el.readOnly,
      };
    });
  });
  step('inputs: ' + JSON.stringify(inputsInfo).slice(0, 800));

  const isTextish = (t) => !t || ['text','search','tel','email',''].includes(t);
  const scoreLocator = (info) => {
    const hay = (info.name + ' ' + info.id + ' ' + info.placeholder + ' ' + info.aria + ' ' + info.label).toLowerCase();
    let s = 0;
    if (/localizador|reserva|pnr|compra|bilhete|ticket|booking|record/.test(hay)) s += 10;
    if (/sobrenome|apellido|last.?name|surname|apelido/.test(hay)) s -= 20;
    return s;
  };
  const scoreSurname = (info) => {
    const hay = (info.name + ' ' + info.id + ' ' + info.placeholder + ' ' + info.aria + ' ' + info.label).toLowerCase();
    let s = 0;
    if (/sobrenome|apellido|last.?name|surname|apelido/.test(hay)) s += 10;
    if (/localizador|reserva|pnr|compra|bilhete|ticket/.test(hay)) s -= 20;
    return s;
  };
  const visibleText = inputsInfo.filter((x) => x.visible && isTextish(x.type));
  let locIdx = -1, surIdx = -1, bestLoc = 0, bestSur = 0;
  for (const info of visibleText) {
    const sl = scoreLocator(info); if (sl > bestLoc) { bestLoc = sl; locIdx = info.i; }
    const ss = scoreSurname(info); if (ss > bestSur) { bestSur = ss; surIdx = info.i; }
  }
  // Fallback posicional: 1º = localizador, 2º = sobrenome
  if (locIdx < 0 && visibleText[0]) locIdx = visibleText[0].i;
  if (surIdx < 0 && visibleText[1]) surIdx = visibleText[1].i;
  if (locIdx === surIdx && visibleText[1]) surIdx = visibleText[1].i;
  step('picked locIdx=' + locIdx + ' surIdx=' + surIdx);
  if (locIdx < 0 || surIdx < 0) throw new Error('Campos de login não encontrados (localizador/sobrenome)');

  const allInputs = await page.$$('input');
  const locInput = allInputs[locIdx];
  const surInput = allInputs[surIdx];
  if (!locInput || !surInput) throw new Error('Handles de input inválidos');

  step('fill locator');
  await clearAndType(locInput, loc);
  step('fill surname');
  await clearAndType(surInput, sur);

  step('submit login');
  let submit = await page.$('button[type="submit"]');
  if (!submit) submit = await findByText(['continuar','buscar','consultar','ver reserva','ver minha reserva']);
  if (!submit) throw new Error('Botão de envio não encontrado');
  await submit.click();
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 45_000 }).catch(() => {});
  await sleep(2500);

  // ==== State machine unificado ====
  step('start unified state machine');
  let done = false;
  let idle = 0;
  for (let i = 0; i < 40; i++) {
    // (1) PDF disponível → sai
    const baixar = (await findByText(['baixar pdf','baixar cartão','baixar cartao'])) || (await page.$('a[download][href*=".pdf" i]'));
    if (baixar) { step('iter ' + i + ': "Baixar PDF" visível'); done = true; break; }

    // (2) Cartão de embarque detectado por URL/heading
    const url = page.url().toLowerCase();
    const isBoardingPage = url.includes('boarding') || url.includes('cartao') || url.includes('cartão');
    if (isBoardingPage) {
      step('iter ' + i + ': página de cartão detectada, aguardando botão');
      await sleep(2000); idle++; if (idle > 5) break; continue;
    }

    // (3) "Ver cartão(ões) de embarque"
    const verCartao = await findByText(['ver cartão','ver cartao','cartões de embarque','cartoes de embarque','cartão de embarque']);
    if (verCartao) { step('iter ' + i + ': "Ver cartão"'); await verCartao.click().catch(() => {}); await sleep(2500); idle = 0; continue; }

    // (4) "Fazer check-in"
    const fazerCheckin = await findByText(['fazer check-in','fazer checkin','iniciar check-in']);
    if (fazerCheckin) { step('iter ' + i + ': "Fazer check-in"'); await fazerCheckin.click().catch(() => {}); await sleep(2500); idle = 0; continue; }

    // (5) Elementos perigosos → "Entendi"
    const entendi = await findByText(['entendi','entendido']);
    if (entendi) { step('iter ' + i + ': Entendi'); await entendi.click().catch(() => {}); await sleep(2000); idle = 0; continue; }

    // (6) Contato de emergência → "Não quero"
    const naoQuero = await findByText(['não quero entregar','nao quero entregar','não quero informar','nao quero informar','não desejo informar']);
    if (naoQuero) {
      step('iter ' + i + ': marcando "não quero"');
      await naoQuero.click().catch(() => {});
      await sleep(600);
      const salvar = await findByText(['salvar','continuar']);
      if (salvar) { await salvar.click().catch(() => {}); await sleep(2500); }
      idle = 0; continue;
    }

    // (7) Seleção de todos passageiros
    const passAll = await page.$('input[type="checkbox"][id*="all" i]') || await findByText(['todos os passageiros']);
    if (passAll) {
      step('iter ' + i + ': todos os passageiros');
      await passAll.click().catch(() => {});
      await sleep(600);
      const cont = await findByText(['continuar','confirmar']);
      if (cont) { await cont.click().catch(() => {}); await sleep(2000); }
      idle = 0; continue;
    }

    // (8) Skip seguro/upgrade/assento
    const skip = await findByText(['agora não','agora nao','não, obrigado','nao, obrigado','pular','manter assento','continuar sem alterar','continuar sem','recusar','dispensar']);
    if (skip) { step('iter ' + i + ': skip'); await skip.click().catch(() => {}); await sleep(2000); idle = 0; continue; }

    // (9) Fechar modais
    const closeBtn = await page.$('button[aria-label*="Fechar" i], button[aria-label*="Close" i], button[aria-label*="Cerrar" i]');
    if (closeBtn) { step('iter ' + i + ': fechar modal'); await closeBtn.click().catch(() => {}); await sleep(1000); idle = 0; continue; }

    // (10) Continuar/Confirmar genérico
    const cont = await findByText(['continuar','confirmar','aceitar']);
    if (cont) { step('iter ' + i + ': continuar/confirmar'); await cont.click().catch(() => {}); await sleep(2000); idle = 0; continue; }

    step('iter ' + i + ': sem ação, aguardando');
    await sleep(2000); idle++;
    if (idle > 5) { step('sem progresso, encerrando'); break; }
  }

  if (!done) step('atenção: loop terminou sem detectar "Baixar PDF"');

  // Baixar PDF
  let pdfBuffer = null;
  let contentType = 'application/pdf';

  step('trying direct pdf link');
  const pdfAnchor = await page.$('a[href*=".pdf" i]') || await findByText(['baixar pdf','baixar cartão','baixar cartao'], ['a']);
  if (pdfAnchor) {
    const href = await pdfAnchor.evaluate((el) => el.getAttribute('href')).catch(() => null);
    if (href) {
      const abs = new URL(href, page.url()).toString();
      step('fetching pdf: ' + abs.slice(0, 120));
      const cookies = await page.cookies();
      const cookieHeader = cookies.map((c) => c.name + '=' + c.value).join('; ');
      try {
        const resp = await fetch(abs, { headers: { cookie: cookieHeader, referer: page.url() } });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          pdfBuffer = buf;
          contentType = resp.headers.get('content-type') || 'application/pdf';
        }
      } catch (e) { step('pdf fetch failed: ' + (e && e.message)); }
    }
  }

  // Fallback: imprimir a página como PDF
  if (!pdfBuffer) {
    step('fallback: page.pdf()');
    pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    contentType = 'application/pdf';
  }

  return {
    data: {
      boardingPassBase64: Buffer.from(pdfBuffer).toString('base64'),
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
    {
      timeoutMs: 180_000,
      // A LATAM recusa a conexão HTTP/2 do Chrome de datacenter antes mesmo
      // de carregar o HTML. Forçar HTTP/1.1 resolve a falha de protocolo;
      // stealth + IP residencial BR evitam que o mesmo bloqueio seja aplicado
      // pela impressão de rede/TLS.
      launch: {
        headless: false,
        stealth: true,
        args: [
          "--disable-http2",
          "--disable-quic",
          "--lang=pt-BR",
          "--window-size=1366,900",
        ],
      },
      proxy: "residential",
      proxyCountry: "br",
      proxySticky: true,
    },
  );
  if (!res.data?.boardingPassBase64) {
    throw new Error("Browserless não devolveu PDF");
  }
  return res.data;
}
