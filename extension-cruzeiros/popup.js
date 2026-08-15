/* VIA AIR — Exportar Cruzeiro: UI do plugin. */
const PAINEL = "https://pedidos.viaair.tur.br/admin/cruzeiros";
let sessionToken = null;

const $ = (id) => document.getElementById(id);

function fmtDate(v) {
  if (!v) return "";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
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
  $("capturar").disabled = !det;
}

$("painel").addEventListener("click", () => chrome.tabs.create({ url: PAINEL }));

$("capturar").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab) return;
  $("capturar").disabled = true;
  $("status").textContent = "Capturando…";

  const res = await askTab(tab.id, { type: "viaair-cruise-capture" });
  if (!res || !res.ok) {
    $("status").textContent = "Não consegui ler esta página. Recarregue e tente de novo.";
    $("capturar").disabled = false;
    return;
  }

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
    $("status").textContent = `✓ Captura enviada — Captura #${String(out.capture).padStart(2, "0")}`;
  }
  $("capturar").disabled = false;
  $("capturar").textContent = "Capturar novamente";
});

init();
