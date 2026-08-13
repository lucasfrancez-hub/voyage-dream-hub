import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mdFetchJson,
  mdSourceMetrics,
  resetMdSourceMetrics,
  configureMdRateLimit,
  mdRadarAvailable,
  MdCancelledError,
} from "@/lib/melhores-destinos.server";

const realFetch = globalThis.fetch;

function stub(handler: (url: string) => { status: number; body?: unknown }) {
  const chamadas: number[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    chamadas.push(Date.now());
    const { status, body } = handler(String(input));
    return new Response(JSON.stringify(body ?? { ok: true }), { status });
  }) as typeof fetch;
  return chamadas;
}

describe("camada compartilhada do Melhores Destinos", () => {
  beforeEach(() => {
    resetMdSourceMetrics();
    configureMdRateLimit({
      background: [120, 200],
      interactive: [20, 40],
      backoffSteps: [80, 160, 240],
      unavailableCooldownMs: 300,
    });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("serializa as chamadas e respeita o intervalo entre elas (concorrência 1)", async () => {
    const chamadas = stub(() => ({ status: 200 }));
    await Promise.all([
      mdFetchJson("https://x.test/a", { priority: "background" }),
      mdFetchJson("https://x.test/b", { priority: "background" }),
      mdFetchJson("https://x.test/c", { priority: "background" }),
    ]);
    expect(chamadas).toHaveLength(3);
    for (let i = 1; i < chamadas.length; i++) {
      expect(chamadas[i]! - chamadas[i - 1]!).toBeGreaterThanOrEqual(110);
    }
    expect(mdSourceMetrics().externalCalls).toBe(3);
  });

  it("usa cache válido em vez de nova chamada externa", async () => {
    const chamadas = stub(() => ({ status: 200 }));
    await mdFetchJson("https://x.test/cache", { priority: "interactive" });
    await mdFetchJson("https://x.test/cache", { priority: "interactive" });
    expect(chamadas).toHaveLength(1);
    expect(mdSourceMetrics().cacheHits).toBe(1);
  });

  it("coalesce requisições idênticas simultâneas em uma única chamada", async () => {
    const chamadas = stub(() => ({ status: 200 }));
    const [a, b] = await Promise.all([
      mdFetchJson<{ ok: boolean }>("https://x.test/same", { priority: "interactive" }),
      mdFetchJson<{ ok: boolean }>("https://x.test/same", { priority: "interactive" }),
    ]);
    expect(chamadas).toHaveLength(1);
    expect(a).toEqual(b);
    expect(mdSourceMetrics().coalesced).toBe(1);
  });

  it("aplica backoff em 403/429/5xx e marca a fonte como indisponível", async () => {
    stub(() => ({ status: 403 }));
    await expect(
      mdFetchJson("https://x.test/403", { priority: "background", allowStale: false }),
    ).rejects.toBeTruthy();
    const m = mdSourceMetrics();
    expect(m.status403).toBeGreaterThanOrEqual(3);
    expect(m.backoffs).toBeGreaterThanOrEqual(3);
    expect(mdRadarAvailable()).toBe(false);
  });

  it("um 200 reseta o backoff e devolve a fonte ao ritmo normal", async () => {
    let falhar = true;
    stub(() => ({ status: falhar ? 503 : 200 }));
    await expect(
      mdFetchJson("https://x.test/500", { priority: "background", allowStale: false }),
    ).rejects.toBeTruthy();
    expect(mdRadarAvailable()).toBe(false);
    falhar = false;
    await new Promise((r) => setTimeout(r, 350));
    await mdFetchJson("https://x.test/ok", { priority: "background" });
    expect(mdRadarAvailable()).toBe(true);
    expect(mdSourceMetrics().ok).toBe(1);
  });

  it("cancelamento interrompe a espera do rate limiter", async () => {
    stub(() => ({ status: 200 }));
    configureMdRateLimit({ background: [4000, 4000] });
    await mdFetchJson("https://x.test/1", { priority: "background" });
    const t0 = Date.now();
    await expect(
      mdFetchJson("https://x.test/2", { priority: "background", cancel: () => true }),
    ).rejects.toBeInstanceOf(MdCancelledError);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it("serve cache vencido quando a fonte falha (a tela nunca fica sem tarifa)", async () => {
    let status = 200;
    stub(() => ({ status, body: { v: 1 } }));
    await mdFetchJson("https://x.test/stale", { priority: "interactive", ttlMs: 1 });
    status = 500;
    await new Promise((r) => setTimeout(r, 10));
    const out = await mdFetchJson<{ v: number }>("https://x.test/stale", {
      priority: "interactive",
      ttlMs: 1,
    });
    expect(out.v).toBe(1);
    expect(mdSourceMetrics().staleServed).toBe(1);
  });
});
