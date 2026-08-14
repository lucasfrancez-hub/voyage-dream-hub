/**
 * Re-login automático na Expedia TAAP.
 *
 * Usa as credenciais guardadas (cifradas) para abrir o navegador remoto,
 * preencher o formulário oficial da Expedia e salvar a sessão resultante
 * (cookies + localStorage) já criptografada. Assim a operação não precisa
 * refazer login manual toda vez que a sessão expira.
 *
 * Se aparecer captcha / verificação em duas etapas, devolvemos um status
 * explícito para o painel pedir o login manual — nunca tentamos burlar.
 */
import { ExpediaCdp, closeRemoteBrowser, openRemoteBrowser } from "@/lib/expedia/browser.server";
import { EXPEDIA_BASE } from "@/lib/expedia/normalize";
import {
  getActiveExpediaCredential,
  markExpediaCredential,
} from "@/lib/expedia/credentials-store.server";
import { saveExpediaSession, type ExpediaCookie } from "@/lib/expedia/session-store.server";

export type AutoLoginResult = {
  ok: boolean;
  status: "SUCCESS" | "NO_CREDENTIALS" | "MANUAL_REQUIRED" | "INVALID_CREDENTIALS" | "ERROR";
  message: string;
  cookieCount?: number;
};

const LOGIN_URL = `${EXPEDIA_BASE}/user/signin`;
const MAX_WAIT_MS = 60_000;

/** Preenche um campo respeitando o React da Expedia (setter nativo + eventos). */
function fillScript(selectors: string[], value: string) {
  return `(() => {
    const sels = ${JSON.stringify(selectors)};
    let el = null;
    for (const s of sels) { const c = document.querySelector(s); if (c && c.offsetParent !== null) { el = c; break; } }
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    el.focus();
    if (setter) setter.call(el, ${JSON.stringify(value)}); else el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;
}

const SUBMIT_SCRIPT = `(() => {
  const cands = Array.from(document.querySelectorAll('button[type="submit"], button[data-testid*="submit"], button'));
  const btn = cands.find((b) => b.offsetParent !== null && /entrar|continuar|sign in|continue|log in/i.test(b.textContent || ''));
  if (btn) { btn.click(); return true; }
  const form = document.querySelector('form');
  if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); return true; }
  return false;
})()`;

const STATE_SCRIPT = `(() => ({
  href: location.href,
  hasEmail: !!document.querySelector('input[type="email"], input[name="email"], #loginFormEmailInput'),
  hasPassword: !!document.querySelector('input[type="password"]'),
  text: (document.body?.innerText || '').slice(0, 1200)
}))()`;

type PageState = { href: string; hasEmail: boolean; hasPassword: boolean; text: string };

const EMAIL_SELECTORS = [
  "#loginFormEmailInput",
  'input[type="email"]',
  'input[name="email"]',
  'input[autocomplete="username"]',
];
const PASSWORD_SELECTORS = [
  "#loginFormPasswordInput",
  'input[type="password"]',
  'input[name="password"]',
  'input[autocomplete="current-password"]',
];

/** Faz login com as credenciais salvas e grava a nova sessão autenticada. */
export async function autoLoginExpedia(userId: string | null = null): Promise<AutoLoginResult> {
  const cred = await getActiveExpediaCredential();
  if (!cred) {
    return {
      ok: false,
      status: "NO_CREDENTIALS",
      message: "Nenhuma credencial da Expedia TAAP cadastrada.",
    };
  }

  let ws: string | null = null;
  let cdp: ExpediaCdp | null = null;
  try {
    ws = await openRemoteBrowser({ url: LOGIN_URL, reconnectMs: 120_000, residentialProxy: true });
    cdp = await ExpediaCdp.connect(ws);
    await cdp.attachToPage();
    await cdp.send("Network.enable", {}).catch(() => {});

    let emailDone = false;
    let passwordDone = false;
    let blocked: string | null = null;
    let loggedIn = false;
    const deadline = Date.now() + MAX_WAIT_MS;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1_500));
      const state = await cdp.evaluate<PageState>(STATE_SCRIPT);
      if (!state) continue;
      const text = state.text.toLowerCase();

      if (/captcha|verifique que você|verificação de segurança|press & hold|código de verificação|two-factor/.test(text)) {
        blocked = "MANUAL_REQUIRED";
        break;
      }
      if (/senha incorreta|não foi possível entrar|incorrect password|credenciais inválidas|e-mail ou senha/.test(text)) {
        blocked = "INVALID_CREDENTIALS";
        break;
      }

      if (state.hasPassword) {
        if (!passwordDone) {
          const ok = await cdp.evaluate<boolean>(fillScript(PASSWORD_SELECTORS, cred.password));
          if (ok) {
            passwordDone = true;
            await new Promise((r) => setTimeout(r, 400));
            await cdp.evaluate<boolean>(SUBMIT_SCRIPT);
          }
          continue;
        }
      } else if (state.hasEmail) {
        if (!emailDone) {
          const ok = await cdp.evaluate<boolean>(fillScript(EMAIL_SELECTORS, cred.email));
          if (ok) {
            emailDone = true;
            await new Promise((r) => setTimeout(r, 400));
            await cdp.evaluate<boolean>(SUBMIT_SCRIPT);
          }
          continue;
        }
      } else if (emailDone || passwordDone) {
        // Sem formulário na tela depois de enviar = provavelmente autenticado.
        loggedIn = !/signin|login/i.test(state.href);
        if (loggedIn) break;
      }
    }

    if (blocked === "MANUAL_REQUIRED") {
      await markExpediaCredential(cred.id, false, "Verificação de segurança exigida");
      return {
        ok: false,
        status: "MANUAL_REQUIRED",
        message: "A Expedia pediu verificação de segurança. Faça o login manual uma vez.",
      };
    }
    if (blocked === "INVALID_CREDENTIALS") {
      await markExpediaCredential(cred.id, false, "E-mail ou senha recusados");
      return { ok: false, status: "INVALID_CREDENTIALS", message: "E-mail ou senha recusados pela Expedia." };
    }

    // Captura sessão
    const res = await cdp
      .send<{ cookies?: ExpediaCookie[] }>("Network.getAllCookies")
      .catch(() => ({ cookies: [] as ExpediaCookie[] }));
    const rawStorage =
      (await cdp.evaluate<string>(
        "JSON.stringify(Object.fromEntries(Object.entries(localStorage).slice(0, 200)))",
      )) || "{}";
    let storage: Record<string, string> = {};
    try {
      storage = JSON.parse(rawStorage) as Record<string, string>;
    } catch {
      storage = {};
    }

    const saved = await saveExpediaSession({
      label: cred.label,
      accountEmail: cred.email,
      cookies: res.cookies ?? [],
      storage,
      userId,
    });
    await markExpediaCredential(cred.id, true);
    return {
      ok: true,
      status: "SUCCESS",
      message: `Sessão renovada automaticamente (${saved.cookieCount} cookies).`,
      cookieCount: saved.cookieCount,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markExpediaCredential(cred.id, false, msg);
    return { ok: false, status: "ERROR", message: msg };
  } finally {
    cdp?.close();
    if (ws) await closeRemoteBrowser(ws).catch(() => {});
  }
}
