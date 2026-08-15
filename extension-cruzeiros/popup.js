/* VIA AIR — Exportar Cruzeiro: UI do plugin. */
const PAINEL = "https://pedidos.viaair.tur.br/admin/cruzeiros";
let sessionToken = null;
let ocupacaoAtual = null;

const $ = (id) => document.getElementById(id);

function fmtDate(v) {
  if (!v) return "";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function ocupacaoLabel(o) {
  if (!o) return "";
  const p = (n, s, pl) => `${n} ${n === 1 ? s : pl}`;
  const parts = [];
  if (o.adults) parts.push(p(o.adults, "adulto", "adultos"));
  if (o.young) parts.push(p(o.young, "jovem", "jovens"));
  if (o.children) parts.push(p(o.children, "criança", "crianças"));
  if (o.infants) parts.push(p(o.infants, "bebê", "bebês"));
  return parts.join(" + ");
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || {})));
}

function askTab(tabId, msg) {
  return new Promise((resolve) =>
    chrome.tabs.sendMessage(tabId, msg, (r) => {
      void chrome.runtime.lastError;
      resolve(r || null);
    }),
  );
}

async function init() {
  const info = await send({ type: "viaair-cruise-active" });

  if (info.error === "no_token") {
    $("destino").className = "box warn";
    $("destino").textContent =
      "Faça login no painel VIA AIR uma vez com este navegador para parear o plugin.";
    $("painel").style.display = "block";
    return;
  }
  if (!info.active) {
    $("destino").className = "box warn";
    $("destino").textContent = "Nenhum cruzeiro está preparado para importação.";
    $("painel").style.display = "block";
    return;
  }

  sessionToken = info.session?.token || null;
  const c = info.cruise || {};
  $("destino").className = "box ok";
  $("destino").innerHTML = `
    <div class="label">Exportar para</div>
    <div><b>${c.name || ""}</b></div>
    <div>${fmtDate(c.departure_date)}${c.ship_name ? " • " + c.ship_name : ""}</div>
    <div class="muted">${c.code || ""} • capturas: ${info.session?.captures ?? 0}</div>
  `;

  const tab = await activeTab();
  const allowed =
    tab && (info.domains || []).some((d) => (tab.url || "").includes(d.domain));
  if (!allowed) {
    $("detectado").style.display = "block";
    $("detectado").className = "box warn";
    $("detectado").textContent =
      "Abra a página do cruzeiro no portal da operadora autorizado para capturar.";
    return;
  }

  const det = await askTab(tab.id, { type: "viaair-cruise-detect" });
  $("detectado").style.display = "block";
  $("detectado").innerHTML = `<div class="label">Conteúdo detectado</div>${
    det ? (det.detected || []).join(" + ") : "Recarregue a página da operadora"
  }`;

  ocupacaoAtual = det && det.occupancy ? det.occupancy : null;
  const label = ocupacaoLabel(ocupacaoAtual);
  $("ocupacao").style.display = "block";
  $("ocupacao").className = label ? "box ok" : "box warn";
  $("ocupacao").innerHTML = label
    ? `<div class="label">Ocupação na tela</div><b>${label}</b>
       <div class="muted">Alterou passageiros? Capture de novo — não é duplicidade, é outro preço.</div>`
    : "Não consegui ler a quantidade de passageiros nesta tela.";

  $("capturar").disabled = !det;
  $("capturar-preco").style.display = "block";
  $("capturar-preco").disabled = !det;
}

async function capturar(mode) {
  const tab = await activeTab();
  if (!tab) return;
  $("capturar").disabled = true;
  $("capturar-preco").disabled = true;
  $("status").textContent = mode === "price" ? "Lendo o preço desta ocupação…" : "Capturando…";

  const res = await askTab(tab.id, {
    type: "viaair-cruise-capture",
    mode,
    deep: mode !== "price",
    expectedOccupancyTotal: ocupacaoAtual ? ocupacaoAtual.total : null,
  });
  if (!res || !res.ok) {
    $("status").textContent = "Não consegui ler esta página. Recarregue e tente de novo.";
    $("capturar").disabled = false;
    $("capturar-preco").disabled = false;
    return;
  }

  const occ = res.payload?.data?.occupancy;
  const avisos = res.payload?.data?.occupancy_warnings || [];

  $("status").textContent = "Enviando…";
  const out = await send({ type: "viaair-cruise-send", payload: res.payload, sessionToken });

  if (out.error === "no_active_import") {
    $("status").textContent = "A importação foi finalizada no painel. Ative novamente.";
  } else if (out.error === "session_changed") {
    $("status").textContent = "O cruzeiro ativo mudou. Reabra o plugin.";
  } else if (out.error === "domain_not_allowed") {
    $("status").textContent = "Domínio não autorizado para captura.";
  } else if (out.error) {
    $("status").textContent = "Falha ao enviar: " + out.error;
  } else if (out.ok === false) {
    $("status").textContent = `Captura #${out.capture} recebida, mas falhou ao processar. Reprocesse no painel.`;
  } else {
    const label = ocupacaoLabel(occ);
    $("status").textContent =
      `✓ Captura #${String(out.capture).padStart(2, "0")} enviada` + (label ? ` — ${label}` : "");
  }
  if (avisos.length) {
    $("status").textContent += ` ⚠️ ${avisos[0]}`;
  }
  $("capturar").disabled = false;
  $("capturar-preco").disabled = false;
  $("capturar").textContent = "Capturar novamente";
}

$("painel").addEventListener("click", () => chrome.tabs.create({ url: PAINEL }));
$("capturar").addEventListener("click", () => capturar("full"));
$("capturar-preco").addEventListener("click", () => capturar("price"));

init();
