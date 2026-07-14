/* Via Air — content script (MV3)
 *
 * Fluxo:
 * 1. Ao carregar página da LATAM/GOL/AZUL, procuramos por um token na URL
 *    (fragmento #viaair=BASE64 ou query ?viaair=BASE64). Se achamos,
 *    persistimos {token, apiBase, airline_hint} em chrome.storage.local
 *    ligado ao host+path da reserva.
 * 2. Injetamos um botão flutuante "📥 Importar pra Via Air".
 * 3. Ao clicar, capturamos innerText do conteúdo principal e mandamos
 *    POST para {apiBase}/api/public/import-aereo.
 */

(function () {
  const HOST = location.hostname;

  // Todas as origens suportadas. `key` é usado como airline_hint no backend
  // e como sufixo em chrome.storage.local ("viaair::" + key).
  const SOURCES = [
    { key: "latam",        match: (h) => h.includes("latamairlines") },
    { key: "gol",          match: (h) => h.includes("voegol") },
    { key: "azul",         match: (h) => h.includes("voeazul") },
    { key: "skyteam",      match: (h) => h.includes("portal.skyteam.tur.br") },
    { key: "frt",          match: (h) => h.startsWith("frt.infotravel") },
    { key: "visualturismo",match: (h) => h.startsWith("visualturismo.infotravel") },
    { key: "infotera",     match: (h) => h.includes("infotravel.com.br") }, // fallback genérico
  ];

  const source = SOURCES.find((s) => s.match(HOST));
  if (!source) return;
  const airline = source.key;

  const storageKey = "viaair::" + airline;
  const legacyStorageKey = "viaair::" + HOST;

  function parseViaAirPayload() {
    // Compat: fluxo antigo com #viaair=BASE64 (mantido pra transição).
    const sources = [location.hash.replace(/^#/, ""), location.search.replace(/^\?/, "")];
    for (const src of sources) {
      const params = new URLSearchParams(src);
      const raw = params.get("viaair");
      if (!raw) continue;
      try {
        const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
        const obj = JSON.parse(json);
        if (obj && obj.token && obj.apiBase) return obj;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  async function loadCtx() {
    const payload = parseViaAirPayload();
    if (payload) {
      await chrome.storage.local.set({ [storageKey]: { ...payload, airline, savedAt: Date.now() } });
      return { ...payload, airline };
    }
    const stored = await chrome.storage.local.get([storageKey, legacyStorageKey]);
    return stored[storageKey] || stored[legacyStorageKey] || null;
  }

  function extractTables(doc) {
    // Preserva estrutura de tabelas (consolidadora renderiza voos e passageiros
    // em <table>). Sem isso o textContent colapsa colunas e o LLM se perde.
    const chunks = [];
    const tables = doc.querySelectorAll("table");
    for (const t of tables) {
      if (!isVisible(t)) continue;
      const rows = [];
      const trs = t.querySelectorAll("tr");
      for (const tr of trs) {
        if (!isVisible(tr)) continue;
        const cells = tr.querySelectorAll("th,td");
        if (!cells.length) continue;
        const line = Array.from(cells)
          .map((c) => {
            const text = (c.innerText || "").replace(/\s+/g, " ").trim();
            const mediaLabels = Array.from(c.querySelectorAll("img,[title],[aria-label]"))
              .flatMap((node) => [node.getAttribute("alt"), node.getAttribute("title"), node.getAttribute("aria-label")])
              .filter(Boolean)
              .map((value) => value.replace(/\s+/g, " ").trim());
            return Array.from(new Set([text, ...mediaLabels].filter(Boolean))).join(" ");
          })
          .filter(Boolean)
          .join(" | ");
        if (line) rows.push(line);
      }
      if (rows.length) chunks.push("TABELA:\n" + rows.join("\n"));
    }
    return chunks.join("\n\n");
  }

  function isVisible(el) {
    if (!el || el.hidden || el.getAttribute("aria-hidden") === "true") return false;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function normalizeText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function normalizeKey(value) {
    return normalizeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[.\s/()-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function directCells(row, selector) {
    return Array.from(row.children).filter((cell) => cell.matches(selector));
  }

  function createHeaderMap(table) {
    const headerRows = Array.from(table.querySelectorAll(":scope > thead > tr"));
    const headers = headerRows.length ? directCells(headerRows[headerRows.length - 1], "th,td") : [];
    const map = {};
    headers.forEach((header, index) => {
      const key = normalizeKey(header.innerText || header.textContent);
      if (key && map[key] === undefined) map[key] = index;
    });
    return map;
  }

  function headerIndex(map, names) {
    for (const name of names) {
      if (map[name] !== undefined) return map[name];
    }
    return -1;
  }

  function cellText(cells, map, names) {
    const index = headerIndex(map, names);
    return index >= 0 && cells[index] ? normalizeText(cells[index].innerText || cells[index].textContent) : "";
  }

  function findStructuredTable(block, requiredHeaders) {
    if (!block) return null;
    for (const table of block.querySelectorAll("table")) {
      const map = createHeaderMap(table);
      if (requiredHeaders.every((names) => headerIndex(map, names) >= 0)) return { table, map };
    }
    return null;
  }

  function extractAirlineCode(cell) {
    const image = cell && cell.querySelector('img[src*="iata_" i]');
    const source = image && (image.getAttribute("src") || image.src || "");
    const match = source && source.match(/iata_([A-Z0-9]{2})\.png/i);
    return match ? match[1].toUpperCase() : "";
  }

  function parseAirport(value) {
    const text = normalizeText(value);
    const match = text.match(/^([A-Z]{3})\s*(?:[-–—]\s*)?(.*)$/i);
    return match
      ? { iata: match[1].toUpperCase(), name: normalizeText(match[2]) }
      : { iata: "", name: text };
  }

  const MONTHS = {
    jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5,
    jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10,
    nov: 11, dez: 12, dec: 12,
  };

  function parsePortalDateTime(value) {
    const text = normalizeText(value).replace(/,/g, "");
    let match = text.match(/(\d{1,2})[\s/-]+([A-Za-zÀ-ÿ]{3,})[\s/-]+(\d{4})\D+(\d{1,2}):(\d{2})/i);
    let day; let month; let year; let hour; let minute;
    if (match) {
      day = Number(match[1]);
      const monthKey = match[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 3).toLowerCase();
      month = MONTHS[monthKey];
      year = Number(match[3]); hour = Number(match[4]); minute = Number(match[5]);
    } else {
      match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})\D+(\d{1,2}):(\d{2})/);
      if (!match) return null;
      day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
      hour = Number(match[4]); minute = Number(match[5]);
    }
    if (!month || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
    const pad = (number) => String(number).padStart(2, "0");
    const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
    return { iso, ms: new Date(year, month - 1, day, hour, minute).getTime() };
  }

  function formatMinutes(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "";
    const minutes = Math.round(totalMinutes);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  function passengerKind(value) {
    const type = normalizeKey(value);
    if (/inf|bebe/.test(type)) return "infant";
    if (/chd|crianca/.test(type)) return "child";
    return "adult";
  }

  function extractStructuredReservation(doc) {
    const passengersBlock = doc.querySelector(".woo-box__passengers");
    const flightsBlock = doc.querySelector(".woo-box__flights");
    if (!passengersBlock || !flightsBlock) return null;

    const passengerResult = findStructuredTable(passengersBlock, [
      ["tipo"], ["sobrenome"], ["nome"],
    ]);
    const passengers = [];
    const passengerKeys = new Set();
    if (passengerResult) {
      const { table, map } = passengerResult;
      for (const row of table.querySelectorAll(":scope > tbody > tr")) {
        const cells = directCells(row, "td");
        if (row.classList.contains("space") || row.querySelector(":scope > td[colspan]") || cells.length < 3) continue;
        const surname = cellText(cells, map, ["sobrenome"]);
        const name = cellText(cells, map, ["nome"]);
        if (!surname || !name) continue;
        const fullName = `${surname}/${name}`.toUpperCase();
        const key = normalizeKey(fullName);
        if (passengerKeys.has(key)) continue;
        passengerKeys.add(key);
        passengers.push({ full_name: fullName, kind: passengerKind(cellText(cells, map, ["tipo"])) });
      }
    }

    const flightResult = findStructuredTable(flightsBlock, [
      ["cia"], ["voo"], ["saida"], ["chegada"], ["origem"], ["destino"],
    ]);
    if (!flightResult) return { passengers, flights: [] };

    const { table, map } = flightResult;
    const segments = [];
    const segmentKeys = new Set();
    const operatorByFlight = {};
    for (const row of table.querySelectorAll(":scope > tbody > tr")) {
      const rowText = normalizeText(row.innerText || row.textContent);
      if (row.querySelector(":scope > td[colspan]") || row.classList.contains("space")) {
        const warning = rowText.match(/voo\s+([A-Z0-9]{0,2}\s*)?(\d{2,5}).*?operad[oa]\s+pela\s+companhia\s+([A-Z0-9]{2})/i);
        if (warning) operatorByFlight[warning[2]] = warning[3].toUpperCase();
        continue;
      }
      const cells = directCells(row, "td");
      if (!cells.length || /aten[cç][aã]o|alerta/i.test(rowText)) continue;
      const ciaIndex = headerIndex(map, ["cia"]);
      const ciaCell = ciaIndex >= 0 ? cells[ciaIndex] : null;
      let airlineCode = extractAirlineCode(ciaCell);
      let number = cellText(cells, map, ["voo"]).replace(/\s+/g, " ").trim();
      const numberMatch = number.match(/(?:[A-Z0-9]{2}\s*)?(\d{2,5})/i);
      if (!numberMatch) continue;
      number = numberMatch[1];
      if (!airlineCode) {
        const combined = cellText(cells, map, ["voo"]);
        airlineCode = (combined.match(/^([A-Z0-9]{2})\s*\d/i) || [])[1] || "";
      }
      airlineCode = airlineCode.toUpperCase();
      if (!airlineCode) continue;

      const origin = parseAirport(cellText(cells, map, ["origem"]));
      const destination = parseAirport(cellText(cells, map, ["destino"]));
      const departure = parsePortalDateTime(cellText(cells, map, ["saida"]));
      const arrival = parsePortalDateTime(cellText(cells, map, ["chegada"]));
      if (!origin.iata || !destination.iata || !departure || !arrival) continue;
      const key = `${airlineCode}|${number}|${origin.iata}|${destination.iata}|${departure.iso}`;
      if (segmentKeys.has(key)) continue;
      segmentKeys.add(key);
      const duration = formatMinutes((arrival.ms - departure.ms) / 60000);
      segments.push({
        airline: airlineCode,
        airline_iata: airlineCode,
        flight_number: `${airlineCode} ${number}`,
        from_iata: origin.iata,
        from_airport: origin.name || undefined,
        to_iata: destination.iata,
        to_airport: destination.name || undefined,
        depart_at: departure.iso,
        arrive_at: arrival.iso,
        duration,
        layover: cellText(cells, map, ["dur_con", "duracao_conexao"]),
        cabin_class: cellText(cells, map, ["cabine"]),
        fare_basis: cellText(cells, map, ["base"]),
        baggage_allowance: cellText(cells, map, ["bagagem"]),
        carrier_locator: cellText(cells, map, ["loc_cia", "localizador_cia"]),
        aircraft: cellText(cells, map, ["equip", "equipamento"]),
        status: cellText(cells, map, ["status"]),
        _departureMs: departure.ms,
        _arrivalMs: arrival.ms,
        _number: number,
      });
    }

    segments.sort((a, b) => a._departureMs - b._departureMs);
    for (const segment of segments) {
      if (operatorByFlight[segment._number]) segment.operating_airline_iata = operatorByFlight[segment._number];
    }

    const journeys = [];
    let current = [];
    for (const segment of segments) {
      const previous = current[current.length - 1];
      const gapMinutes = previous ? (segment._departureMs - previous._arrivalMs) / 60000 : -1;
      const connected = previous && previous.to_iata === segment.from_iata && gapMinutes >= 0 && gapMinutes <= 1440;
      if (previous && !connected) {
        journeys.push(current);
        current = [];
      }
      current.push(segment);
    }
    if (current.length) journeys.push(current);

    const flights = journeys.map((journey, journeyIndex) => ({
      direction: journeyIndex === 0 ? "outbound" : "return",
      airline: journey[0] && journey[0].airline,
      segments: journey.map((segment, segmentIndex) => {
        const next = journey[segmentIndex + 1];
        const connectionMinutes = next ? (next._departureMs - segment._arrivalMs) / 60000 : -1;
        const connection = next && segment.to_iata === next.from_iata && connectionMinutes >= 0 && connectionMinutes <= 1440;
        const clean = { ...segment };
        delete clean._departureMs; delete clean._arrivalMs; delete clean._number;
        if (connection) {
          clean.layover = formatMinutes(connectionMinutes) || clean.layover;
          clean.layover_airport = segment.to_iata;
        } else {
          delete clean.layover;
        }
        return clean;
      }),
    }));

    return { passengers, flights };
  }

  let latestStructuredReservation = null;

  function publishStructuredReservation() {
    if (!isConsolidator) return;
    const data = extractStructuredReservation(document);
    if (!data || !data.flights.length) return;
    if (window === window.top) latestStructuredReservation = data;
    else window.top.postMessage({ __viaair: "structured-reservation", data }, "*");
  }

  function requestChildFrameData() {
    for (const frame of document.querySelectorAll("iframe,frame")) {
      try { frame.contentWindow.postMessage({ __viaair: "request-structured-reservation" }, "*"); }
      catch (e) { /* ignore */ }
    }
  }

  function extractReservationHeader(doc) {
    // Portal SkyTeam/Travellink: extrai cabeçalho explícito para a IA não
    // confundir "Ambiente" (portal) com "Cia".
    const parts = [];
    const loc = doc.querySelector("#spanLocalizador");
    if (loc) parts.push("LOCALIZADOR_RESERVA: " + (loc.innerText || loc.textContent || "").trim());
    // A tabela-cabeçalho tem THs "Localizador | Status | Data de emissão | Criação | Sistema | Ambiente | Incluido Via"
    const headerTables = doc.querySelectorAll("table.woo-table, table");
    for (const t of headerTables) {
      const ths = Array.from(t.querySelectorAll("thead th")).map((x) => (x.innerText || "").trim().toLowerCase());
      if (!ths.length) continue;
      const idxSistema = ths.findIndex((h) => h === "sistema" || h.startsWith("sistema"));
      const idxAmbiente = ths.findIndex((h) => h === "ambiente" || h.startsWith("ambiente"));
      if (idxSistema < 0 && idxAmbiente < 0) continue;
      const firstRow = t.querySelector("tbody tr");
      if (!firstRow) continue;
      const tds = firstRow.querySelectorAll("td");
      const get = (i) => i >= 0 && tds[i] ? (tds[i].innerText || "").replace(/\s+/g, " ").trim() : "";
      const sistema = get(idxSistema);
      const ambiente = get(idxAmbiente);
      if (sistema) parts.push("SISTEMA_GDS: " + sistema + " (backend do portal, NÃO é a companhia aérea)");
      if (ambiente) parts.push("AMBIENTE_PORTAL: " + ambiente + " (nome do portal/consolidador, NÃO é a companhia aérea)");
      break;
    }
    return parts.length ? "===== CABEÇALHO DA RESERVA (metadata) =====\n" + parts.join("\n") : "";
  }

  function extractFromDoc(doc) {
    if (!doc || !doc.body) return "";
    const header = extractReservationHeader(doc);
    const tablesText = extractTables(doc);
    const formValues = [];
    doc.body.querySelectorAll("input,select,textarea").forEach((el) => {
      if (!isVisible(el)) return;
      const v = el.value || el.getAttribute("value") || "";
      if (v && v.trim()) {
        const label = el.getAttribute("name") || el.getAttribute("id") || "";
        formValues.push(`${label ? label + ": " : ""}${v}`);
      }
    });
    // innerText traz apenas o conteúdo realmente exibido. textContent incluía
    // telas/templates ocultos do portal e cortava a tabela da reserva no limite.
    const bodyText = doc.body.innerText || "";
    return [header, tablesText, formValues.length ? "CAMPOS:\n" + formValues.join("\n") : "", "TEXTO VISÍVEL:\n" + bodyText]
      .filter(Boolean)
      .join("\n\n");
  }

  function walkFrames(doc, depth, out) {
    if (!doc || depth > 4) return;
    const frames = doc.querySelectorAll("iframe,frame");
    for (const f of frames) {
      try {
        const inner = f.contentDocument || (f.contentWindow && f.contentWindow.document);
        if (!inner) continue;
        const txt = extractFromDoc(inner);
        if (txt && txt.trim().length > 50) {
          out.push("===== FRAME[" + depth + "]: " + (f.src || f.name || "inline") + " =====\n" + txt);
        }
        walkFrames(inner, depth + 1, out);
      } catch (e) { /* cross-origin */ }
    }
  }

  function collectPageText() {
    // Portais ASP.NET (SkyTeam/FRT/Visual/Infotera) renderizam a reserva DENTRO
    // de <iframe> (às vezes aninhados). Percorremos recursivamente todos os
    // frames same-origin e concatenamos com o texto da página principal.
    const frameParts = [];
    walkFrames(document, 0, frameParts);
    // Na consolidadora, a página externa contém menus, filtros e exemplos de
    // pesquisa. A reserva verdadeira está no iframe/modal; enviamos somente ele.
    const parts = isConsolidator && frameParts.length
      ? frameParts
      : [extractFromDoc(document), ...frameParts];
    return parts.join("\n\n")
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Consolidadoras têm todo o conteúdo estruturado em tabelas no iframe;
  // screenshot só atrapalha (modal com scroll interno, quota do captureVisibleTab).
  const CONSOLIDATORS = new Set(["skyteam", "frt", "visualturismo", "infotera"]);
  const isConsolidator = CONSOLIDATORS.has(airline);


  function showToast(msg, kind) {
    let el = document.getElementById("viaair-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "viaair-toast";
      Object.assign(el.style, {
        position: "fixed", right: "16px", bottom: "80px", zIndex: "2147483647",
        padding: "10px 14px", borderRadius: "10px", color: "#fff",
        fontFamily: "system-ui, -apple-system, sans-serif", fontSize: "14px",
        boxShadow: "0 10px 30px rgba(0,0,0,.25)", maxWidth: "320px",
      });
      document.body.appendChild(el);
    }
    el.style.background = kind === "err" ? "#b91c1c" : (kind === "ok" ? "#15803d" : "#0f172a");
    el.textContent = msg;
    clearTimeout(el.__t);
    el.__t = setTimeout(() => { el.remove(); }, 5000);
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function captureViewport() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "viaair-capture" }, (resp) => {
        if (!resp || resp.error) resolve(null);
        else resolve(resp.dataUrl);
      });
    });
  }

  function findScrollContainer() {
    // Portais como a consolidadora abrem a reserva num modal com scroll interno
    // (a página em si não rola). Procuramos o maior elemento scrollável visível.
    let best = null;
    let bestArea = 0;
    const els = document.querySelectorAll("*");
    for (const el of els) {
      const sh = el.scrollHeight;
      const ch = el.clientHeight;
      if (sh - ch < 40 || ch < 200) continue;
      const style = getComputedStyle(el);
      const oy = style.overflowY;
      if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 300 || rect.height < 200) continue;
      const area = rect.width * rect.height;
      if (area > bestArea) { bestArea = area; best = el; }
    }
    return best;
  }

  async function captureFullPage() {
    // captureVisibleTab tem quota ~2/s → 600ms entre shots.
    const shots = [];
    const maxShots = 10;
    const container = findScrollContainer();

    const getScroll = () => container ? container.scrollTop : window.scrollY;
    const setScroll = (y) => container
      ? (container.scrollTop = y)
      : window.scrollTo({ top: y, behavior: "instant" });
    const viewH = container ? container.clientHeight : window.innerHeight;
    const totalH = container ? container.scrollHeight : document.documentElement.scrollHeight;
    const step = Math.floor(viewH * 0.85);
    const originalScroll = getScroll();

    setScroll(0);
    await sleep(500);

    for (let i = 0; i < maxShots; i++) {
      const shot = await captureViewport();
      if (shot) shots.push(shot);
      const nextY = getScroll() + step;
      const maxY = totalH - viewH;
      if (getScroll() >= maxY - 5) break;
      setScroll(nextY);
      await sleep(650);
    }
    setScroll(originalScroll);
    return shots;
  }

  async function sendImport(ctx) {
    showToast(isConsolidator ? "Lendo iframe e enviando pra Via Air…" : "Capturando tela e enviando pra Via Air…");
    try {
      if (isConsolidator) {
        publishStructuredReservation();
        requestChildFrameData();
        await sleep(600);
      }
      const structuredData = isConsolidator ? (extractStructuredReservation(document) || latestStructuredReservation) : null;
      const rawText = structuredData ? JSON.stringify(structuredData) : collectPageText();
      // Consolidadora: SÓ iframe (sem screenshot). Companhia: iframe + screenshot.
      const screenshots = isConsolidator ? [] : await captureFullPage();
      if ((!structuredData && rawText.length < 200) && screenshots.length === 0) {
        showToast("Página ainda não carregou os dados da reserva. Aguarde e tente de novo.", "err");
        return;
      }
      const res = await fetch(ctx.apiBase.replace(/\/+$/, "") + "/api/public/import-aereo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: ctx.token,
          airline_hint: airline,
          source_url: location.href,
          raw_text: rawText,
          screenshots,
          structured_data: structuredData,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map = {
          token_not_found: "Token não encontrado. Gere um novo no pedido.",
          already_consumed: "Essa reserva já foi importada.",
          token_expired: "Token expirou (2 h). Gere um novo no pedido.",
          raw_text_too_short: "Página ainda vazia. Aguarde carregar e tente de novo.",
          ai_failed: "A IA não conseguiu ler a página. Tente de novo.",
        };
        showToast(map[body.error] || ("Erro: " + (body.error || res.status)), "err");
        return;
      }
      showToast("✅ Dados enviados! Volte ao admin da Via Air pra conferir.", "ok");
    } catch (e) {
      showToast("Falha de rede: " + e.message, "err");
    }
  }

  async function ensureButton() {
    if (window !== window.top) return;
    if (document.getElementById("viaair-btn")) return;
    if (!document.body) return;

    const btn = document.createElement("button");
    btn.id = "viaair-btn";
    btn.type = "button";
    btn.textContent = "📥 Importar pra Via Air";
    Object.assign(btn.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483647",
      background: "linear-gradient(135deg,#0f172a,#1e40af)", color: "#fff",
      border: "none", borderRadius: "999px", padding: "12px 18px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "14px", fontWeight: "600", cursor: "pointer",
      boxShadow: "0 10px 30px rgba(0,0,0,.35)",
    });
    btn.onmouseenter = () => (btn.style.filter = "brightness(1.15)");
    btn.onmouseleave = () => (btn.style.filter = "none");
    btn.onclick = async () => {
      const ctx = await loadCtx();
      if (!ctx) {
        showToast("Token não encontrado. Abra o pedido no admin da Via Air e clique em 'Importar aéreo' — depois volte aqui.", "err");
        return;
      }
      sendImport(ctx);
    };
    document.body.appendChild(btn);
  }

  // O SPA das cias troca de rota sem recarregar — observamos mudanças.
  const mo = new MutationObserver(() => { ensureButton(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", ensureButton);
  window.addEventListener("popstate", ensureButton);
  setTimeout(ensureButton, 1500);
  setTimeout(ensureButton, 4000);

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message) return;
    if (message.__viaair === "structured-reservation" && window === window.top && message.data) {
      latestStructuredReservation = message.data;
    }
    if (message.__viaair === "request-structured-reservation") {
      publishStructuredReservation();
      requestChildFrameData();
    }
  });
  if (isConsolidator) {
    const dataObserver = new MutationObserver(() => publishStructuredReservation());
    dataObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(publishStructuredReservation, 500);
    setTimeout(publishStructuredReservation, 2000);
  }
})();
