/**
 * Camada única de chamadas HTTP à Comprar Viagem / Oner.
 * Toda requisição passa por aqui: cabeçalhos, tempo limite e registro do
 * resultado (sem nunca gravar token, cookie ou código).
 * SERVER-ONLY.
 */
import { ONER_AGENT_ID, ONER_INSTITUTION_ID, ONER_SITE } from "./config";

export type OnerCall = {
  endpoint: string;
  method: string;
  status: number;
  ok: boolean;
  message?: string | null;
  durationMs: number;
};

export type OnerResponse<T = unknown> = {
  call: OnerCall;
  body: T | null;
  raw: string;
};

export function onerHeaders(token?: string | null): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    authorization: token ? `Bearer ${token}` : "Bearer",
    institutionid: ONER_INSTITUTION_ID,
    agentid: ONER_AGENT_ID,
    applicationname: "COMPRARVIAGEM",
    applicationaccesstype: "1",
    platform: "WEBAPP",
    language: "4",
    currencie: "1",
    currency: "1",
    ispackage: "false",
    referer: `${ONER_SITE}/`,
    origin: ONER_SITE,
  };
}

export async function onerFetch<T = unknown>(
  url: string,
  init: { method?: string; body?: unknown; token?: string | null; timeoutMs?: number } = {},
): Promise<OnerResponse<T>> {
  const method = init.method ?? "GET";
  const inicio = Date.now();
  let status = 0;
  let raw = "";
  try {
    const res = await fetch(url, {
      method,
      headers: onerHeaders(init.token),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? 45_000),
    });
    status = res.status;
    raw = await res.text();
    let body: T | null = null;
    try {
      body = raw ? (JSON.parse(raw) as T) : null;
    } catch {
      body = null;
    }
    const b = body as { message?: string; errorMessage?: string } | null;
    return {
      call: {
        endpoint: url,
        method,
        status,
        ok: res.ok,
        message: b?.message ?? b?.errorMessage ?? (res.ok ? null : raw.slice(0, 300)),
        durationMs: Date.now() - inicio,
      },
      body,
      raw,
    };
  } catch (e) {
    return {
      call: {
        endpoint: url,
        method,
        status,
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - inicio,
      },
      body: null,
      raw,
    };
  }
}

/** Busca um valor por caminho, tolerando formatos diferentes de resposta. */
export function pick(obj: unknown, ...caminhos: string[]): unknown {
  for (const c of caminhos) {
    let cur: unknown = obj;
    for (const k of c.split(".")) {
      if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[k];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

export function arr(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null || v === "") return null;
  const n = Number(
    String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."),
  );
  return Number.isFinite(n) ? n : null;
}

/** Percorre um JSON procurando o primeiro valor que satisfaz o teste. */
export function procurarFundo(
  valor: unknown,
  teste: (v: unknown, chave: string) => boolean,
  chave = "",
  profundidade = 0,
): unknown {
  if (profundidade > 8) return undefined;
  if (teste(valor, chave)) return valor;
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const r = procurarFundo(item, teste, chave, profundidade + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      const r = procurarFundo(v, teste, k, profundidade + 1);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}
