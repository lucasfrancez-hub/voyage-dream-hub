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
// @ts-nocheck — a função abaixo é serializada com toString() e executada no
// navegador remoto; seus parâmetros e DOM pertencem àquele runtime.

import { connectBrowserlessStealth, runBrowserlessFunction } from "./browserless.server";

export interface LatamCheckinInput {
  /** LA957... (nº de compra) OU 6 letras (código de reserva) */
  locator: string;
  surname: string;
  /** Link original importado da reserva LATAM. */
  checkinUrl?: string;
}

export interface LatamBoardingPass {
  label: string;
  flightNumber?: string;
  fromIata?: string;
  toIata?: string;
  base64: string;
  contentType: string;
}

export interface LatamCheckinResult {
  /** PDF do primeiro trecho — mantido para compatibilidade. */
  boardingPassBase64: string;
  contentType: string;
  /** Um cartão por trecho (LATAM mostra abinhas quando há conexões). */
  boardingPasses: LatamBoardingPass[];
  meta?: Record<string, unknown>;
}

async function runLatamAutomation({ page, context }: { page: any; context: Record<string, unknown> }) {
  const { locator, surname, checkinUrl } = context;
  const log = [];
  const step = (m) => { log.push(new Date().toISOString() + ' — ' + m); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const bytesToBase64 = (value) => {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  };

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
    await handle.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
    await handle.click().catch(() => {});
    await page.keyboard.down('Control').catch(() => {});
    await page.keyboard.press('KeyA').catch(() => {});
    await page.keyboard.up('Control').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await handle.type(text, { delay: 40 });
    await page.keyboard.press('Tab').catch(() => {});
    await sleep(350);
  };
  const visiblePageState = async () => page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const text = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    return {
      a: Array.from(document.querySelectorAll('[role="alert"],[aria-live],.error,[class*="error" i]')).filter(visible).map(text).filter(Boolean).slice(0, 4),
      f: Array.from(document.querySelectorAll('input')).filter(visible).map((el, i) => ({ i, n: el.name || el.id || '', ok: Boolean(el.value), inv: el.getAttribute('aria-invalid') || '', val: el.validationMessage || '' })).slice(0, 6),
      b: Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible).map((el) => ({ t: text(el), d: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true' })).filter((x) => x.t).slice(0, 8),
      h: Array.from(document.querySelectorAll('h1,h2,[role="heading"]')).filter(visible).map(text).filter(Boolean).slice(0, 4),
    };
  });

  page.setDefaultTimeout(30_000);
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

  step('open LATAM check-in form');
  const gotoWithRetry = async (url) => {
    const attempts = [
      { waitUntil: 'domcontentloaded', timeout: 25_000 },
      { waitUntil: 'commit', timeout: 15_000 },
    ];
    let lastErr;
    for (let i = 0; i < attempts.length; i++) {
      try {
        await page.goto(url, attempts[i]);
        return;
      } catch (e) {
        lastErr = e;
        step('goto retry ' + (i + 1) + ' after error: ' + ((e && e.message) || e));
        // A LATAM mantém recursos de telemetria abertos e às vezes o evento
        // DOMContentLoaded não conclui, embora a aplicação já esteja visível.
        const usable = await page.evaluate(() => Boolean(document.body?.innerText?.trim())).catch(() => false);
        if (usable && page.url().includes('latamairlines.com')) {
          await page.evaluate(() => window.stop()).catch(() => {});
          step('continuando com a página LATAM já renderizada após timeout parcial');
          return;
        }
        await sleep(2000 + i * 1500);
      }
    }
    throw lastErr;
  };

  // Uma URL interna copiada de uma sessão anterior depende do estado da SPA e
  // pode cair em "Tivemos um problema". Começar pela busca pública reproduz o
  // caminho de um passageiro real e cria o estado exigido pela LATAM.
  const alreadyOpenedByStealth = Boolean(context.pageReady) && page.url().includes('latamairlines.com');
  if (!alreadyOpenedByStealth) {
    await gotoWithRetry('https://www.latamairlines.com/br/pt/check-in');
    await sleep(2500);
  } else {
    step('continuando na mesma sessão stealth desbloqueada');
    await sleep(1200);
  }

  // Cookies / OneTrust
  let okCookies = await page.$('#onetrust-accept-btn-handler, button[id*="accept" i]');
  if (!okCookies) {
    okCookies = await findByText([
      'aceite todos os cookies',
      'aceite todo os cookies',
      'aceitar todos os cookies',
      'aceitar todos',
    ], ['button','[role="button"]']);
  }
  if (okCookies) {
    await okCookies.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
    await okCookies.click().catch(async () => okCookies.evaluate((el) => el.click()));
    await sleep(1000);
    step('aviso de cookies fechado');
  }
  await sleep(500);
  step('after form nav: ' + JSON.stringify(await visiblePageState()).slice(0, 1_500));

  // Dentro da sessão stealth já aquecida, a URL da própria reserva evita a
  // busca pública instável da LATAM sem perder cookies, IP ou fingerprint.
  const providedUrl = String(checkinUrl || '').trim();
  let directReservationUrl = '';
  if (/^https:\/\/[^/]*latamairlines\.com\//i.test(providedUrl) && /[?&]orderId=/i.test(providedUrl)) {
    directReservationUrl = providedUrl;
  } else if (/^LA[A-Z0-9]{6,}$/i.test(loc)) {
    directReservationUrl = 'https://www.latamairlines.com/br/pt/check-in/status?orderId=' + encodeURIComponent(loc) + '&lastName=' + encodeURIComponent(sur.toLowerCase());
  }
  if (directReservationUrl) {
    step('abrindo reserva diretamente na mesma sessão desbloqueada');
    await gotoWithRetry(directReservationUrl);
    await sleep(4500);
    step('after direct reservation nav: ' + JSON.stringify(await visiblePageState()).slice(0, 1_500));
  }

  // A busca pelo número da compra e sobrenome é o fluxo primário.
  const stillOnForm = await findByText(['procurar sua viagem','insira os dados']);
  if (stillOnForm) {
    step('preenchendo formulário de busca');
    await page.waitForSelector('input', { timeout: 20_000 }).catch(() => {});
    const codeInput = await page.$('input[name="code"], input[id*="code" i]');
    if (!codeInput) throw new Error('Campo do número da compra não encontrado');
    await clearAndType(codeInput, loc);
    // O formulário React recria os campos após o primeiro blur. Consulte o
    // sobrenome novamente em vez de reutilizar um ElementHandle já substituído.
    const surnameInput = await page.$('input[name="lastName"], input[id*="lastName" i], input[autocomplete="family-name"]');
    if (!surnameInput) throw new Error('Campo de sobrenome não encontrado');
    await clearAndType(surnameInput, sur.toLowerCase());
    const submitBtn = await page.evaluateHandle(() => {
      for (const el of Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"]'))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && !el.disabled) return el;
      }
      return null;
    }).then((h) => h.asElement());
    if (!submitBtn) throw new Error('Formulário LATAM sem botão de busca disponível');
    await submitBtn.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
    await submitBtn.click().catch(async () => submitBtn.evaluate((el) => el.click()));
    await sleep(4500);
    step('after manual submit: ' + JSON.stringify(await visiblePageState()).slice(0, 1_500));

    // Se a busca pública falhar, ainda preservamos a sessão e tentamos a rota
    // oficial da reserva antes de considerar o fluxo interrompido.
    const searchFailed = await findByText(['tivemos um problema','não foi possível carregar','nao foi possivel carregar']);
    if (searchFailed && directReservationUrl) {
      step('busca pública falhou; retomando pela URL direta da reserva');
      await gotoWithRetry(directReservationUrl);
      await sleep(4500);
      step('after direct recovery: ' + JSON.stringify(await visiblePageState()).slice(0, 1_500));
    }
  }

  // ==== State machine unificado ====
  step('start unified state machine');
  let done = false;
  let idle = 0;
  let flightDetailsOpened = false;
  for (let i = 0; i < 18; i++) {
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

    // (3) "Ver cartão(ões) de embarque" — restrito a button/a para não pegar badges
    const verCartao = await findByText([
      'ver cartão',
      'ver cartao',
      'ver cartões',
      'ver cartoes',
      'abrir cartão',
      'abrir cartao',
      'abrir cartões',
      'abrir cartoes',
      'cartão de embarque',
      'cartao de embarque',
      'cartões de embarque',
      'cartoes de embarque',
    ], ['button','a','[role="button"]']);
    if (verCartao) {
      step('iter ' + i + ': "Ver cartão(ões) de embarque"');
      const pagesBeforeClick = await page.browser().pages();
      await verCartao.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
      await verCartao.click().catch(async () => verCartao.evaluate((el) => el.click()));
      await sleep(4000);
      const pagesAfterClick = await page.browser().pages();
      const openedPage = pagesAfterClick.find((candidate) =>
        !pagesBeforeClick.includes(candidate) && candidate.url().includes('latamairlines.com')
      );
      for (const externalPage of pagesAfterClick.filter((candidate) =>
        !pagesBeforeClick.includes(candidate) && !candidate.url().includes('latamairlines.com')
      )) {
        await externalPage.close().catch(() => {});
      }
      if (openedPage) {
        page = openedPage;
        page.setDefaultTimeout(30_000);
        await page.setViewport({ width: 1366, height: 900 }).catch(() => {});
        await page.bringToFront().catch(() => {});
        await page.waitForNetworkIdle({ idleTime: 750, timeout: 20_000 }).catch(() => {});
        step('iter ' + i + ': cartão aberto em nova aba: ' + page.url());
      } else {
        step('iter ' + i + ': cartão aberto na aba atual: ' + page.url());
      }
      done = true; // já entramos na tela do cartão
      idle = 0;
      break;
    }

    // Na página "Minhas viagens", cada trecho é um painel recolhido. O CTA
    // do cartão só entra no DOM após abrir o voo correspondente.
    if (!flightDetailsOpened && page.url().includes('/minhas-viagens/')) {
      const flightRow = await findByText([
        'segunda-feira', 'terça-feira', 'terca-feira', 'quarta-feira',
        'quinta-feira', 'sexta-feira', 'sábado', 'sabado', 'domingo',
      ], ['button','[role="button"]']);
      if (flightRow) {
        step('iter ' + i + ': abrindo detalhes do trecho');
        await flightRow.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
        await flightRow.click().catch(async () => flightRow.evaluate((el) => el.click()));
        await sleep(3000);
        flightDetailsOpened = true;
        idle = 0;
        continue;
      }
    }

    // (4) "Fazer check-in"
    const fazerCheckin = await findByText(['fazer check-in','fazer checkin','iniciar check-in'], ['button','a','[role="button"]']);
    if (fazerCheckin) { step('iter ' + i + ': "Fazer check-in"'); await fazerCheckin.click().catch(() => {}); await sleep(2500); idle = 0; continue; }

    // (5) Elementos perigosos → "Entendi"
    const entendi = await findByText(['entendi','entendido'], ['button','[role="button"]']);
    if (entendi) { step('iter ' + i + ': Entendi'); await entendi.click().catch(() => {}); await sleep(2000); idle = 0; continue; }

    // (6) Contato de emergência → "Não quero"
    const naoQuero = await findByText(['não quero entregar','nao quero entregar','não quero informar','nao quero informar','não desejo informar'], ['button','label','[role="button"]']);
    if (naoQuero) {
      step('iter ' + i + ': marcando "não quero"');
      await naoQuero.click().catch(() => {});
      await sleep(600);
      const salvar = await findByText(['salvar','continuar'], ['button','[role="button"]']);
      if (salvar) { await salvar.click().catch(() => {}); await sleep(2500); }
      idle = 0; continue;
    }

    // (7) Seleção de todos passageiros
    const passAll = await page.$('input[type="checkbox"][id*="all" i]') || await findByText(['todos os passageiros'], ['label','button','[role="button"]']);
    if (passAll) {
      step('iter ' + i + ': todos os passageiros');
      await passAll.click().catch(() => {});
      await sleep(600);
      const cont = await findByText(['continuar','confirmar'], ['button','[role="button"]']);
      if (cont) { await cont.click().catch(() => {}); await sleep(2000); }
      idle = 0; continue;
    }

    // (8) Skip seguro/upgrade/assento
    const skip = await findByText(['agora não','agora nao','não, obrigado','nao, obrigado','pular','manter assento','continuar sem alterar','continuar sem','recusar','dispensar'], ['button','[role="button"]']);
    if (skip) { step('iter ' + i + ': skip'); await skip.click().catch(() => {}); await sleep(2000); idle = 0; continue; }

    // (9) Fechar modais
    const closeBtn = await page.$('button[aria-label*="Fechar" i], button[aria-label*="Close" i], button[aria-label*="Cerrar" i]');
    if (closeBtn) { step('iter ' + i + ': fechar modal'); await closeBtn.click().catch(() => {}); await sleep(1000); idle = 0; continue; }

    // (10) Continuar/Confirmar genérico
    const cont = await findByText(['continuar','confirmar','aceitar'], ['button','[role="button"]']);
    if (cont) { step('iter ' + i + ': continuar/confirmar'); await cont.click().catch(() => {}); await sleep(2000); idle = 0; continue; }

    step('iter ' + i + ': sem ação, aguardando');
    await sleep(2000); idle++;
    if (idle > 4) { step('sem progresso, encerrando'); break; }
  }

  if (!done) step('atenção: loop terminou sem detectar "Baixar PDF"');

  // ==== Coleta multi-trecho ====
  // Quando a reserva tem conexões, a LATAM apresenta uma abinha por trecho
  // dentro da tela do cartão de embarque. Percorremos cada abinha, capturamos
  // o PDF correspondente e devolvemos todos.
  const finalUrlLower = page.url().toLowerCase();
  const pageLooksLikeBoardingPass = done || finalUrlLower.includes('boarding') || finalUrlLower.includes('cartao') || finalUrlLower.includes('cartão');
  if (!pageLooksLikeBoardingPass) {
    const snapshot = await visiblePageState().catch(() => ({ a: [], f: [], b: [], h: [] }));
    throw new Error('Fluxo LATAM terminou antes do cartão. Estado: ' + JSON.stringify({
      finalUrl: page.url(),
      snapshot,
      log: log.slice(-12),
    }));
  }

  // Descobre as abinhas de trecho antes de qualquer captura, porque clicar em
  // uma abinha pode substituir o DOM das demais.
  const discoverTabs = async () => page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const looksLikeSegment = (t) => {
      if (!t) return false;
      if (/\b[A-Z]{3}\s*(?:→|->|–|—|-|>)\s*[A-Z]{3}\b/.test(t)) return true;
      if (/\b(LA|JJ)\s?\d{2,4}\b/.test(t)) return true;
      return false;
    };
    const candidates = [];
    const seen = new Set();
    const push = (el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width <= 0 || r.height <= 0) return;
      if (style.visibility === 'hidden' || style.display === 'none') return;
      const t = norm(el.innerText || el.textContent || '');
      if (!looksLikeSegment(t)) return;
      const key = t + '|' + Math.round(r.top) + '|' + Math.round(r.left);
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ text: t, top: r.top, left: r.left });
    };
    const roleTabs = Array.from(document.querySelectorAll('[role="tab"]'));
    for (const el of roleTabs) push(el);
    if (candidates.length < 2) {
      const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      for (const el of btns) push(el);
    }
    // Ordena por posição (esquerda-para-direita, topo-para-baixo)
    candidates.sort((a, b) => (a.top - b.top) || (a.left - b.left));
    return candidates.map((c) => c.text);
  }).catch(() => []);

  // Antes de qualquer captura: dispensa o modal de materiais perigosos
  // ("Entendi") — enquanto ele está aberto, a página de cartão fica coberta
  // pelo aviso e o page.pdf() imprime o texto do aviso em vez do BP.
  const dismissHazmatGate = async () => {
    for (let i = 0; i < 3; i++) {
      const btn = await findByText(
        ['entendi', 'entendido', 'ok, entendi', 'aceitar', 'estou de acordo', 'concordo'],
        ['button', '[role="button"]', 'a'],
      );
      if (!btn) return;
      step('dispensando aviso de materiais perigosos');
      await btn.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
      await btn.click().catch(async () => btn.evaluate((el) => el.click()));
      await sleep(1500);
    }
  };

  // Depois do "Entendi", clica em "Baixar PDF" (quando existe como botão que
  // abre nova aba/download) e captura a resposta em vez de imprimir a tela.
  const tryDownloadPdfButton = async () => {
    const btn = await findByText(
      ['baixar pdf', 'baixar cartão', 'baixar cartao', 'download pdf', 'baixar bp'],
      ['button', '[role="button"]', 'a'],
    );
    if (!btn) return null;
    step('clicando em "Baixar PDF"');
    let downloaded: { bytes: Uint8Array; contentType: string } | null = null;
    const respPromise = page.waitForResponse(
      (r) => {
        const ct = (r.headers()['content-type'] || '').toLowerCase();
        return r.status() === 200 && (ct.includes('pdf') || r.url().toLowerCase().includes('.pdf'));
      },
      { timeout: 12_000 },
    ).catch(() => null);
    const popupPromise = page.browser().waitForTarget(
      (t) => t.opener() === page.target(),
      { timeout: 12_000 },
    ).catch(() => null);
    await btn.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
    await btn.click().catch(async () => btn.evaluate((el) => el.click()));
    const resp = await respPromise;
    if (resp) {
      try {
        const buf = new Uint8Array(await resp.buffer());
        downloaded = { bytes: buf, contentType: resp.headers()['content-type'] || 'application/pdf' };
      } catch (e) { step('resposta pdf sem buffer: ' + (e && e.message)); }
    }
    if (!downloaded) {
      const popup = await popupPromise;
      if (popup) {
        const popupPage = await popup.page().catch(() => null);
        if (popupPage) {
          try {
            await popupPage.waitForFunction(() => document.readyState === 'complete', { timeout: 8_000 }).catch(() => {});
            const url = popupPage.url();
            if (url.toLowerCase().includes('.pdf')) {
              const cookies = await popupPage.cookies();
              const cookieHeader = cookies.map((c) => c.name + '=' + c.value).join('; ');
              const r = await fetch(url, { headers: { cookie: cookieHeader, referer: page.url() } });
              if (r.ok) {
                const buf = new Uint8Array(await r.arrayBuffer());
                downloaded = { bytes: buf, contentType: r.headers.get('content-type') || 'application/pdf' };
              }
            }
          } catch (e) { step('popup pdf falhou: ' + (e && e.message)); }
          await popupPage.close().catch(() => {});
        }
      }
    }
    return downloaded;
  };

  const captureCurrentPdf = async () => {
    await dismissHazmatGate();
    const downloaded = await tryDownloadPdfButton();
    if (downloaded) return { bytes: downloaded.bytes, contentType: downloaded.contentType };
    // Tenta o link direto de PDF primeiro (mais fiel ao layout oficial)
    const pdfAnchor = await page.$('a[href*=".pdf" i]') || await findByText(['baixar pdf','baixar cartão','baixar cartao'], ['a']);
    if (pdfAnchor) {
      const href = await pdfAnchor.evaluate((el) => el.getAttribute('href')).catch(() => null);
      if (href) {
        try {
          const abs = new URL(href, page.url()).toString();
          const cookies = await page.cookies();
          const cookieHeader = cookies.map((c) => c.name + '=' + c.value).join('; ');
          const resp = await fetch(abs, { headers: { cookie: cookieHeader, referer: page.url() } });
          if (resp.ok) {
            const buf = new Uint8Array(await resp.arrayBuffer());
            return { bytes: buf, contentType: resp.headers.get('content-type') || 'application/pdf' };
          }
        } catch (e) { step('pdf fetch failed: ' + (e && e.message)); }
      }
    }
    // Fallback: imprime a tela — força "screen" e espera o conteúdo carregar
    try { await page.emulateMediaType('screen'); } catch (_) {}
    try {
      await page.waitForFunction(() => {
        const t = (document.body && document.body.innerText || '').toLowerCase();
        const hasText = t.includes('cartão de embarque') || t.includes('cartao de embarque') || t.includes('boarding pass') || (t.includes('embarque') && t.includes('portão'));
        const hasBarcode = !!document.querySelector('svg[class*="barcode" i], img[alt*="barcode" i], img[src*="barcode" i], canvas');
        return hasText || hasBarcode;
      }, { timeout: 15_000 });
    } catch (_) {}
    await sleep(1500);
    const bytes = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return { bytes, contentType: 'application/pdf' };
  };

  const parseSegment = (label) => {
    const t = String(label || '');
    const route = t.match(/\b([A-Z]{3})\s*(?:→|->|–|—|-|>)\s*([A-Z]{3})\b/);
    const flight = t.match(/\b((?:LA|JJ)\s?\d{2,4})\b/);
    return {
      fromIata: route?.[1],
      toIata: route?.[2],
      flightNumber: flight?.[1]?.replace(/\s+/g, ''),
    };
  };

  const tabLabels = await discoverTabs();
  step('abinhas de trecho detectadas: ' + JSON.stringify(tabLabels).slice(0, 400));

  const collected: LatamBoardingPass[] = [];

  if (tabLabels.length >= 2) {
    for (let idx = 0; idx < tabLabels.length; idx++) {
      const label = tabLabels[idx];
      step('capturando trecho ' + (idx + 1) + '/' + tabLabels.length + ' — ' + label);
      // Localiza e clica na abinha correspondente pelo texto
      const tabHandle = await findByText([label], ['[role="tab"]', 'button', 'a', '[role="button"]']);
      if (tabHandle) {
        await tabHandle.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
        await tabHandle.click().catch(async () => tabHandle.evaluate((el) => el.click()));
        await sleep(2500);
      }
      try {
        const { bytes, contentType: ct } = await captureCurrentPdf();
        const seg = parseSegment(label);
        collected.push({
          label,
          flightNumber: seg.flightNumber,
          fromIata: seg.fromIata,
          toIata: seg.toIata,
          base64: bytesToBase64(bytes),
          contentType: ct,
        });
      } catch (e) {
        step('falha ao capturar trecho ' + label + ': ' + (e && e.message));
      }
    }
  }

  // Sem abinhas ou nenhuma captura → cai para captura única
  if (collected.length === 0) {
    step('captura única (sem abinhas de trecho)');
    const { bytes, contentType: ct } = await captureCurrentPdf();
    collected.push({
      label: 'Cartão de embarque',
      base64: bytesToBase64(bytes),
      contentType: ct,
    });
  }

  return {
    data: {
      // primeiro cartão para compatibilidade com chamadas antigas
      boardingPassBase64: collected[0].base64,
      contentType: collected[0].contentType,
      boardingPasses: collected,
      meta: { log, finalUrl: page.url(), tabLabels },
    },
    type: 'application/json',
  };
}


