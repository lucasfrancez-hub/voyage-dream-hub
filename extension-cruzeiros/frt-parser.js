/* FRTKroozeCruiseParser — parser de DOM da FRT/Krooze para a VIA AIR.
 *
 * Regras mestras (complementar técnico):
 *  - Nunca usar IDs Angular (#ngb-nav-36) nem atributos _ngcontent-*.
 *  - Ler por COMPONENTE + CLASSE ESTÁVEL + ESTRUTURA RELATIVA + TEXTO SEMÂNTICO.
 *  - Nunca limitar quantidade de cabines, adicionais, fotos ou decks.
 *  - Fallback semântico para todo campo crítico, com log de confiança.
 *
 * Sem dependências: roda como content script e em jsdom nos testes.
 */
(function (globalScope) {
  const PARSER_NAME = "FRTKroozeCruiseParser";
  const PARSER_VERSION = "1.1.0";

  /* ------------------------------------------------------------------ */
  /* 72. Mapa central de seletores — nada de CSS espalhado pelo projeto. */
  /* ------------------------------------------------------------------ */
  const FRT_SELECTORS = {
    checkout: ["app-checkout-page", "#checkout"],
    priceSummary: ["app-price-summary .price-summary", ".price-summary"],
    priceSummaryMobile: [".price-summary-mobile"],
    summaryName: [".price-summary__details h2"],
    summaryDates: [".price-summary__details .dates"],
    summaryDate: [".price-summary__details .dates .date"],
    summaryBoardingRows: [".price-summary__details .boarding p"],
    infoPrice: [".price-summary__info-price"],
    fareName: [".info-fare-name"],
    priceRows: ["app-list-price-summary .list-summary-item", ".list-price .list-summary-item"],
    totalPrice: [".list-summary-item.total .total-price .price"],
    installmentRoot: [".installment-card-wrapper", "app-installment-card"],
    installmentCount: [".box-span-price"],
    installmentFree: [".without-interest-fee"],
    cabinTypeRoot: ["app-cabin-type-selection"],
    cabinTypeItems: [".cabin-type__item"],
    cabinTypeLabel: [".cabin-type__label"],
    cabinTypeName: [".description__title"],
    cabinTypeImage: [".container-img"],
    cabinTypeUpgrade: [".description__text .not-select strong"],
    cabinTypeSelected: [".description__text .select"],
    cabinDetailRoot: ["app-cabin-type-detail", ".container-cabin-type-detail"],
    cabinDetailItems: [".cabin-type-detail"],
    cabinName: [".cabin-description__infos .name"],
    cabinCategory: [".cabin-description__infos .category"],
    cabinImage: [".cabin-description__image img"],
    amenityCards: [".amenities-container .amenity-card", ".amenity-card"],
    amenityName: [".amenity-name"],
    amenityIcon: [".amenity-icon img"],
    cabinSelected: [".button-price .selected", ".button-mobile .selected"],
    cabinUpgrade: [".button-price .not-selected .upgrade-price", ".upgrade-price"],
    insuranceRoot: ["app-insurance", ".insurance-container"],
    insurance: [".insurance"],
    insuranceMobilePrice: [".insurance-mobile__price-row strong"],
    insuranceCoverage: [".insurance__badge-recommended", "a"],
    additionalRoot: ["app-additional"],
    additionalModal: ["app-additional-modal"],
    modalWindow: ["ngb-modal-window"],
    sideNavItems: [".side-nav__item"],
    sideNavName: [".span-icon-name"],
    detailContent: [".ship-detail__content"],
    detailTitle: [".ship-detail__title"],
    activePane: [".tab-pane.show.active", ".tab-pane.active"],
    optionList: [".list-options__option"],
    optionTitle: [".description__text h3"],
    optionPriceItems: [".prices__item"],
    optionPrice: [".price"],
    optionImage: [".description .image"],
    shipDetailsLink: [".ship-details-link"],
  };

  /* ------------------------------------------------------------------ */
  /* 3. Helpers utilitários                                              */
  /* ------------------------------------------------------------------ */
  function normalizeText(value) {
    return String(value == null ? "" : value)
      .replace(/\u00a0/g, " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function clean(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function query(root, selectors) {
    if (!root) return null;
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      try {
        const found = root.querySelector(sel);
        if (found) return found;
      } catch (_) { /* seletor inválido no ambiente */ }
    }
    return null;
  }

  function queryAll(root, selectors) {
    if (!root) return [];
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      try {
        const found = [...root.querySelectorAll(sel)];
        if (found.length) return found;
      } catch (_) { /* ignora */ }
    }
    return [];
  }

  function text(root, selectors) {
    const el = typeof selectors === "undefined" ? root : query(root, selectors);
    const value = el ? clean(el.textContent) : "";
    return value || null;
  }

  function texts(root, selectors) {
    return queryAll(root, selectors).map((el) => clean(el.textContent)).filter(Boolean);
  }

  function attr(root, selectors, attribute) {
    const el = query(root, selectors);
    if (!el) return null;
    const value = el.getAttribute(attribute);
    return value ? clean(value) : null;
  }

  /** "R$ 16.656,00" → 16656 */
  function moneyToNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const match = String(value)
      .replace(/\u00a0/g, " ")
      .replace(/R\$/gi, "")
      .match(/-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/);
    if (!match) return null;
    let raw = match[0].trim();
    if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function absoluteUrl(value, base) {
    if (!value) return "";
    try {
      return new URL(String(value).trim(), base || (globalScope.location && globalScope.location.href)).href;
    } catch (_) {
      return String(value).trim();
    }
  }

  function parseCssUrl(value) {
    if (!value) return "";
    const m = String(value).match(/url\((['"]?)(.*?)\1\)/i);
    return m ? m[2] : "";
  }

  /** 16. Imagem em background-image (computed + inline como fallback). */
  function backgroundImageUrl(element, view) {
    if (!element) return "";
    let raw = "";
    try {
      const win = view || (element.ownerDocument && element.ownerDocument.defaultView);
      if (win && win.getComputedStyle) raw = parseCssUrl(win.getComputedStyle(element).backgroundImage);
    } catch (_) { /* jsdom pode não computar */ }
    if (!raw && element.style) raw = parseCssUrl(element.style.backgroundImage);
    if (!raw) raw = parseCssUrl(element.getAttribute && element.getAttribute("style"));
    return raw && raw !== "none" ? raw : "";
  }

  /** 58. Melhor URL de imagem, considerando lazy-load. */
  function getBestImageUrl(img) {
    if (!img) return "";
    const srcset = img.getAttribute && img.getAttribute("srcset");
    const fromSet = srcset ? String(srcset).split(",")[0].trim().split(/\s+/)[0] : "";
    return (
      (img.currentSrc && String(img.currentSrc)) ||
      (img.getAttribute && (img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        img.getAttribute("data-original"))) ||
      (img.getAttribute && img.getAttribute("src")) ||
      fromSet ||
      ""
    );
  }

  function unique(list, keyFn) {
    const map = new Map();
    list.forEach((item) => {
      const key = keyFn(item);
      if (!key) return;
      if (!map.has(key)) map.set(key, item);
    });
    return [...map.values()];
  }

  /* ------------------------------------------------------------------ */
  /* 13. Esperas por conteúdo Angular                                    */
  /* ------------------------------------------------------------------ */
  function waitForElement(root, selectors, timeout) {
    const limit = timeout || 5000;
    return new Promise((resolve) => {
      const found = query(root, selectors);
      if (found) return resolve(found);
      const started = Date.now();
      const tick = () => {
        const el = query(root, selectors);
        if (el) return resolve(el);
        if (Date.now() - started >= limit) return resolve(null);
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function waitForDOMStable(target, quietMs, timeout) {
    const quiet = quietMs || 300;
    const limit = timeout || 5000;
    return new Promise((resolve) => {
      if (!target || typeof MutationObserver === "undefined") return setTimeout(resolve, quiet);
      let timer = null;
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(done, quiet);
      });
      const done = () => {
        clearTimeout(timer);
        clearTimeout(hard);
        try { observer.disconnect(); } catch (_) { /* ignora */ }
        resolve();
      };
      const hard = setTimeout(done, limit);
      timer = setTimeout(done, quiet);
      try {
        observer.observe(target, { childList: true, subtree: true, characterData: true });
      } catch (_) {
        done();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Normalizações de domínio                                            */
  /* ------------------------------------------------------------------ */
  function normalizeCabinType(sourceName) {
    const n = normalizeText(sourceName);
    if (/suite|yacht club/.test(n)) return "suite";
    if (/varanda|balcony/.test(n)) return "varanda";
    if (/externa|ocean|vista mar/.test(n)) return "externa";
    if (/interna|inside/.test(n)) return "interna";
    return "outro";
  }

  function normalizePassengerProfile(label) {
    const n = normalizeText(label);
    if (/bebe|infant/.test(n)) return "infant";
    if (/crianc|child/.test(n)) return "child";
    if (/jovem|jovens|young/.test(n)) return "young";
    if (/adulto|adult/.test(n)) return "adult";
    return "other";
  }

  /** "29/12/2026" → "2026-12-29" */
  function normalizeDate(value) {
    if (!value) return "";
    const br = String(value).match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = String(value).match(/\d{4}-\d{2}-\d{2}/);
    return iso ? iso[0] : "";
  }

  /* ------------------------------------------------------------------ */
  /* Parser                                                              */
  /* ------------------------------------------------------------------ */
  function createParser(doc, options) {
    const opts = options || {};
    const document_ = doc;
    const view = opts.view || (doc && doc.defaultView) || null;
    const baseUrl = opts.url || (view && view.location && view.location.href) || "";
    const logs = [];
    const warnings = [];

    function log(field, selectorUsed, value, confidence) {
      logs.push({ field, selector_used: selectorUsed || null, value: value ?? null, confidence });
    }

    function warn(message) {
      if (!warnings.includes(message)) warnings.push(message);
    }

    /** 73. primary → secondary → fallback semântico, com log de confiança. */
    function resolve(field, candidates) {
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        let value = null;
        try {
          value = candidate.get();
        } catch (_) {
          value = null;
        }
        if (value !== null && value !== undefined && value !== "") {
          log(field, candidate.selector, value, i === 0 ? 1 : Math.max(0.4, 1 - i * 0.3));
          return value;
        }
      }
      warn(`${field} não detectado`);
      log(field, null, null, 0);
      return null;
    }

    const url = (u) => absoluteUrl(u, baseUrl);

    /* 4/65. Detecção de página --------------------------------------- */
    function detectPageType() {
      if (query(document_, FRT_SELECTORS.additionalModal)) return "additionals";
      if (query(document_, FRT_SELECTORS.checkout)) return "checkout";
      if (
        query(document_, FRT_SELECTORS.modalWindow) &&
        query(document_, FRT_SELECTORS.sideNavItems)
      ) {
        return "ship_details";
      }
      return "unknown";
    }

    function detectContent() {
      const found = [];
      if (query(document_, FRT_SELECTORS.priceSummary) || query(document_, FRT_SELECTORS.priceSummaryMobile)) {
        found.push("cruise_summary");
      }
      if (queryAll(document_, FRT_SELECTORS.cabinTypeItems).length) found.push("cabin_types");
      if (queryAll(document_, FRT_SELECTORS.cabinDetailItems).length) found.push("cabin_categories");
      if (queryAll(document_, FRT_SELECTORS.priceRows).length) found.push("prices");
      if (query(document_, FRT_SELECTORS.insuranceRoot)) found.push("insurance");
      if (queryAll(document_, FRT_SELECTORS.optionList).length) found.push("additionals");
      return found;
    }

    /* 5-11 / 28-34. Resumo e preços ----------------------------------- */
    function parsePriceSummary() {
      const summary = query(document_, FRT_SELECTORS.priceSummary);
      const mobile = query(document_, FRT_SELECTORS.priceSummaryMobile);
      const scope = summary || document_;

      const name = resolve("cruise.name", [
        { selector: FRT_SELECTORS.summaryName[0], get: () => text(document_, FRT_SELECTORS.summaryName) },
        {
          selector: ".price-summary-mobile .infos strong",
          get: () => (mobile ? text(mobile, ".infos strong") : null),
        },
        { selector: "document.title", get: () => clean(document_.title) || null },
      ]);

      const datesBox = query(document_, FRT_SELECTORS.summaryDates);
      const nightsText = datesBox
        ? texts(datesBox, "span").find((v) => /noites?/i.test(v))
        : null;
      const nights = nightsText ? Number((nightsText.match(/(\d+)/) || [])[1]) || null : null;
      if (nights) log("cruise.nights", ".dates span[noites]", nights, 1);
      else warn("Número de noites não detectado");

      const departureRaw = resolve("cruise.departure_date", [
        { selector: FRT_SELECTORS.summaryDate[0], get: () => text(document_, FRT_SELECTORS.summaryDate) },
        {
          selector: ".dates (texto dd/mm/aaaa)",
          get: () => (datesBox ? (clean(datesBox.textContent).match(/\d{2}\/\d{2}\/\d{4}/) || [])[0] || null : null),
        },
      ]);

      // 9. Passageiros: botão com .icon-user (sem depender de :has()).
      const passengerButton = datesBox
        ? [...datesBox.querySelectorAll("button")].find((b) => b.querySelector(".icon-user"))
        : null;
      const passengers = passengerButton
        ? Number((clean(passengerButton.textContent).match(/(\d+)/) || [])[1]) || null
        : null;
      if (passengers) log("occupancy.passengers", ".dates button .icon-user", passengers, 1);

      // 10/11. Embarque e desembarque por ícone, não por posição.
      const boardingRows = queryAll(document_, FRT_SELECTORS.summaryBoardingRows);
      const rowText = (row) =>
        clean(row.textContent).replace(/^(embarque|desembarque|chegada|retorno)\s*:?\s*/i, "");
      const embarkRow = boardingRows.find((r) => r.querySelector(".icon-arrow-up-right"));
      const disembarkRow = boardingRows.find((r) => r.querySelector(".icon-arrow-down-left"));
      const embark = embarkRow ? rowText(embarkRow) : "";
      const disembark = disembarkRow ? rowText(disembarkRow) : "";
      if (embark) log("cruise.embark_port", ".boarding .icon-arrow-up-right", embark, 1);
      if (disembark) log("cruise.disembark_port", ".boarding .icon-arrow-down-left", disembark, 1);

      // 28/29. Tarifa e categoria escolhida (validação cruzada).
      const infoPrice = query(scope, FRT_SELECTORS.infoPrice) || query(document_, FRT_SELECTORS.infoPrice);
      const fareName = infoPrice ? text(infoPrice, FRT_SELECTORS.fareName) : null;
      const selectedCabinLabel = infoPrice ? text(infoPrice, "h4") : null;

      // 30/31. Linhas de preço por rótulo, nunca por posição.
      const rows = queryAll(document_, FRT_SELECTORS.priceRows);
      const passengerPrices = [];
      let taxes = null;
      rows.forEach((row) => {
        const spans = [...row.querySelectorAll(":scope > span")];
        const label = clean(spans[0] ? spans[0].textContent : "");
        const valueText = clean(spans.length ? spans[spans.length - 1].textContent : "");
        const value = moneyToNumber(valueText);
        const n = normalizeText(label);
        if (!label) return;
        if (n.includes("taxas") && n.includes("imposto")) {
          taxes = value;
          return;
        }
        if (/passageiro|adulto|crianc|bebe|jovem/.test(n)) {
          passengerPrices.push({ label, value });
        }
      });
      if (taxes !== null) log("pricing.taxes", "list-summary-item[taxas e impostos]", taxes, 1);

      const total = resolve("pricing.total", [
        {
          selector: FRT_SELECTORS.totalPrice[0],
          get: () => moneyToNumber(text(document_, FRT_SELECTORS.totalPrice)),
        },
        {
          selector: ".price-summary-mobile .price .price",
          get: () => (mobile ? moneyToNumber(text(mobile, ".price .price")) : null),
        },
      ]);

      // 33. Parcelamento.
      const instRoot = query(document_, FRT_SELECTORS.installmentRoot);
      let installment = {};
      if (instRoot) {
        const box = clean((query(instRoot, FRT_SELECTORS.installmentCount) || {}).textContent || "");
        const whole = clean(instRoot.textContent);
        const count = Number((`${box} ${whole}`.match(/(\d{1,2})\s*x/i) || [])[1]) || null;
        installment = {
          has_entry: /entrada/i.test(whole),
          installments: count,
          interest_free:
            !!query(instRoot, FRT_SELECTORS.installmentFree) || /sem juros/i.test(whole),
        };
        log("pricing.installment", ".installment-card-wrapper", installment.installments, 1);
      }

      return {
        cruise: {
          name: name || "",
          departure_date: normalizeDate(departureRaw),
          departure_date_source: departureRaw || "",
          nights,
          embark_port: embark,
          disembark_port: disembark,
          currency: "BRL",
        },
        occupancy: parseOccupancy(passengers),
        pricing: {
          fare_name: fareName || "",
          selected_cabin_label: selectedCabinLabel || "",
          passengers: passengerPrices,
          taxes,
          total,
          installment,
        },
      };
    }

    /* 84-100. Ocupação real renderizada na página --------------------- */
    /* A composição de passageiros faz parte da identidade do preço:
       duas capturas visualmente iguais com ocupações diferentes são dois
       registros comerciais distintos. Por isso lemos a ocupação do DOM e
       nunca de uma variável mantida pelo plugin. */
    function parseOccupancy(passengersHint) {
      const occ = {
        adults: 0,
        young: 0,
        children: 0,
        infants: 0,
        children_ages: [],
        total: 0,
        passengers: passengersHint || null,
        source: "",
        warnings: [],
      };

      const addProfile = (profile, qty) => {
        const n = Math.max(0, Math.trunc(Number(qty) || 0));
        if (!n) return;
        if (profile === "child") occ.children += n;
        else if (profile === "young") occ.young += n;
        else if (profile === "infant") occ.infants += n;
        else occ.adults += n;
      };

      // 1) Painel/modal de passageiros (fonte mais confiável): linhas do tipo
      //    "Adultos  - 2 +", "Crianças 1", "Bebês 0".
      const panels = [
        ...queryAll(document_, [
          "app-passengers",
          "app-passenger-selection",
          "app-passengers-modal",
          ".passengers-dropdown",
          ".passenger-selector",
          "ngb-modal-window .passengers",
        ]),
        // Fallback: qualquer modal aberto que fale de adultos/crianças.
        ...[...document_.querySelectorAll("ngb-modal-window, .modal-content")].filter((el) =>
          /adulto/.test(normalizeText(el.textContent)) && /crianc|bebe/.test(normalizeText(el.textContent)),
        ),
      ];

      let read = false;
      for (const panel of panels) {
        const rows = [...panel.querySelectorAll("li, .row, .passenger-row, .item, div")];
        const seen = new Set();
        rows.forEach((row) => {
          const label = normalizeText(row.textContent);
          if (!label || label.length > 60) return;
          const kind = /adulto/.test(label)
            ? "adult"
            : /jovem|jovens/.test(label)
              ? "young"
              : /crianc/.test(label)
                ? "child"
                : /bebe/.test(label)
                  ? "infant"
                  : null;
          if (!kind || seen.has(kind)) return;
          const input = row.querySelector("input");
          const fromInput = input ? Number(input.value) : NaN;
          const qty = Number.isFinite(fromInput)
            ? fromInput
            : Number((label.match(/(\d+)\s*$/) || label.match(/(\d+)/) || [])[1]);
          if (!Number.isFinite(qty)) return;
          seen.add(kind);
          addProfile(kind, qty);
          read = true;
        });
        if (read) {
          occ.source = "dom_passenger_panel";
          break;
        }
      }

      // 2) Linhas de preço por passageiro do resumo.
      if (!read) {
        const rows = queryAll(document_, FRT_SELECTORS.priceRows);
        rows.forEach((row) => {
          const spans = [...row.querySelectorAll(":scope > span")];
          const label = clean(spans[0] ? spans[0].textContent : "");
          const n = normalizeText(label);
          if (!/passageiro|adulto|crianc|bebe|jovem/.test(n)) return;
          addProfile(normalizePassengerProfile(label), 1);
          read = true;
        });
        if (read) occ.source = "dom_price_rows";
      }

      // 3) Botão "N passageiros" do resumo.
      if (!read && passengersHint) {
        occ.adults = passengersHint;
        occ.source = "dom_passenger_button";
        read = true;
      }

      // Idades de crianças, quando a página exibir.
      queryAll(document_, [".passenger-age select", ".child-age select", "select[name*='idade']"]).forEach((sel) => {
        const v = Number(sel.value);
        if (Number.isFinite(v) && v >= 0 && v <= 30) occ.children_ages.push(v);
      });
      occ.children_ages.sort((a, b) => a - b);

      occ.total = occ.adults + occ.young + occ.children + occ.infants;

      if (!occ.total) {
        occ.warnings.push("Ocupação não identificada na página");
        warn("Ocupação não identificada na página");
      } else if (passengersHint && passengersHint !== occ.total) {
        occ.warnings.push(
          `Ocupação divergente: resumo indica ${passengersHint} passageiro(s) e a composição lida soma ${occ.total}`,
        );
      }
      if (occ.total) log("occupancy.total", occ.source, occ.total, occ.source === "dom_passenger_panel" ? 1 : 0.6);
      return occ;
    }

    /* 95/96. Espera o recálculo assíncrono após mudar a ocupação.
       Não exigimos que o total mude: confirmamos pela ocupação renderizada,
       pelas linhas de passageiros e pela estabilização do resumo. */
    async function waitForPriceRecalculation(options) {
      const opts = options || {};
      const expectedTotal = opts.expectedOccupancyTotal || null;
      const timeout = opts.timeout || 12000;
      const quiet = opts.quiet || 500;
      const started = Date.now();

      const scope =
        query(document_, FRT_SELECTORS.priceSummary) ||
        query(document_, FRT_SELECTORS.priceSummaryMobile) ||
        document_.body;

      // 1) espera a composição renderizada bater com a pedida (quando houver).
      if (expectedTotal) {
        while (Date.now() - started < timeout) {
          const occ = parseOccupancy(null);
          if (occ.total === expectedTotal) break;
          await waitForDOMStable(scope, 200, 800);
        }
      }

      // 2) espera o resumo de preço parar de mudar.
      await waitForDOMStable(scope, quiet, Math.max(1500, timeout - (Date.now() - started)));

      const occ = parseOccupancy(null);
      const summary = parsePriceSummary();
      const result = {
        occupancy: occ,
        total: summary.pricing.total,
        taxes: summary.pricing.taxes,
        passenger_prices: summary.pricing.passengers,
        elapsed_ms: Date.now() - started,
        warnings: [...occ.warnings],
      };
      if (expectedTotal && occ.total !== expectedTotal) {
        result.warnings.push(
          `Requested occupancy differs from rendered occupancy (pedido ${expectedTotal}, renderizado ${occ.total})`,
        );
      }
      return result;
    }

    /* 97. Fingerprint comercial — muda com a ocupação. */
    function pricingFingerprint(input) {
      const occ = input.occupancy || {};
      const canonical = JSON.stringify({
        cruiseId: String(input.cruiseId || "").trim(),
        departureDate: String(input.departureDate || "").slice(0, 10),
        cabinType: String(input.cabinType || "").trim().toLowerCase(),
        cabinCategoryCodes: [...(input.cabinCategoryCodes || [])].map(String).sort(),
        fareName: String(input.fareName || "").trim().toLowerCase(),
        occupancy: {
          adults: occ.adults || 0,
          young: occ.young || 0,
          children: occ.children || 0,
          infants: occ.infants || 0,
          children_ages: [...(occ.children_ages || [])].sort((a, b) => a - b),
        },
      });
      let h = 5381;
      let h2 = 52711;
      for (let i = 0; i < canonical.length; i += 1) {
        h = ((h << 5) + h + canonical.charCodeAt(i)) >>> 0;
        h2 = ((h2 << 5) + h2 + canonical.charCodeAt(canonical.length - 1 - i)) >>> 0;
      }
      return `${h.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
    }


    /* 20-26. Categorias de cabine visíveis --------------------------- */
    function parseVisibleCabinCategories(typeName) {
      const root = query(document_, FRT_SELECTORS.cabinDetailRoot) || document_;
      const items = queryAll(root, FRT_SELECTORS.cabinDetailItems);
      return items.map((cabin) => {
        const rawCategory = text(cabin, FRT_SELECTORS.cabinCategory) || "";
        const codes = rawCategory
          .replace(/categorias?\s*:?/i, "")
          .split(/[,/]/)
          .map((c) => clean(c))
          .filter(Boolean);
        const imgEl = query(cabin, FRT_SELECTORS.cabinImage);
        const amenities = queryAll(cabin, FRT_SELECTORS.amenityCards).map((card) => ({
          name: text(card, FRT_SELECTORS.amenityName) || clean(card.textContent),
          icon_url: url(attr(card, FRT_SELECTORS.amenityIcon, "src") || ""),
          icon_alt: attr(card, FRT_SELECTORS.amenityIcon, "alt") || "",
        }));
        const selected = !!query(cabin, FRT_SELECTORS.cabinSelected);
        const upgrade = moneyToNumber(text(cabin, FRT_SELECTORS.cabinUpgrade));
        return {
          type: normalizeCabinType(typeName),
          source_type_name: typeName || "",
          name: text(cabin, FRT_SELECTORS.cabinName) || "",
          codes,
          source_category: rawCategory,
          image_url: imgEl ? url(getBestImageUrl(imgEl)) : "",
          image_alt: imgEl ? imgEl.getAttribute("alt") || "" : "",
          amenities,
          selected,
          upgrade,
        };
      });
    }

    /* 14-19. Tipos de cabine ----------------------------------------- */
    function parseCabinTypes() {
      const root = query(document_, FRT_SELECTORS.cabinTypeRoot) || document_;
      return queryAll(root, FRT_SELECTORS.cabinTypeItems).map((item) => {
        const sourceName = text(item, FRT_SELECTORS.cabinTypeName) || "";
        const imgHolder = query(item, FRT_SELECTORS.cabinTypeImage);
        const input = item.querySelector("input");
        return {
          element: item,
          type: normalizeCabinType(sourceName),
          source_name: sourceName,
          image_url: imgHolder ? url(backgroundImageUrl(imgHolder, view)) : "",
          upgrade: moneyToNumber(text(item, FRT_SELECTORS.cabinTypeUpgrade)),
          selected: !!(input && input.checked) || !!query(item, FRT_SELECTORS.cabinTypeSelected),
        };
      });
    }

    /* 35. Seguro ------------------------------------------------------ */
    function parseInsurances() {
      const root = query(document_, FRT_SELECTORS.insuranceRoot);
      if (!root) return [];
      const box = query(root, FRT_SELECTORS.insurance) || root;
      const whole = clean(box.textContent);
      const withoutPrices = clean(whole.replace(/R\$\s*[\d.,]+/g, " "));
      const name = clean((withoutPrices.match(/SEGURO.{0,120}/i) || [withoutPrices.slice(0, 90)])[0])
        .replace(/\s*(ver cobertura|saiba mais)\s*$/i, "")
        .trim();
      const price =
        moneyToNumber(text(box, "strong")) ||
        moneyToNumber(text(root, FRT_SELECTORS.insuranceMobilePrice));
      const link =
        query(box, ".insurance__badge-recommended[href]") || query(box, "a[href]") || query(root, "a[href]");
      if (!name) return [];
      return [
        {
          name,
          price_per_person: price,
          coverage_url: link ? url(link.getAttribute("href")) : "",
        },
      ];
    }

    /* 43-47. Adicionais do painel ativo ------------------------------ */
    function parseAdditionals(category) {
      const modal = query(document_, FRT_SELECTORS.additionalModal);
      const scope = modal || document_;
      const pane = query(scope, FRT_SELECTORS.activePane) || scope;
      const categoryName =
        category || text(scope, FRT_SELECTORS.detailTitle) || "Outros";

      return queryAll(pane, FRT_SELECTORS.optionList).map((item) => {
        const h3 = query(item, FRT_SELECTORS.optionTitle);
        let name = "";
        let code = "";
        if (h3) {
          const codeSpan = h3.querySelector("span");
          code = codeSpan ? clean(codeSpan.textContent).replace(/[()]/g, "").trim() : "";
          const clone = h3.cloneNode(true);
          const spanClone = clone.querySelector("span");
          if (spanClone) spanClone.remove();
          name = clean(clone.textContent);
        } else {
          name = clean(item.textContent).slice(0, 120);
        }

        const prices = queryAll(item, FRT_SELECTORS.optionPriceItems).map((priceItem) => {
          const value = moneyToNumber(text(priceItem, FRT_SELECTORS.optionPrice));
          const labelEl = [...priceItem.querySelectorAll("span")].find(
            (el) => !el.classList.contains("price"),
          );
          const sourceLabel = labelEl ? clean(labelEl.textContent) : "";
          return {
            profile: normalizePassengerProfile(sourceLabel),
            source_label: sourceLabel,
            value,
          };
        });

        /* A FRT repete "por criança" para criança e bebê (mesmo rótulo).
           A ordem renderizada é sempre adulto → jovem → criança → bebê,
           então a segunda ocorrência de "criança" vira bebê. */
        let sawChild = false;
        prices.forEach((p) => {
          if (p.profile !== "child") return;
          if (sawChild) {
            p.profile = "infant";
            p.source_label = `${p.source_label} (bebê)`;
          }
          sawChild = true;
        });


        // 47. Imagem só se realmente existir — nunca inventar.
        const holder = query(item, FRT_SELECTORS.optionImage);
        let image = "";
        if (holder) {
          const img = holder.querySelector("img");
          image = img ? url(getBestImageUrl(img)) : url(backgroundImageUrl(holder, view));
        }

        return {
          category: categoryName,
          code,
          name,
          description: text(item, ".description__text p") || "",
          image_url: image,
          prices,
        };
      });
    }

    /* 50-51. Itinerário ---------------------------------------------- */
    /* A FRT renderiza o itinerário como blocos de texto:
       "ter. 29.12.26 | 01 | Santos, Brasil | Saída 16:00". Não há <li>. */
    const DATE_DOT = /(\d{2})\.(\d{2})\.(\d{2})/;

    function itineraryFromText(rawText) {
      const flat = clean(rawText).replace(/\s+/g, " ");
      // Quebra o texto em blocos que começam por "seg. 29.12.26".
      const re = /(?:seg|ter|qua|qui|sex|s[áa]b|dom)\.?\s*\d{2}\.\d{2}\.\d{2}/gi;
      const starts = [];
      let m;
      while ((m = re.exec(flat)) !== null) starts.push(m.index);
      if (!starts.length) return [];
      const blocks = starts.map((start, i) =>
        flat.slice(start, i + 1 < starts.length ? starts[i + 1] : flat.length),
      );
      return blocks
        .map((block, index) => {
          const d = block.match(DATE_DOT);
          const rest = block.replace(/^(?:seg|ter|qua|qui|sex|s[áa]b|dom)\.?\s*\d{2}\.\d{2}\.\d{2}\s*/i, "");
          const dayMatch = rest.match(/^\s*(\d{1,2})\s+/);
          const day = dayMatch ? Number(dayMatch[1]) : index + 1;
          const afterDay = dayMatch ? rest.slice(dayMatch[0].length) : rest;
          const arrival = (afterDay.match(/chegada\s*(\d{2}:\d{2})/i) || [])[1] || "";
          const departure = (afterDay.match(/sa[ií]da\s*(\d{2}:\d{2})/i) || [])[1] || "";
          const portRaw = clean(
            afterDay
              .replace(/(chegada|sa[ií]da)\s*\d{2}:\d{2}/gi, "")
              .replace(/\d{2}:\d{2}/g, "")
              .replace(/[|\u2013\u2014]/g, " "),
          );
          const parts = portRaw.split(",").map((p) => clean(p)).filter(Boolean);
          return {
            day,
            date: d ? `20${d[3]}-${d[2]}-${d[1]}` : "",
            port: parts[0] || portRaw.slice(0, 80),
            country: parts.length > 1 ? parts[parts.length - 1] : "",
            arrival,
            departure,
            description: "",
            image_url: "",
            map_image_url: "",
            activities: [],
          };
        })
        .filter((d) => d.port);
    }

    function parseItinerary(scopeEl) {
      const pane = scopeEl || query(document_, FRT_SELECTORS.activePane) || document_;
      const rows = [
        ...pane.querySelectorAll("[class*='itinerar'] li, [class*='itinerar'] tr, [class*='roteiro'] li, li"),
      ].filter((el) => /dia\s*\d+|\d{2}\/\d{2}\/\d{4}/i.test(clean(el.textContent)));

      let days = rows.map((row, index) => {
        const whole = clean(row.textContent);
        const day = Number((whole.match(/dia\s*(\d+)/i) || [])[1]) || index + 1;
        const labeled = (kw) => {
          const re = new RegExp(`${kw}[^0-9]{0,12}(\\d{2}:\\d{2})`, "i");
          return (whole.match(re) || [])[1] || "";
        };
        const arrival = labeled("chegada") || labeled("embarque");
        const departure = labeled("sa[ií]da") || labeled("desembarque");
        const portRaw = whole
          .replace(/dia\s*\d+/i, "")
          .replace(/\d{2}\/\d{2}\/\d{4}/g, "")
          .replace(/(chegada|sa[ií]da|embarque|desembarque)\s*:?/gi, "")
          .replace(/\d{2}:\d{2}/g, "")
          .replace(/[-\u2013\u2014|]/g, " ")
          .trim();
        const parts = portRaw.split(",").map((p) => clean(p)).filter(Boolean);
        const img = row.querySelector("img");
        return {
          day,
          date: normalizeDate((whole.match(/\d{2}\/\d{2}\/\d{4}/) || [])[0] || ""),
          port: parts[0] || clean(portRaw).slice(0, 80),
          country: parts.length > 1 ? parts[parts.length - 1] : "",
          arrival,
          departure,
          description: "",
          image_url: img ? url(getBestImageUrl(img)) : "",
          map_image_url: "",
          activities: [],
        };
      });

      // Fallback textual (layout atual da FRT, sem <li>).
      if (!days.length) days = itineraryFromText(pane.textContent || "");
      if (!days.length) warn("Itinerário não detectado");

      // 51. Mapa: só marca como mapa quando o contexto confirma.
      const mapImg = [...pane.querySelectorAll("img")].find((img) =>
        /map|mapa|roteiro/i.test(`${img.getAttribute("alt") || ""} ${getBestImageUrl(img)}`),
      );
      const mapUrl = mapImg ? url(getBestImageUrl(mapImg)) : "";
      const byDay = new Map();
      days.forEach((d) => {
        if (mapUrl) d.map_image_url = mapUrl;
        byDay.set(d.day, d);
      });
      return [...byDay.values()].sort((a, b) => a.day - b.day);
    }

    /* 53/60. Navio e ficha técnica ------------------------------------ */
    const SPEC_LABELS = [
      "tamanho", "inauguracao", "ultima reforma", "decks", "passageiros", "cabines",
      "tripulantes", "altura", "comprimento", "largura", "tonelagem", "velocidade",
      "bandeira", "estaleiro", "tonelagem x passageiros", "passageiros x tripulantes",
    ];

    function parseTechnicalSheet(scopeEl) {
      const pane = scopeEl || query(document_, FRT_SELECTORS.activePane) || document_;
      const specs = {};
      const put = (label, value) => {
        const key = normalizeText(label).replace(/:$/, "");
        const val = clean(value);
        if (!key || !val || val.length > 80) return;
        if (!specs[key]) specs[key] = val;
      };

      // app-ship-detail-specs: <strong>valor</strong><span>rótulo</span>
      [...pane.querySelectorAll(".mini-technical-sheet .item")].forEach((item) => {
        put(text(item, "span"), text(item, "strong"));
      });
      // Dimensões: <span>Altura:</span><strong>67,69 m</strong>
      [...pane.querySelectorAll(".ship-dimensions__line .text, .infos-icon")].forEach((el) => {
        put(text(el, "span"), text(el, "strong"));
      });

      [...pane.querySelectorAll("li, tr, dl > div, [class*='spec'], [class*='ficha'] div")].forEach((el) => {
        const dt = el.querySelector("dt, th, strong, b, .label, .title");
        const dd = el.querySelector("dd, td:last-child, .value, span:last-child");
        let label = dt ? clean(dt.textContent) : "";
        let value = dd && dd !== dt ? clean(dd.textContent) : "";
        if (!label || !value) {
          const m = clean(el.textContent).match(/^([^:]{3,40}):\s*(.+)$/);
          if (!m) return;
          label = m[1];
          value = m[2];
        }
        const key = normalizeText(label).replace(/:$/, "");
        if (!key || value.length > 80) return;
        // Aceita rótulos conhecidos e novos, mas ignora frases longas.
        if (!SPEC_LABELS.includes(key) && key.split(" ").length > 4) return;
        if (!specs[key]) specs[key] = value;
      });

      // 61. Desenho técnico: imagem associada ao blueprint.
      const drawing =
        query(pane, ".ship-dimensions__image img") ||
        [...pane.querySelectorAll("img")].find((img) =>
          /desenho|tecnic|blueprint|ficha/i.test(`${img.getAttribute("alt") || ""} ${getBestImageUrl(img)}`),
        );
      return { specs, technical_drawing_url: drawing ? url(getBestImageUrl(drawing)) : "" };
    }

    /* Bloco padrão da FRT: .content-detail__item (atrações e cabines). */
    function contentDetailItems(pane) {
      return [...pane.querySelectorAll(".content-detail__item")];
    }

    function longestParagraph(el) {
      const candidates = [...el.querySelectorAll("div, p")]
        .map((n) => clean(n.textContent))
        .filter((t) => t.length > 40);
      return candidates.sort((a, b) => b.length - a.length)[0] || "";
    }

    function itemImages(el) {
      return unique(
        [...el.querySelectorAll("img")]
          .map((img) => url(getBestImageUrl(img)))
          .filter((src) => src && !/data:|icons\//i.test(src))
          .map((src) => ({ src })),
        (i) => i.src,
      ).map((i) => i.src);
    }

    /* 54. Atrações ---------------------------------------------------- */
    function parseAttractions(scopeEl, categoryHint) {
      const pane = scopeEl || query(document_, FRT_SELECTORS.activePane) || document_;
      const items = contentDetailItems(pane);
      let out;

      if (items.length) {
        out = items.map((el) => {
          const content = query(el, ".content-detail__content") || el;
          const name = text(content, "h2") || clean(content.textContent).slice(0, 60);
          const description = longestParagraph(content);
          const tags = texts(content, ".category-icon span");
          const whole = clean(el.textContent);
          return {
            category:
              categoryHint ||
              (/restaurante|buffet|bar\b/i.test(whole)
                ? "restaurantes"
                : /piscina/i.test(whole)
                  ? "piscinas"
                  : /crianc/i.test(whole)
                    ? "criancas"
                    : "outros"),
            name,
            description: [description, tags.length ? tags.join(" • ") : ""].filter(Boolean).join(" — "),
            deck: (whole.match(/(?:deck|conv[ée]s)\s*(\d+)/i) || [])[1] || "",
            images: itemImages(el),
          };
        });
      } else {
        const cards = [
          ...pane.querySelectorAll("[class*='card'], [class*='attraction'], [class*='atrac'] li"),
        ];
        out = cards.map((el) => {
          const name =
            text(el, "h3,h4,.title,[class*='title'],[class*='name'],strong") ||
            clean(el.textContent).slice(0, 60);
          const whole = clean(el.textContent);
          const img = el.querySelector("img");
          return {
            category: categoryHint || "outros",
            name,
            description: text(el, "p") || "",
            deck: (whole.match(/(?:deck|conv[ée]s)\s*(\d+)/i) || [])[1] || "",
            images: img ? [url(getBestImageUrl(img))] : [],
          };
        });
      }
      return unique(out.filter((a) => a.name), (a) => normalizeText(a.name));
    }

    /* 55. Cabines informativas do navio ------------------------------- */
    function parseShipCabins(scopeEl) {
      const pane = scopeEl || query(document_, FRT_SELECTORS.activePane) || document_;
      const items = contentDetailItems(pane);
      let out;

      if (items.length) {
        out = items.map((el) => {
          const content = query(el, ".content-detail__content") || el;
          const whole = clean(el.textContent);
          const name = text(content, "h2") || whole.slice(0, 60);
          const codes = texts(content, "small span")
            .filter((t) => !/categorias?/i.test(t))
            .map((t) => clean(t))
            .filter(Boolean);
          const capacityEl = query(content, ".capacity strong");
          const sizes = texts(content, ".size strong").filter((t) => /m[²2]/i.test(t) || /^\d/.test(t));
          return {
            cabin_type: normalizeCabinType(name),
            code: codes.join(", "),
            name,
            capacity:
              Number(
                (clean(capacityEl ? capacityEl.textContent : whole).match(
                  /at[ée]\s*(\d+)\s*(?:pessoas?|h[óo]spedes?)/i,
                ) || [])[1],
              ) || null,
            size_m2: sizes.join(" ~ "),
            description: longestParagraph(content),
            amenities: [],
            photos: itemImages(el),
          };
        });
      } else {
        const cards = [...pane.querySelectorAll("[class*='cabin'], [class*='cabine']")].filter((el) =>
          /interna|externa|varanda|su[ií]te/i.test(clean(el.textContent)),
        );
        out = cards.map((el) => {
          const whole = clean(el.textContent);
          const name = text(el, "h3,h4,.name,[class*='title'],strong") || whole.slice(0, 60);
          return {
            cabin_type: normalizeCabinType(name || whole),
            code: (whole.match(/categorias?\s*:?\s*([\w, ]+)/i) || [])[1] || "",
            name,
            capacity: Number((whole.match(/at[ée]\s*(\d+)\s*(pessoas|h[óo]spedes)/i) || [])[1]) || null,
            size_m2: (whole.match(/(\d+[,.]?\d*)\s*m[²2]/i) || [])[1] || "",
            description: text(el, "p") || "",
            amenities: texts(el, "li"),
            photos: [...el.querySelectorAll("img")].map((i) => url(getBestImageUrl(i))).filter(Boolean),
          };
        });
      }
      return unique(out.filter((c) => c.name), (c) => `${c.cabin_type}|${normalizeText(c.name)}`);
    }


    /* 56. Deck plans --------------------------------------------------- */
    function parseDeckPlans(scopeEl, label) {
      const pane = scopeEl || query(document_, FRT_SELECTORS.activePane) || document_;
      const out = [];
      [...pane.querySelectorAll("img")].forEach((img) => {
        const src = url(getBestImageUrl(img));
        const alt = img.getAttribute("alt") || "";
        const hay = `${alt} ${src} ${label || ""}`;
        if (!/deck|planta/i.test(hay)) return;
        const num = Number((hay.match(/deck[^0-9]{0,4}(\d{1,2})/i) || [])[1]) || null;
        out.push({
          deck_label: label || (num ? `Deck ${num}` : clean(alt) || "Deck"),
          deck_number: num,
          image_url: src,
          source_url: baseUrl,
          requires_canvas_capture: false,
        });
      });
      [...pane.querySelectorAll("canvas")].forEach(() => {
        out.push({
          deck_label: label || "Deck",
          deck_number: label ? Number((label.match(/(\d+)/) || [])[1]) || null : null,
          image_url: "",
          source_url: baseUrl,
          requires_canvas_capture: true,
        });
      });
      return unique(out, (d) => `${d.deck_label}|${d.image_url}`);
    }

    /* 57-59. Mídia ---------------------------------------------------- */
    function parseMedia(scopeEl, context, scope) {
      const pane = scopeEl || document_;
      const out = [];
      [...pane.querySelectorAll("img")].forEach((img) => {
        const src = url(getBestImageUrl(img));
        if (!src || /^data:/.test(src)) return;
        const w = img.naturalWidth || Number(img.getAttribute("width")) || 0;
        const alt = img.getAttribute("alt") || "";
        const isChrome = /logo|icon|sprite|avatar|bandeira/i.test(`${alt} ${src}`);
        if (isChrome) return;
        if (w && w < 300) return;
        out.push({
          media_type: "image",
          context: context || "gallery",
          source_url: src,
          hires_url: url(img.getAttribute("data-zoom") || img.getAttribute("data-large") || ""),
          thumbnail_url: "",
          embed_url: "",
          provider: "",
          title: img.getAttribute("title") || "",
          alt,
          scope: scope || "ship",
        });
      });
      [...pane.querySelectorAll("video, video source, iframe[src], a[href]")].forEach((el) => {
        const tag = el.tagName.toLowerCase();
        let src = "";
        if (tag === "video") src = el.currentSrc || el.getAttribute("src") || "";
        else if (tag === "source") src = el.getAttribute("src") || "";
        else if (tag === "iframe") src = el.getAttribute("src") || "";
        else src = el.getAttribute("href") || "";
        if (!src) return;
        if (tag === "a" && !/youtube|youtu\.be|vimeo|\.mp4/i.test(src)) return;
        if (tag === "iframe" && !/youtube|vimeo|player/i.test(src)) return;
        out.push({
          media_type: "video",
          context: "video",
          source_url: url(src),
          hires_url: "",
          thumbnail_url: url(el.getAttribute && el.getAttribute("poster")),
          embed_url: url(src),
          provider: /youtube|youtu\.be/i.test(src) ? "youtube" : /vimeo/i.test(src) ? "vimeo" : "html5",
          title: (el.getAttribute && el.getAttribute("title")) || "",
          alt: "",
          scope: scope || "ship",
        });
      });
      return unique(out, (m) => m.source_url);
    }

    return {
      PARSER_NAME,
      PARSER_VERSION,
      selectors: FRT_SELECTORS,
      document: document_,
      logs,
      warnings,
      log,
      warn,
      detectPageType,
      detectContent,
      parsePriceSummary,
      parseOccupancy,
      waitForPriceRecalculation,
      pricingFingerprint,

      parseCabinTypes,
      parseVisibleCabinCategories,
      parseInsurances,
      parseAdditionals,
      parseItinerary,
      parseTechnicalSheet,
      parseAttractions,
      parseShipCabins,
      parseDeckPlans,
      parseMedia,
    };
  }

  const API = {
    PARSER_NAME,
    PARSER_VERSION,
    FRT_SELECTORS,
    createParser,
    helpers: {
      text,
      texts,
      attr,
      query,
      queryAll,
      moneyToNumber,
      normalizeText,
      absoluteUrl,
      parseCssUrl,
      backgroundImageUrl,
      getBestImageUrl,
      normalizeCabinType,
      normalizePassengerProfile,
      normalizeDate,
      waitForElement,
      waitForDOMStable,
      unique,
      clean,
    },
  };

  globalScope.FRTKroozeCruiseParser = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : window);
