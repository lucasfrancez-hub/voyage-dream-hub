/* VIA AIR — Exportar Cruzeiro: botão flutuante na própria página da operadora.
 *
 * Fluxo pedido: ao abrir a URL do cruzeiro, o plugin aparece na tela mostrando
 * para qual cruzeiro vai exportar. Cada take é enviado por um clique; depois do
 * primeiro, o balão fica em "aguardando o próximo" com dois caminhos:
 * "Capturar próximo" ou "Finalizar importação".
 */
(function () {
  if (window.__viaairCruiseFab) return;
  window.__viaairCruiseFab = true;

  const state = { active: false, cruise: null, session: null, captures: 0, busy: false, open: true };
  let root = null;
  let shadow = null;

  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          void chrome.runtime.lastError;
          resolve(r || {});
        });
      } catch (_) {
        resolve({});
      }
    });

  function fmtDate(v) {
    if (!v) return "";
    const [y, m, d] = String(v).slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }

  const CSS = `
  :host { all: initial; }
  .wrap { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
    font-family: -apple-system, system-ui, "Segoe UI", sans-serif; color: #0f172a; }
  .card { width: 292px; background: #fff; border-radius: 16px; overflow: hidden;
    box-shadow: 0 18px 48px rgba(15,23,42,.28); border: 1px solid #e2e8f0; }
  .head { display: flex; align-items: center; gap: 8px; padding: 11px 12px;
    background: linear-gradient(135deg, #F26B1F, #d9541a); color: #fff; }
  .head b { font-size: 12.5px; letter-spacing: .02em; }
  .head .x { margin-left: auto; cursor: pointer; opacity: .85; font-size: 15px; line-height: 1; }
  .body { padding: 12px; font-size: 12.5px; line-height: 1.5; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
  .name { font-weight: 700; margin-top: 2px; }
  .muted { color: #64748b; }
  .pill { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 4px 9px;
    border-radius: 999px; font-size: 11px; font-weight: 600; background: #f1f5f9; color: #334155; }
  .pill.ok { background: #dcfce7; color: #166534; }
  .pill.warn { background: #ffedd5; color: #9a3412; }
  button { width: 100%; margin-top: 9px; padding: 10px; border: 0; border-radius: 11px;
    font-size: 12.5px; font-weight: 700; cursor: pointer; background: #F26B1F; color: #fff; }
  button.ghost { background: #0f172a; }
  button.soft { background: #f1f5f9; color: #334155; }
  button:disabled { opacity: .55; cursor: default; }
  .mini { display: flex; gap: 8px; }
  .mini button { margin-top: 9px; }
  .bubble { width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(135deg,#F26B1F,#d9541a);
    color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px;
    box-shadow: 0 12px 30px rgba(242,107,31,.45); cursor: pointer; text-align: center; line-height: 1.1; }
  .status { margin-top: 8px; font-size: 11.5px; min-height: 15px; }
  `;

  function mount() {
    root = document.createElement("div");
    root.id = "viaair-cruise-fab";
    shadow = root.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.append(style, document.createElement("div"));
    document.documentElement.appendChild(root);
  }

  function render(status, tone) {
    if (!shadow) return;
    const host = shadow.lastElementChild;
    if (!state.active) {
      // Sem importação ativa o balão continua na tela (antes ele sumia e
      // parecia que o plugin não tinha carregado no site da operadora).
      if (!state.open) {
        host.innerHTML = `<div class="wrap"><div class="bubble" id="abrir">VIA<br/>AIR</div></div>`;
        host.querySelector("#abrir").onclick = () => {
          state.open = true;
          render();
        };
        return;
      }
      host.innerHTML = `
        <div class="wrap"><div class="card">
          <div class="head"><b>VIA AIR — Exportar Cruzeiro</b><span class="x" id="fechar">✕</span></div>
          <div class="body">
            <div class="pill">Pronto para capturar</div>
            <div class="muted" style="margin-top:8px">
              Não precisa criar o cruzeiro antes: nome, data e navio vêm da própria captura.
              Para enviar a um cruzeiro já existente, ative a importação no painel e clique em verificar.
            </div>
            <button id="capturar" ${state.busy ? "disabled" : ""}>${
              state.busy ? "Capturando…" : "Capturar e criar cruzeiro"
            }</button>
            <div class="mini">
              <button class="ghost" id="verificar" ${state.busy ? "disabled" : ""}>${
                state.busy ? "Verificando…" : "Verificar importação ativa"
              }</button>
            </div>
            <div class="status" style="color:${tone === "erro" ? "#b91c1c" : "#64748b"}">${status || ""}</div>
          </div>
        </div></div>`;
      host.querySelector("#fechar").onclick = () => {
        state.open = false;
        render();
      };
      host.querySelector("#capturar").onclick = () => capturar("full");
      host.querySelector("#verificar").onclick = async () => {
        state.busy = true;
        render("Consultando o painel…");
        await refresh();
        state.busy = false;
        render(state.active ? "" : "Nenhum cruzeiro ativo — a captura vai criar um novo.", "");
      };
      return;
    }
    if (!state.open) {
      host.innerHTML = `<div class="wrap"><div class="bubble" id="abrir">VIA<br/>AIR</div></div>`;
      host.querySelector("#abrir").onclick = () => {
        state.open = true;
        render();
      };
      return;
    }
    const c = state.cruise || {};
    const primeira = state.captures === 0;
    host.innerHTML = `
      <div class="wrap"><div class="card">
        <div class="head"><b>VIA AIR — Exportar Cruzeiro</b><span class="x" id="fechar">✕</span></div>
        <div class="body">
          <div class="label">Exportando para</div>
          <div class="name">${c.name || ""}</div>
          <div class="muted">${fmtDate(c.departure_date)}${c.ship_name ? " • " + c.ship_name : ""}</div>
          <div class="pill ${state.captures ? "ok" : ""}">${
            state.captures
              ? `${String(state.captures).padStart(2, "0")} take(s) enviado(s) • aguardando o próximo`
              : "Nenhum take enviado ainda"
          }</div>
          <button id="capturar" ${state.busy ? "disabled" : ""}>${
            state.busy ? "Capturando…" : primeira ? "Capturar este take" : "Capturar próximo take"
          }</button>
          ${
            state.captures
              ? `<div class="mini">
                   <button class="soft" id="preco" ${state.busy ? "disabled" : ""}>Só o preço</button>
                   <button class="ghost" id="finalizar" ${state.busy ? "disabled" : ""}>Finalizar</button>
                 </div>`
              : ""
          }
          <div class="status ${tone === "warn" ? "muted" : ""}" style="color:${
            tone === "erro" ? "#b91c1c" : tone === "ok" ? "#166534" : "#64748b"
          }">${status || (state.captures ? "Mude a cabine ou os passageiros e capture de novo." : "")}</div>
        </div>
      </div></div>`;

    host.querySelector("#fechar").onclick = () => {
      state.open = false;
      render();
    };
    host.querySelector("#capturar").onclick = () => capturar("full");
    const preco = host.querySelector("#preco");
    if (preco) preco.onclick = () => capturar("price");
    const fim = host.querySelector("#finalizar");
    if (fim) fim.onclick = finalizar;
  }

  async function capturar(mode) {
    state.busy = true;
    render(mode === "price" ? "Lendo o preço desta ocupação…" : "Lendo a página…");
    let res = null;
    try {
      res = await window.__viaairCruiseCapture({ mode, deep: mode !== "price" });
    } catch (e) {
      res = { ok: false, error: String((e && e.message) || e) };
    }
    if (!res || !res.ok) {
      state.busy = false;
      render("Não consegui ler esta tela. Recarregue e tente de novo.", "erro");
      return;
    }
    render("Enviando take…");
    const out = await send({
      type: "viaair-cruise-send",
      payload: res.payload,
      sessionToken: state.session ? state.session.token : null,
    });
    state.busy = false;

    if (out.error === "no_active_import") {
      state.active = false;
      render("A importação foi finalizada no painel. Capture de novo para criar um cruzeiro.", "erro");
      return;
    }
    if (out.error === "session_changed") {
      await refresh();
      render("O cruzeiro ativo mudou no painel. Confira e capture de novo.", "erro");
      return;
    }
    if (out.error) {
      render("Falha ao enviar: " + out.error, "erro");
      return;
    }
    if (out.auto_created || !state.active) {
      // O cruzeiro nasceu da própria captura: sincroniza o balão com a sessão nova.
      await refresh();
    }
    state.captures = out.capture || state.captures + 1;
    const occ = res.payload && res.payload.data ? res.payload.data.occupancy : null;
    const pax = occ ? (occ.adults || 0) + (occ.young || 0) + (occ.children || 0) + (occ.infants || 0) : 0;
    render(
      out.ok === false
        ? `Take #${String(state.captures).padStart(2, "0")} recebido, mas falhou ao processar.`
        : (out.auto_created ? "✓ Cruzeiro criado automaticamente. " : "") + `Take #${String(state.captures).padStart(2, "0")} enviado${pax ? ` (${pax} pax)` : ""}. Aguardando o próximo.`,
      out.ok === false ? "erro" : "ok",
    );
  }

  async function finalizar() {
    state.busy = true;
    render("Finalizando importação…");
    const out = await send({ type: "viaair-cruise-finish" });
    state.busy = false;
    if (out.error && out.error !== "no_active_import") {
      render("Não consegui finalizar: " + out.error, "erro");
      return;
    }
    state.active = false;
    render();
  }

  async function refresh() {
    const info = await send({ type: "viaair-cruise-active" });
    state.active = Boolean(info && info.active);
    state.cruise = (info && info.cruise) || null;
    state.session = (info && info.session) || null;
    state.captures = (info && info.session && info.session.captures) || 0;
  }

  async function boot() {
    await refresh();
    // Sempre monta: o balão precisa aparecer no site da operadora mesmo antes
    // de existir importação ativa, senão parece que o plugin não carregou.
    if (!root) mount();
    render();
  }

  // Reconsulta o painel de tempo em tempo: ativar a importação em outra aba
  // passa a refletir aqui sozinho.
  setInterval(async () => {
    if (state.busy) return;
    const antes = state.active;
    await refresh();
    if (antes !== state.active) render();
  }, 20000);

  // Reagir quando a importação é ativada/finalizada no painel enquanto a aba está aberta.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "viaair-cruise-refresh-fab") boot();
  });

  if (document.readyState === "complete") setTimeout(boot, 800);
  else window.addEventListener("load", () => setTimeout(boot, 800));
})();
