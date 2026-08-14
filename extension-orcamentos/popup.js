function refresh() {
  chrome.runtime.sendMessage({ type: "viaair-quotes-status" }, (res) => {
    if (!res) return;
    const state = document.getElementById("state");
    state.textContent = res.connected
      ? "Conectado"
      : res.tokenInvalid
        ? "Token inválido ou revogado — gere um novo"
        : "Token não configurado";
    document.getElementById("dot").className = "dot" + (res.connected ? "" : " off");
    document.getElementById("pending").textContent = String(res.pending || 0);
    document.getElementById("last").textContent = res.last
      ? `${res.last.label || "Orçamento"} — ${res.last.result || ""}`
      : "—";
  });
}

document.getElementById("save").addEventListener("click", () => {
  const btn = document.getElementById("save");
  const state = document.getElementById("state");
  const token = document.getElementById("token").value;
  btn.disabled = true;
  state.textContent = "Validando token…";
  chrome.runtime.sendMessage({ type: "viaair-quotes-set-token", token }, (res) => {
    btn.disabled = false;
    if (res && res.ok) {
      document.getElementById("token").value = "";
    } else {
      state.textContent = "Token recusado pela Via Air — gere um novo";
      document.getElementById("dot").className = "dot off";
      return;
    }
    refresh();
  });
});

refresh();
