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
  /** Link original importado da reserva LATAM. */
  checkinUrl?: string;
}

export interface LatamCheckinResult {
  boardingPassBase64: string;
  contentType: string;
  meta?: Record<string, unknown>;
}

const LATAM_SCRIPT = /* js */ `
export default async function ({ page, context }) {
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
  await gotoWithRetry('https://www.latamairlines.com/br/pt/check-in');
  await sleep(2500);

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
  }

  // ==== State machine unificado ====
  step('start unified state machine');
  let done = false;
  let idle = 0;
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
    ], ['button','a','[role="button"]']);
    if (verCartao) {
      step('iter ' + i + ': "Ver cartão(ões) de embarque"');
      const pagesBeforeClick = await page.browser().pages();
      await verCartao.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
      await verCartao.click().catch(async () => verCartao.evaluate((el) => el.click()));
      await sleep(4000);
      const pagesAfterClick = await page.browser().pages();
      const openedPage = pagesAfterClick.find((candidate) => !pagesBeforeClick.includes(candidate));
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
    if (idle > 4) { step('sem progresso, encerrando'); break; }
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
          pdfBuffer = new Uint8Array(await resp.arrayBuffer());
          contentType = resp.headers.get('content-type') || 'application/pdf';
        }
      } catch (e) { step('pdf fetch failed: ' + (e && e.message)); }
    }
  }

  // Fallback permitido somente quando a navegação realmente chegou ao cartão.
  // Evita salvar como cartão uma tela intermediária ou de erro da companhia.
  if (!pdfBuffer) {
    const finalUrl = page.url().toLowerCase();
    const pageLooksLikeBoardingPass = done || finalUrl.includes('boarding') || finalUrl.includes('cartao') || finalUrl.includes('cartão');
    if (!pageLooksLikeBoardingPass) {
      const snapshot = await visiblePageState().catch(() => ({ a: [], f: [], b: [], h: [] }));
      throw new Error('Fluxo LATAM terminou antes do cartão. Estado: ' + JSON.stringify({
        finalUrl: page.url(),
        snapshot,
        log: log.slice(-12),
      }));
    }
    step('fallback: page.pdf()');
    pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    contentType = 'application/pdf';
  }

  return {
    data: {
      boardingPassBase64: bytesToBase64(pdfBuffer),
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
    { locator: input.locator, surname: input.surname, checkinUrl: input.checkinUrl || "" },
    {
      timeoutMs: 120_000,
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