const LATAM_SCRIPT = `export default ${runLatamAutomation.toString()}`;


export async function runLatamCheckin(input: LatamCheckinInput): Promise<LatamCheckinResult> {
  const context = { locator: input.locator, surname: input.surname, checkinUrl: input.checkinUrl || "" };
  let stealthError: unknown = null;

  try {
    const session = await connectBrowserlessStealth('https://www.latamairlines.com/br/pt/check-in');
    try {
      const result = await runLatamAutomation({
        page: session.page,
        context: { ...context, pageReady: true },
      }) as { data?: LatamCheckinResult };
      if (result.data?.boardingPassBase64) return result.data;
      throw new Error("Browserless stealth não devolveu PDF");
    } finally {
      await session.browser.close().catch(() => {});
    }
  } catch (error) {
    stealthError = error;
    const detail = error instanceof Error
      ? error.message
      : typeof error === 'object' && error
        ? JSON.stringify(error)
        : String(error);
    console.warn("[checkin] sessão stealth indisponível; tentando fluxo residencial", {
      error: detail.slice(0, 1_000),
    });
  }

  try {
    const res = await runBrowserlessFunction<LatamCheckinResult>(LATAM_SCRIPT, context, {
      timeoutMs: 120_000,
      launch: {
        headless: false,
        stealth: true,
        args: ["--disable-http2", "--disable-quic", "--lang=pt-BR", "--window-size=1366,900"],
      },
      proxy: "residential",
      proxyCountry: "br",
      proxySticky: true,
    });
    if (!res.data?.boardingPassBase64) throw new Error("Browserless não devolveu PDF");
    return res.data;
  } catch (fallbackError) {
    const first = stealthError instanceof Error
      ? stealthError.message
      : typeof stealthError === 'object' && stealthError
        ? JSON.stringify(stealthError)
        : String(stealthError || "");
    const second = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    throw new Error(`Falha stealth: ${first.slice(0, 2_000)} | Falha residencial: ${second.slice(0, 3_000)}`);
  }
}
