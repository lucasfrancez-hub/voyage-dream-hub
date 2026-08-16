import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mdFetchJson,
  mdInternalOnly,
  mdSourceMetrics,
  resetMdSourceMetrics,
  configureMdRateLimit,
  MdUnavailableError,
} from "@/lib/melhores-destinos.server";
import { discoverCandidates } from "@/lib/airfare-promos.discovery.server";

const realFetch = globalThis.fetch;

function stub(status = 200, body: unknown = { ok: true }) {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return () => chamadas;
}

describe("Promoções lêem somente dados internos do Passagens Baratas", () => {
  beforeEach(() => {
    resetMdSourceMetrics();
    configureMdRateLimit({
      background: [1, 2],
      interactive: [1, 2],
      backoffSteps: [1, 2, 3],
      unavailableCooldownMs: 10,
    });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("serve o dado já coletado pelo Passagens Baratas sem nova ida à fonte", async () => {
    const url = "https://exemplo/interno/1";
    const chamadas = stub(200, { preco: 999 });
    // Passagens Baratas coleta (chamada interativa real)
    await mdFetchJson(url, { priority: "interactive" });
    expect(chamadas()).toBe(1);

    // Promoções: modo interno, mesmo com a fonte disponível não sai requisição
    const valor = await mdInternalOnly(() => mdFetchJson<{ preco: number }>(url, { ttlMs: 0 }));
    expect(valor.preco).toBe(999);
    expect(chamadas()).toBe(1);
    expect(mdSourceMetrics().internalOnlyHits).toBeGreaterThan(0);
  });

  it("não acessa o MD quando não há dado interno: falha honesta", async () => {
    const chamadas = stub(200, { ok: true });
    await expect(
      mdInternalOnly(() => mdFetchJson("https://exemplo/interno/sem-cache")),
    ).rejects.toBeInstanceOf(MdUnavailableError);
    expect(chamadas()).toBe(0);
    expect(mdSourceMetrics().internalOnlyMisses).toBeGreaterThan(0);
  });

  it("descarta dado interno mais velho que a janela de recência", async () => {
    const url = "https://exemplo/interno/velho";
    stub(200, { preco: 1 });
    await mdFetchJson(url, { priority: "interactive" });
    await expect(
      mdInternalOnly(() => mdFetchJson(url, { ttlMs: 0 }), { maxAgeMs: 0 }),
    ).rejects.toBeInstanceOf(MdUnavailableError);
  });

  it("radar sem oportunidades não gera fallback artificial", async () => {
    stub(200, { categories: [], cities: [] });
    const res = await discoverCandidates({ pages: 1, datesPerRoute: 1, radarBudgetMs: 5_000 });
    expect(res.candidates).toHaveLength(0);
    expect(res.fallbackCount).toBe(0);
    expect(res.radarAvailable).toBe(false);
  }, 60_000);
});
