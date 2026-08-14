/**
 * Provedor TEMPORÁRIO de hotelaria: Expedia TAAP via navegador automatizado.
 *
 * Estratégia em três níveis, do mais confiável para o menos:
 *  1. Rede  — captura as respostas JSON que a própria página consome.
 *  2. Estado embutido — JSON isomórfico deixado no HTML.
 *  3. DOM   — leitura dos cards renderizados (último recurso).
 *
 * Sem checkout automatizado: a reserva é sempre finalizada manualmente na
 * página da Expedia. Este módulo apenas consulta.
 */
import {
  ExpediaCdp,
  openRemoteBrowser,
  closeRemoteBrowser,
} from "@/lib/expedia/browser.server";
import {
  EXPEDIA_BASE,
  buildHotelSearchUrl,
  buildPackageSearchUrl,
  buildPropertyDetailUrl,
  dedupeResults,
  dedupeRooms,
  findPropertyNodes,
  findRoomNodes,
  normalizeDomCard,
  normalizeDomRoom,
  normalizePropertyNode,
  normalizeRoomNode,
  type DomCard,
  type DomRoom,
} from "@/lib/expedia/normalize";
import {
  type ExpediaSessionState,
  getActiveExpediaSession,
  logExpediaSearch,
  markExpediaSession,
} from "@/lib/expedia/session-store.server";
import {
  HOTEL_STATUS_MESSAGE,
  type HotelResult,
  type HotelRoom,
  type HotelRoomsResult,
  type HotelSearchProvider,
  type HotelSearchQuery,
  type HotelSearchResponse,
  type HotelSearchStatus,
} from "@/lib/hotels/types";

const MAX_WAIT_MS = 45_000;

const CAPTURE_HINTS = [
  "graphql",
  "propertysearch",
  "lodging",
  "hotel-search",
  "/api/",
  "shoppingsearch",
  "propertyoffers",
  "roomsandrates",
  "offers",
  "checkout",
];


function response(status: HotelSearchStatus, results: HotelResult[] = [], searchId: string | null = null): HotelSearchResponse {
  return {
    provider: "EXPEDIA",
    status,
    message: HOTEL_STATUS_MESSAGE[status],
    search_id: searchId,
    cached: false,
    results,
  };
}

const DOM_EXTRACTOR = `(() => {
  const pick = (root, sels) => {
    for (const s of sels) { const el = root.querySelector(s); if (el && el.textContent && el.textContent.trim()) return el.textContent.trim(); }
    return null;
  };
  const cards = Array.from(document.querySelectorAll('[data-stid="lodging-card-responsive"], [data-stid="property-listing-results"] > div, section[data-stid*="property"] article'));
  return cards.slice(0, 60).map((card) => {
    const link = card.querySelector('a[href]');
    const img = card.querySelector('img');
    const text = card.innerText || '';
    const priceMatch = text.match(/R\\$\\s?[\\d.,]+/g) || [];
    return {
      propertyId: (link && (new URL(link.href, location.origin)).searchParams.get('hotelId')) || card.getAttribute('data-property-id') || null,
      name: pick(card, ['h3', 'h2', '[data-stid="content-hotel-title"]']),
      image: img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null,
      href: link ? link.href : null,
      priceText: priceMatch[0] || null,
      totalText: priceMatch.length > 1 ? priceMatch[priceMatch.length - 1] : null,
      reviewText: pick(card, ['[data-stid="content-hotel-reviews"]', '[aria-label*="avalia"]']),
      starText: pick(card, ['[aria-label*="estrela"]', '[data-stid="content-hotel-star-rating"]']),
      locationText: pick(card, ['[data-stid="content-hotel-neighborhood"]', '[data-stid="content-hotel-location"]']),
      soldOut: /esgotado|indispon/i.test(text)
    };
  });
})()`;

const PAGE_STATE = `(() => ({
  href: location.href,
  cards: document.querySelectorAll('[data-stid="lodging-card-responsive"]').length,
  text: (document.body?.innerText || '').slice(0, 1500)
}))()`;

export class ExpediaTaapBrowserProvider implements HotelSearchProvider {
  readonly id = "EXPEDIA" as const;
  readonly source = "EXPEDIA_TAAP" as const;

