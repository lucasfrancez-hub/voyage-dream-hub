/* VIA AIR — Exportar Cruzeiro: orquestrador de captura.
 *
 * A leitura em si vive no FRTKroozeCruiseParser (frt-parser.js).
 * Aqui só coordenamos: abrir abas informativas, alternar tipos de cabine,
 * esperar o Angular estabilizar e montar o snapshot.
 *
 * Nunca clicamos em ações comerciais (Selecionar, Confirmar e continuar,
 * Gerar orçamento, Incluir no orçamento).
 */
(function () {
  const P = globalThis.FRTKroozeCruiseParser;
  const H = P.helpers;

  const FORBIDDEN_CLICK =
    /(^|\b)(selecionar|confirmar e continuar|confirmar|gerar or[çc]amento|incluir no or[çc]amento|reservar|comprar|finalizar)(\b|$)/i;

  const IGNORED_TABS = /tour virtual/i;

  function safeClick(el) {
    if (!el) return false;
    const label = H.clean(el.textContent || el.getAttribute("aria-label") || "");
    if (FORBIDDEN_CLICK.test(label)) return false;
    try {
      el.click();
      return true;
    } catch (_) {
      return false;
    }
  }

  function findByText(nodes, matcher) {
    return nodes.find((el) => matcher(H.normalizeText(el.textContent)));
  }

  /* -------- 62. Captura de rede (JSON tem prioridade sobre DOM) ------- */
  function collectXhr() {
    return new Promise((resolve) => {
      const onMsg = (ev) => {
        if (ev.source !== window || !ev.data || ev.data.__viaairCruise !== "collected") return;
        window.removeEventListener("message", onMsg);
        resolve(ev.data.xhr || []);
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ __viaairCruise: "collect" }, "*");
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve([]);
      }, 900);
    });
  }

  /* -------- 66. Percorrer todos os tipos de cabine -------------------- */
  async function captureCabinTypes(parser) {
    const types = parser.parseCabinTypes();
    const result = [];
    if (!types.length) return result;

    for (const type of types) {
      const label = H.query(type.element, P.FRT_SELECTORS.cabinTypeLabel) || type.element;
      if (!type.selected) {
        safeClick(label);
        const detail = H.query(document, P.FRT_SELECTORS.cabinDetailRoot);
        await H.waitForDOMStable(detail || document.body, 350, 6000);
      }
      const categories = parser.parseVisibleCabinCategories(type.source_name);
      result.push({
        type: type.type,
        source_name: type.source_name,
        image_url: type.image_url,
        upgrade: type.upgrade,
        selected: type.selected,
        categories,
      });
    }
    return result;
  }

  /* -------- 36-42. Modal de adicionais -------------------------------- */
  async function captureAdditionals(parser) {
    const out = [];
    let modal = H.query(document, P.FRT_SELECTORS.additionalModal);

    if (!modal) {
      const root = H.query(document, P.FRT_SELECTORS.additionalRoot);
      if (!root) return out;
      const button = findByText([...root.querySelectorAll("button")], (t) => t === "novo adicional");
      if (!safeClick(button)) return out;
      modal = await H.waitForElement(document, P.FRT_SELECTORS.additionalModal, 6000);
      if (!modal) return out;
      await H.waitForDOMStable(modal, 300, 5000);
    }

    const tabs = H.queryAll(modal, P.FRT_SELECTORS.sideNavItems);
    if (!tabs.length) return parser.parseAdditionals(null);

    for (const tab of tabs) {
      const name = H.text(tab, P.FRT_SELECTORS.sideNavName) || H.clean(tab.textContent);
      if (IGNORED_TABS.test(name)) continue;
      safeClick(tab.querySelector("a,button") || tab);
      const content = H.query(modal, P.FRT_SELECTORS.detailContent) || modal;
      await H.waitForDOMStable(content, 300, 5000);
      out.push(...parser.parseAdditionals(name));
    }
    return out;
  }

  /* -------- 48-60. Modal "Ver mais" (conteúdo do navio) --------------- */
  async function captureShipDetails(parser) {
    const data = {
      itinerary: [],
      attractions: [],
      ship_cabins: [],
      decks: [],
      media: [],
      specs: {},
      technical_drawing_url: "",
    };

    let modal = H.query(document, P.FRT_SELECTORS.modalWindow);
    let hasSideNav = modal && H.queryAll(modal, P.FRT_SELECTORS.sideNavItems).length > 0;

    if (!hasSideNav) {
      const trigger = H.query(document, P.FRT_SELECTORS.shipDetailsLink);
      if (!trigger) return data;
      safeClick(trigger);
      modal = await H.waitForElement(document, P.FRT_SELECTORS.modalWindow, 6000);
      if (!modal) return data;
      await H.waitForDOMStable(modal, 350, 6000);
      hasSideNav = H.queryAll(modal, P.FRT_SELECTORS.sideNavItems).length > 0;
      if (!hasSideNav) return data;
    }

    const tabs = H.queryAll(modal, P.FRT_SELECTORS.sideNavItems);
    for (const tab of tabs) {
      const label = H.text(tab, P.FRT_SELECTORS.sideNavName) || H.clean(tab.textContent);
      if (IGNORED_TABS.test(label)) continue;
      safeClick(tab.querySelector("a,button") || tab);
      const content = H.query(modal, P.FRT_SELECTORS.detailContent) || modal;
      await H.waitForDOMStable(content, 320, 6000);
      const pane = H.query(content, P.FRT_SELECTORS.activePane) || content;
      const key = H.normalizeText(label);

      if (key.includes("itinerar")) {
        data.itinerary.push(...parser.parseItinerary(pane));
        data.media.push(...parser.parseMedia(pane, "itinerary", "cruise"));
      } else if (key === "o navio" || key === "navio") {
        data.media.push(...parser.parseMedia(pane, "ship", "ship"));
        Object.assign(data.specs, parser.parseTechnicalSheet(pane).specs);
      } else if (key.includes("atrac")) {
        // 54. Percorre todos os filtros de atração (Restaurantes, Crianças…).
        const filters = filterTabs(pane);
        if (filters.length) {
          for (const filter of filters) {
            const fname = H.clean(filter.textContent).replace(/\(\d+\)/g, "").trim();
            if (FORBIDDEN_CLICK.test(fname) || /^todos$/i.test(fname)) continue;
            safeClick(filter);
            await H.waitForDOMStable(pane, 260, 4000);
            data.attractions.push(...parser.parseAttractions(pane, H.normalizeText(fname)));
          }
        } else {
          data.attractions.push(...parser.parseAttractions(pane));
        }
        data.media.push(...parser.parseMedia(pane, "attraction", "ship"));
      } else if (key.includes("cabine")) {
        // Cabines do navio também vêm por filtro (Suíte, Varanda, Externa…).
        const filters = filterTabs(pane);
        if (filters.length) {
          for (const filter of filters) {
            const fname = H.clean(filter.textContent).replace(/\(\d+\)/g, "").trim();
            if (FORBIDDEN_CLICK.test(fname) || /^todos$/i.test(fname)) continue;
            safeClick(filter);
            await H.waitForDOMStable(pane, 260, 4000);
            data.ship_cabins.push(...parser.parseShipCabins(pane));
          }
        } else {
          data.ship_cabins.push(...parser.parseShipCabins(pane));
        }
        data.media.push(...parser.parseMedia(pane, "cabin", "ship"));
      } else if (key.includes("deck")) {

        // 56. Percorre todos os decks disponíveis.
        const deckButtons = [...pane.querySelectorAll("button, li, [role='tab'], option")].filter((el) =>
          /^deck\s*\d+/i.test(H.clean(el.textContent)),
        );
        if (deckButtons.length) {
          for (const deckBtn of deckButtons) {
            const deckLabel = H.clean(deckBtn.textContent);
            safeClick(deckBtn);
            await H.waitForDOMStable(pane, 300, 4000);
            data.decks.push(...parser.parseDeckPlans(pane, deckLabel));
          }
        } else {
          data.decks.push(...parser.parseDeckPlans(pane));
        }
      } else if (key.includes("foto")) {
        data.media.push(...parser.parseMedia(pane, "gallery", "ship"));
      } else if (key.includes("video") || key.includes("vídeo")) {
        data.media.push(...parser.parseMedia(pane, "video", "ship"));
      } else if (key.includes("ficha")) {
        const sheet = parser.parseTechnicalSheet(pane);
        Object.assign(data.specs, sheet.specs);
        if (sheet.technical_drawing_url) data.technical_drawing_url = sheet.technical_drawing_url;
      }
    }

    data.media = H.unique(data.media, (m) => m.source_url);
    data.attractions = H.unique(data.attractions, (a) => `${a.category}|${H.normalizeText(a.name)}`);
    data.decks = H.unique(data.decks, (d) => `${d.deck_label}|${d.image_url}`);
    return data;
  }

  /* -------- 64/77 + 84-100. Montagem do snapshot ---------------------- */
  /* options.mode === "price" → recaptura só o preço da ocupação atual,
     reaproveitando o conteúdo institucional já capturado (briefing 93). */
  async function buildSnapshot(options) {
    const opts = options || {};
    const priceOnly = opts.mode === "price";
    const deep = !priceOnly && opts.deep !== false;
    const parser = P.createParser(document, { view: window, url: location.href });
    const pageType = parser.detectPageType();

    // 95/96. Nunca ler o preço imediatamente: espera o recálculo assíncrono.
    const recalc = await parser.waitForPriceRecalculation({
      expectedOccupancyTotal: opts.expectedOccupancyTotal || null,
      timeout: priceOnly ? 12000 : 6000,
    });

    const summary = parser.parsePriceSummary();

    const cabinTypes = deep
      ? await captureCabinTypes(parser)
      : [{ type: "", source_name: "", image_url: "", categories: parser.parseVisibleCabinCategories("") }];

    const additionals = deep ? await captureAdditionals(parser) : parser.parseAdditionals(null);
    const insurances = parser.parseInsurances();
    const shipDetails = deep
      ? await captureShipDetails(parser)
      : { itinerary: [], attractions: [], ship_cabins: [], decks: [], media: [], specs: {}, technical_drawing_url: "" };

    // 94. Ocupação lida da própria página, nunca de estado do plugin.
    const occ = summary.occupancy || {};
    const profiles = {
      adults: occ.adults || 0,
      young: occ.young || 0,
      children: occ.children || 0,
      infants: occ.infants || 0,
      children_ages: occ.children_ages || [],
    };
    if (!profiles.adults && !profiles.young && !profiles.children && !profiles.infants) {
      profiles.adults = occ.passengers || summary.pricing.passengers.length || 1;
    }
    const occupancySource = occ.source || "";
    const occupancyWarnings = H.unique(
      [...(occ.warnings || []), ...(recalc.warnings || [])],
      (w) => w,
    ).filter(Boolean);


    // Achatamento para o contrato do backend (cabin_offers).
    const cabinOffers = [];
    cabinTypes.forEach((type) => {
      type.categories.forEach((cat) => {
        cabinOffers.push({
          cabin_type: cat.type || type.type,
          name: cat.name || type.source_name,
          fare_name: summary.pricing.fare_name || "",
          category_codes: cat.codes,
          image_url: cat.image_url || type.image_url,
          amenities: cat.amenities.map((a) => a.name).filter(Boolean),
          availability: cat.selected ? "selecionada" : "",
          price:
            cat.selected && summary.pricing.total
              ? {
                  base_amount:
                    summary.pricing.total !== null && summary.pricing.taxes !== null
                      ? summary.pricing.total - summary.pricing.taxes
                      : null,
                  taxes: summary.pricing.taxes,
                  total: summary.pricing.total,
                  currency: "BRL",
                  installments: summary.pricing.installment,
                  // 89. Valor individual exibido pela FRT é a fonte primária.
                  passenger_prices: summary.pricing.passengers,
                  occupancy: profiles,
                  occupancy_source: occupancySource,
                  occupancy_warnings: occupancyWarnings,
                }
              : cat.upgrade
                ? {
                    base_amount: null,
                    taxes: null,
                    total: null,
                    currency: "BRL",
                    installments: {},
                    passenger_prices: [],
                    occupancy: profiles,
                    occupancy_source: occupancySource,
                    occupancy_warnings: occupancyWarnings,
                  }
                : undefined,
        });
      });
    });


    const shipName = H.clean(
      (summary.cruise.name.match(/\b(MSC|Costa|Norwegian|Royal Caribbean|Disney)\s+[\wÀ-ú]+/) || [])[0] || "",
    );

    const media = H.unique(
      [...shipDetails.media, ...parser.parseMedia(document, "checkout", "cruise")],
      (m) => m.source_url,
    );

    const data = {
      cruise: {
        name: summary.cruise.name,
        ship_name: shipName,
        line: shipName.split(" ")[0] || "",
        departure_date: summary.cruise.departure_date,
        nights: summary.cruise.nights,
        embark_port: summary.cruise.embark_port,
        disembark_port: summary.cruise.disembark_port,
        currency: "BRL",
      },
      occupancy: profiles,
      occupancy_source: occupancySource,
      occupancy_warnings: occupancyWarnings,

      ship: {
        name: shipName,
        line: shipName.split(" ")[0] || "",
        description: "",
        main_image_url: "",
        technical_image_url: shipDetails.technical_drawing_url,
        specs: shipDetails.specs,
      },
      itinerary: shipDetails.itinerary,
      cabin_offers: cabinOffers,
      ship_cabins: shipDetails.ship_cabins,
      attractions: shipDetails.attractions,
      decks: shipDetails.decks,
      media,
      additionals: additionals.map((a) => {
        const prices = {};
        a.prices.forEach((p) => {
          if (p.value !== null && p.profile !== "other") prices[p.profile] = p.value;
        });
        return {
          category: a.category,
          code: a.code,
          name: a.name,
          description: a.description,
          prices,
        };
      }),
      insurances,
    };

    const xhr = await collectXhr();

    return {
      source: "FRT_KROOZE",
      parser_name: P.PARSER_NAME,
      parser_version: P.PARSER_VERSION,
      url: location.href,
      page_type: pageType,
      detected: parser.detectContent(),
      captured_at: new Date().toISOString(),
      warnings: parser.warnings,
      field_logs: parser.logs,
      data,
      raw: {
        title: document.title,
        page_type: pageType,
        parser_name: P.PARSER_NAME,
        parser_version: P.PARSER_VERSION,
        capture_mode: priceOnly ? "price" : "full",
        occupancy: { ...profiles, source: occupancySource, warnings: occupancyWarnings },
        pricing_fingerprint: parser.pricingFingerprint({
          cruiseId: summary.cruise.name,
          departureDate: summary.cruise.departure_date,
          cabinType: (cabinOffers[0] || {}).cabin_type || "",
          cabinCategoryCodes: (cabinOffers.find((o) => o.price && o.price.total) || {}).category_codes || [],
          fareName: summary.pricing.fare_name,
          occupancy: profiles,
        }),
        recalculation: { elapsed_ms: recalc.elapsed_ms, total: recalc.total },
        warnings: parser.warnings,
        field_logs: parser.logs,
        extracted: { cabin_types: cabinTypes, additionals, pricing: summary.pricing },
        network: xhr.map((x) => ({ url: x.url, status: x.status, body: x.body })),
        html: priceOnly ? "" : document.documentElement.outerHTML.slice(0, 900000),
      },
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "viaair-cruise-detect") {
      const parser = P.createParser(document, { view: window, url: location.href });
      const occ = parser.parseOccupancy(null);
      sendResponse({
        page_type: parser.detectPageType(),
        detected: parser.detectContent(),
        occupancy: occ,
        url: location.href,
        title: document.title,
      });
      return false;
    }
    if (msg.type === "viaair-cruise-capture") {
      buildSnapshot({
        deep: msg.deep !== false,
        mode: msg.mode || "full",
        expectedOccupancyTotal: msg.expectedOccupancyTotal || null,
      })
        .then((payload) => sendResponse({ ok: true, payload }))
        .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
      return true;
    }
  });

  // Usado pelo botão flutuante (fab.js), que roda no mesmo content script world.
  window.__viaairCruiseCapture = (opts) =>
    buildSnapshot({
      deep: (opts || {}).deep !== false,
      mode: (opts || {}).mode || "full",
      expectedOccupancyTotal: (opts || {}).expectedOccupancyTotal || null,
    }).then((payload) => ({ ok: true, payload }));
})();

