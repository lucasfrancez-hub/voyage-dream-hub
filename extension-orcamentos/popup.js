function refresh() {
  chrome.runtime.sendMessage({ type: "viaair-quotes-status" }, (res) => {
    if (!res) return;
    document.getElementById("state").textContent = res.connected ? "Conectado" : "Token não configurado";
    document.getElementById("dot").className = "dot" + (res.connected ? "" : " off");
    document.getElementById("pending").textContent = String(res.pending || 0);
    document.getElementById("last").textContent = res.last
      ? `${res.last.label || "Orçamento"} — ${res.last.result || ""}`
      : "—";
  });
}

document.getElementById("save").addEventListener("click", () => {
  const token = document.getElementById("token").value;
  chrome.runtime.sendMessage({ type: "viaair-quotes-set-token", token }, () => {
    document.getElementById("token").value = "";
    refresh();
  });
});

refresh();