  async search(query: HotelSearchQuery): Promise<HotelSearchResponse> {
    const started = Date.now();
    const isPackage = query.type === "FLIGHT_HOTEL_PACKAGE";
    const url = isPackage ? buildPackageSearchUrl(query) : buildHotelSearchUrl(query);

    const session = await getActiveExpediaSession();
    if (!session) {
      await logExpediaSearch({
        sessionId: null,
        searchType: query.type ?? "HOTEL_STANDALONE",
        params: { ...query },
        url,
        status: "AUTH_REQUIRED",
        durationMs: Date.now() - started,
        resultsCount: 0,
        sourceLevel: null,
      });
      return response("AUTH_REQUIRED");
    }

    let ws: string | null = null;
    let cdp: ExpediaCdp | null = null;
    let status: HotelSearchStatus = "PARSER_ERROR";
    let level: string | null = null;
    let results: HotelResult[] = [];
    const parserErrors: string[] = [];

    try {
      ws = await openRemoteBrowser({ url: `${EXPEDIA_BASE}/`, reconnectMs: 90_000, residentialProxy: true });
      cdp = await ExpediaCdp.connect(ws);
      await cdp.attachToPage();
      await cdp.send("Network.enable", {}).catch(() => {});

      // ---- Nível 1: escuta as respostas JSON da própria página
      const captured: Array<{ requestId: string; url: string }> = [];
      cdp.on("Network.responseReceived", (params) => {
        const p = params as { requestId?: string; response?: { url?: string; mimeType?: string } };
        const rUrl = p.response?.url ?? "";
        const mime = p.response?.mimeType ?? "";
        if (!p.requestId || !mime.includes("json")) return;
        const low = rUrl.toLowerCase();
        if (CAPTURE_HINTS.some((h) => low.includes(h))) captured.push({ requestId: p.requestId, url: rUrl });
      });

      // ---- sessão autenticada
      await cdp.send("Network.setCookies", { cookies: session.cookies }).catch(() => {});
      if (Object.keys(session.storage).length) {
        await cdp.evaluate(
          `(() => { const d = ${JSON.stringify(session.storage)}; for (const k in d) { try { localStorage.setItem(k, d[k]); } catch (e) {} } return true; })()`,
        );
      }

      await cdp.send("Page.navigate", { url });

      // ---- espera resultados / detecta bloqueio
      let state: { href: string; cards: number; text: string } | null = null;
      const deadline = Date.now() + MAX_WAIT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        state = await cdp.evaluate<{ href: string; cards: number; text: string }>(PAGE_STATE);
        if (!state) continue;
        const text = state.text.toLowerCase();
        if (/\/login|signin|entrar na sua conta|faça login/.test(`${state.href.toLowerCase()} ${text}`)) {
          status = "SESSION_EXPIRED";
          break;
        }
        if (/captcha|verifique que você|verificação de segurança|press & hold/.test(text)) {
          status = "CAPTCHA_REQUIRED";
          break;
        }
        if (state.cards > 0 || captured.length > 2) break;
      }

      if (status === "SESSION_EXPIRED" || status === "CAPTCHA_REQUIRED") {
        await markExpediaSession(session.id, "AUTH_REQUIRED");
      } else {
        // ---- Nível 1: corpos capturados
        for (const item of captured.slice(-25)) {
          try {
            const body = await cdp.send<{ body: string; base64Encoded: boolean }>("Network.getResponseBody", {
              requestId: item.requestId,
            });
            if (!body?.body || body.base64Encoded) continue;
            const json = JSON.parse(body.body) as unknown;
            const nodes = findPropertyNodes(json);
            for (const node of nodes) {
              const normalized = normalizePropertyNode(node, session.id);
              if (normalized) results.push(normalized);
            }
          } catch (e) {
            parserErrors.push(`rede: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (results.length) level = "NETWORK";

        // ---- Nível 3: DOM
        if (!results.length) {
          const cards = (await cdp.evaluate<DomCard[]>(DOM_EXTRACTOR)) ?? [];
          results = cards
            .map((card) => normalizeDomCard(card, session.id))
            .filter((r): r is HotelResult => !!r);
          if (results.length) level = "DOM";
        }

        results = dedupeResults(results);
        if (results.length) {
          status = "SUCCESS";
          await markExpediaSession(session.id, "CONNECTED");
        } else if (state && /nenhum|não encontramos|sem resultados/i.test(state.text)) {
          status = "NO_RESULTS";
        } else if (!state) {
          status = "TIMEOUT";
        } else {
          status = "PARSER_ERROR";
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      parserErrors.push(msg);
      status = /timeout/i.test(msg) ? "TIMEOUT" : "TAAP_UNAVAILABLE";
    } finally {
      cdp?.close();
      if (ws) await closeRemoteBrowser(ws).catch(() => {});
    }

    await logExpediaSearch({
      sessionId: session.id,
      searchType: query.type ?? "HOTEL_STANDALONE",
      params: { ...query },
      url,
      status,
      durationMs: Date.now() - started,
      resultsCount: results.length,
      sourceLevel: level,
      parserErrors,
    });

    return { ...response(status, results, session.id) };
  }

  /**
   * Abre a página da propriedade DENTRO da mesma sessão da pesquisa e
   * captura quartos, tarifas, políticas e parcelamento.
   *
   * Prioridade: respostas JSON de fetch/XHR observadas -> estado embutido ->
   * DOM renderizado (último recurso). Nada de URL de checkout fabricada:
   * apenas guardamos o link de "reservar" que a própria página expõe.
   */
  async rooms(input: {
    propertyId: string;
    detailUrl?: string | null;
    startDate: string;
    endDate: string;
    rooms?: number;
    adults?: number;
    regionId?: string | null;
    latLong?: string | null;
    destination?: string | null;
    searchId?: string | null;
  }): Promise<{ status: HotelSearchStatus; message: string; data: HotelRoomsResult | null }> {
    const started = Date.now();
    const url = buildPropertyDetailUrl(input);
    const session = await getActiveExpediaSession();
    if (!session) {
      return { status: "AUTH_REQUIRED", message: HOTEL_STATUS_MESSAGE.AUTH_REQUIRED, data: null };
    }

    let status: HotelSearchStatus = "PARSER_ERROR";
    let level: string | null = null;
    let rooms: HotelRoom[] = [];
    const parserErrors: string[] = [];

    const run = await this.withPage(url, session, async (cdp, captured, state) => {
      for (const item of captured.slice(-30)) {
        try {
          const body = await cdp.send<{ body: string; base64Encoded: boolean }>("Network.getResponseBody", {
            requestId: item.requestId,
          });
          if (!body?.body || body.base64Encoded) continue;
          const json = JSON.parse(body.body) as unknown;
          for (const node of findRoomNodes(json)) {
            const room = normalizeRoomNode(node);
            if (room) rooms.push(room);
          }
        } catch (e) {
          parserErrors.push(`rede: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (rooms.length) level = "NETWORK";

      if (!rooms.length) {
        const domRooms = (await cdp.evaluate<DomRoom[]>(ROOM_DOM_EXTRACTOR)) ?? [];
        rooms = domRooms.map(normalizeDomRoom).filter((r): r is HotelRoom => !!r);
        if (rooms.length) level = "DOM";
      }

      rooms = dedupeRooms(rooms);
      if (rooms.length) status = "SUCCESS";
      else if (state && /esgotado|indispon[íi]vel|sem quartos/i.test(state.text)) status = "ROOM_UNAVAILABLE";
      else if (!state) status = "TIMEOUT";
    });

    if (run.blocked) status = run.blocked;
    if (run.error) {
      parserErrors.push(run.error);
      status = /timeout/i.test(run.error) ? "TIMEOUT" : "TAAP_UNAVAILABLE";
    }

    await logExpediaSearch({
      sessionId: session.id,
      searchType: "HOTEL_STANDALONE",
      params: { scope: "PROPERTY_ROOMS", ...input },
      url,
      status,
      durationMs: Date.now() - started,
      resultsCount: rooms.length,
      sourceLevel: level,
      parserErrors,
    });

    return {
      status,
      message: HOTEL_STATUS_MESSAGE[status],
      data:
        status === "SUCCESS"
          ? { source: this.source, property_id: input.propertyId, search_id: input.searchId ?? null, rooms }
          : null,
    };
  }

  /**
   * Modo investigação: navega numa URL real do TAAP e inventaria as chamadas
   * estruturadas que o PRÓPRIO front-end consome (fetch/XHR/GraphQL), sem
   * assumir que sejam API pública. Serve para mapear pesquisa -> propriedade
   * -> quartos -> checkout antes de escrever qualquer adapter definitivo.
   */
  async discoverEndpoints(targetUrl: string): Promise<{
    status: HotelSearchStatus;
    message: string;
    finalUrl: string | null;
    endpoints: Array<{
      url: string;
      operation: string | null;
      hasProperties: boolean;
      hasRooms: boolean;
      topKeys: string[];
      bytes: number;
    }>;
  }> {
    const session = await getActiveExpediaSession();
    if (!session) {
      return { status: "AUTH_REQUIRED", message: HOTEL_STATUS_MESSAGE.AUTH_REQUIRED, finalUrl: null, endpoints: [] };
    }
    const endpoints: Array<{
      url: string;
      operation: string | null;
      hasProperties: boolean;
      hasRooms: boolean;
      topKeys: string[];
      bytes: number;
    }> = [];
    let finalUrl: string | null = null;
    let status: HotelSearchStatus = "SUCCESS";

    const run = await this.withPage(targetUrl, session, async (cdp, captured, state) => {
      finalUrl = state?.href ?? null;
      for (const item of captured.slice(-60)) {
        try {
          const body = await cdp.send<{ body: string; base64Encoded: boolean }>("Network.getResponseBody", {
            requestId: item.requestId,
          });
          if (!body?.body || body.base64Encoded) continue;
          const json = JSON.parse(body.body) as unknown;
          const root = Array.isArray(json) ? (json[0] as Record<string, unknown>) : (json as Record<string, unknown>);
          endpoints.push({
            url: item.url,
            operation: /graphql/i.test(item.url) ? (item.url.split("?")[1] ?? null) : null,
            hasProperties: findPropertyNodes(json).length > 0,
            hasRooms: findRoomNodes(json).length > 0,
            topKeys: root && typeof root === "object" ? Object.keys(root).slice(0, 12) : [],
            bytes: body.body.length,
          });
        } catch {
          /* corpo não-JSON ou já descartado pelo navegador */
        }
      }
    });

    if (run.blocked) status = run.blocked;
    if (run.error) status = /timeout/i.test(run.error) ? "TIMEOUT" : "TAAP_UNAVAILABLE";

    return { status, message: HOTEL_STATUS_MESSAGE[status], finalUrl, endpoints };
  }

  /** Abre o navegador remoto com a sessão TAAP e entrega a página pronta. */
  private async withPage(
    url: string,
    session: ExpediaSessionState,
    handler: (
      cdp: ExpediaCdp,
      captured: Array<{ requestId: string; url: string }>,
      state: { href: string; cards: number; text: string } | null,
    ) => Promise<void>,
  ): Promise<{ blocked: HotelSearchStatus | null; error: string | null }> {
    let ws: string | null = null;
    let cdp: ExpediaCdp | null = null;
    let blocked: HotelSearchStatus | null = null;
    let error: string | null = null;
    try {
      ws = await openRemoteBrowser({ url: `${EXPEDIA_BASE}/`, reconnectMs: 90_000, residentialProxy: true });
      cdp = await ExpediaCdp.connect(ws);
      await cdp.attachToPage();
      await cdp.send("Network.enable", {}).catch(() => {});

      const captured: Array<{ requestId: string; url: string }> = [];
      cdp.on("Network.responseReceived", (params) => {
        const p = params as { requestId?: string; response?: { url?: string; mimeType?: string } };
        const rUrl = p.response?.url ?? "";
        const mime = p.response?.mimeType ?? "";
        if (!p.requestId || !mime.includes("json")) return;
        const low = rUrl.toLowerCase();
        if (CAPTURE_HINTS.some((h) => low.includes(h))) captured.push({ requestId: p.requestId, url: rUrl });
      });

      await cdp.send("Network.setCookies", { cookies: session.cookies }).catch(() => {});
      if (Object.keys(session.storage).length) {
        await cdp.evaluate(
          `(() => { const d = ${JSON.stringify(session.storage)}; for (const k in d) { try { localStorage.setItem(k, d[k]); } catch (e) {} } return true; })()`,
        );
      }
      await cdp.send("Page.navigate", { url });

      let state: { href: string; cards: number; text: string } | null = null;
      const deadline = Date.now() + MAX_WAIT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        state = await cdp.evaluate<{ href: string; cards: number; text: string }>(PAGE_STATE);
        if (!state) continue;
        const text = state.text.toLowerCase();
        if (/\/login|signin|entrar na sua conta|faça login/.test(`${state.href.toLowerCase()} ${text}`)) {
          blocked = "SESSION_EXPIRED";
          break;
        }
        if (/captcha|verifique que você|verificação de segurança|press & hold/.test(text)) {
          blocked = "CAPTCHA_REQUIRED";
          break;
        }
        if (captured.length > 2 || state.cards > 0 || text.length > 400) break;
      }

      if (blocked) await markExpediaSession(session.id, "AUTH_REQUIRED");
      else {
        await handler(cdp, captured, state);
        await markExpediaSession(session.id, "CONNECTED");
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cdp?.close();
      if (ws) await closeRemoteBrowser(ws).catch(() => {});
    }
    return { blocked, error };
  }
}

const ROOM_DOM_EXTRACTOR = `(() => {
  const blocks = Array.from(document.querySelectorAll('[data-stid="section-room-list"] > div, [data-stid*="room-type"], div[data-stid="property-offer-card"], section[aria-label*="Quarto"]'));
  return blocks.slice(0, 40).map((b) => {
    const link = b.querySelector('a[href], button[data-stid*="reserve"]');
    const h = b.querySelector('h3, h2, [data-stid="content-hotel-title"]');
    return {
      name: h && h.textContent ? h.textContent.trim() : null,
      text: b.innerText || null,
      href: link && link.href ? link.href : null
    };
  });
})()`;

export const expediaTaapProvider = new ExpediaTaapBrowserProvider();

