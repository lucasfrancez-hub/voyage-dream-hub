import { createFileRoute } from "@tanstack/react-router";
import formHtml from "@/lib/visto/ds160.html?raw";

/**
 * Documento bruto do formulário DS-160 (renderizado dentro da página pública
 * /visto-americano/$token, que traz o cabeçalho e rodapé da VIA AIR).
 * O HTML original é preservado; apenas escondemos o cabeçalho interno e
 * anexamos o script de persistência + auto-altura.
 */
const BOOTSTRAP = `
<style>header.topbar{display:none!important}body{background:transparent}</style>
<script>
(function () {
  var parts = location.pathname.split("/").filter(Boolean);
  var token = parts[parts.length - 2];
  var api = "/api/public/visto/" + token;
  var KEY = "viaair-ds160-demo";
  var timer = null;

  function push() {
    if (typeof serialize !== "function") return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      try {
        fetch(api, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ formData: serialize() }),
        }).catch(function () {});
      } catch (e) {}
    }, 900);
  }

  document.addEventListener("input", push);
  document.addEventListener("change", push);
  document.addEventListener("click", function (e) {
    if (e.target.closest(".seg,.switch,[data-add],[data-remove]")) push();
  });

  function sendHeight() {
    try {
      var h = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      parent.postMessage({ type: "viaair-visto-height", height: h }, "*");
    } catch (e) {}
  }
  setInterval(sendHeight, 400);
  window.addEventListener("load", sendHeight);
  document.addEventListener("click", function () { setTimeout(sendHeight, 60); });

  fetch(api)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.formData || !d.formData.fields) return;
      try { localStorage.setItem(KEY, JSON.stringify(d.formData)); } catch (e) {}
      if (typeof restore === "function") restore();
      if (typeof go === "function") go(typeof current === "number" ? current : 0);
      sendHeight();
    })
    .catch(function () {});
})();
</script>
`;

export const Route = createFileRoute("/visto-americano/$token/form")({
  server: {
    handlers: {
      GET: () =>
        new Response(formHtml.replace("</body>", `${BOOTSTRAP}</body>`), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
