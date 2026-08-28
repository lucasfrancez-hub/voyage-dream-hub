import { createFileRoute } from "@tanstack/react-router";
import formHtml from "@/lib/visto/ds160.html?raw";

/**
 * Página pública do formulário de apoio ao DS-160 (visto americano).
 * O HTML é servido exatamente como recebido; apenas um script de
 * persistência no servidor é anexado no fim do documento.
 */
const BOOTSTRAP = `
<script>
(function () {
  var token = location.pathname.split("/").filter(Boolean).pop();
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

  fetch(api)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.formData || !d.formData.fields) return;
      try { localStorage.setItem(KEY, JSON.stringify(d.formData)); } catch (e) {}
      if (typeof restore === "function") restore();
      if (typeof go === "function") go(typeof current === "number" ? current : 0);
    })
    .catch(function () {});
})();
</script>
`;

export const Route = createFileRoute("/visto-americano/$token")({
  server: {
    handlers: {
      GET: () =>
        new Response(formHtml.replace("</body>", `${BOOTSTRAP}</body>`), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        }),
    },
  },
});
