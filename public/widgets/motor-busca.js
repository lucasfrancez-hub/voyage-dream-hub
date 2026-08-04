/**
 * VIA AIR — Widget do motor de busca (script tag, sem mexer no layout do site).
 *
 * Uso no WordPress / Elementor (bloco HTML personalizado):
 *
 *   <div id="viaair-motor-busca"></div>
 *   <script src="https://pedidos.viaair.tur.br/widgets/motor-busca.js"
 *           data-container="viaair-motor-busca" async></script>
 *
 * Ou como web component:
 *
 *   <viaair-motor-busca></viaair-motor-busca>
 *   <script src="https://pedidos.viaair.tur.br/widgets/motor-busca.js"></script>
 *
 * Comportamento: o bloco do motor tem altura fixa (a altura real do formulário).
 * Quando o calendário / lista de origem / destino / passageiros abre, a camada do
 * motor cresce POR CIMA do conteúdo da página (overlay), sem empurrar nada,
 * sem barra de rolagem e sem cortar o painel.
 */
(function () {
  "use strict";

  var ORIGIN = (function () {
    try {
      return new URL(document.currentScript.src).origin;
    } catch (e) {
      return "https://pedidos.viaair.tur.br";
    }
  })();

  var CURRENT = document.currentScript;
  var PATH = "/embed/motor-busca";
  var Z = 2147483000;
  var MIN_H = 200;

  function readConfig(script) {
    var d = (script && script.dataset) || {};
    return {
      container: d.container || "viaair-motor-busca",
      mode: d.mode || "",
      minHeight: parseInt(d.minHeight || "", 10) || MIN_H,
    };
  }

  function buildSrc(cfg) {
    var url = ORIGIN + PATH + "?widget=1&v=" + Date.now();
    if (cfg.mode) url += "&m=" + encodeURIComponent(cfg.mode);
    return url;
  }

  function mount(host, cfg) {
    if (!host || host.getAttribute("data-viaair-mounted") === "1") return;
    host.setAttribute("data-viaair-mounted", "1");

    // Wrapper com altura FIXA (altura do formulário). Nunca cresce.
    var wrapper = document.createElement("div");
    wrapper.className = "viaair-motor-busca-wrapper";
    wrapper.style.cssText =
      "position:relative;width:100%;display:block;height:" +
      cfg.minHeight +
      "px;transition:height .12s ease;";

    // Camada do motor: absoluta, cresce por cima da página quando abre um painel.
    var layer = document.createElement("div");
    layer.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;z-index:" + Z + ";";

    var frame = document.createElement("iframe");
    frame.title = "Motor de busca VIA AIR";
    frame.setAttribute("scrolling", "no");
    frame.setAttribute("allowtransparency", "true");
    frame.setAttribute("loading", "eager");
    frame.style.cssText =
      "display:block;width:100%;height:100%;border:0;background:transparent;overflow:hidden;";
    frame.src = buildSrc(cfg);

    layer.appendChild(frame);
    wrapper.appendChild(layer);
    host.appendChild(wrapper);

    var baseHeight = cfg.minHeight;
    var overlayHeight = 0;

    function apply() {
      var base = Math.max(cfg.minHeight, Math.round(baseHeight));
      var total = Math.max(base, Math.round(overlayHeight));
      // O espaço ocupado na página é SEMPRE só o do formulário.
      wrapper.style.height = base + "px";
      // A camada (iframe) pode ser maior e sobrepor o conteúdo abaixo.
      layer.style.height = total + "px";
    }
    apply();

    window.addEventListener("message", function (event) {
      if (event.source !== frame.contentWindow) return;
      var data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "VIAAIR_EMBED_RESIZE" || data.type === "viaair-embed-height") {
        if (typeof data.height === "number" && data.height > 0) {
          baseHeight = data.height;
          apply();
        }
        return;
      }

      if (data.type === "VIAAIR_EMBED_OVERLAY") {
        overlayHeight = typeof data.height === "number" ? data.height : 0;
        apply();
        return;
      }

      if (data.type === "VIAAIR_EMBED_NAVIGATE" && typeof data.url === "string") {
        window.open(data.url, "_blank", "noopener");
      }
    });

    // Fecha painéis abertos quando a página rola muito ou muda de aba/tamanho:
    // o próprio motor reposiciona, aqui só garantimos que a camada volte ao normal.
    var reset = function () {
      frame.contentWindow &&
        frame.contentWindow.postMessage({ type: "VIAAIR_EMBED_CLOSE_FLOATING" }, "*");
    };
    window.addEventListener("orientationchange", reset);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) reset();
    });
  }

  function findHost(cfg) {
    return (
      document.getElementById(cfg.container) ||
      document.querySelector("[data-viaair-motor-busca]")
    );
  }

  function boot(script) {
    var cfg = readConfig(script);
    var host = findHost(cfg);
    if (host) {
      mount(host, cfg);
      return;
    }
    // Elementor às vezes injeta o HTML depois — observa até aparecer.
    var obs = new MutationObserver(function () {
      var el = findHost(cfg);
      if (el) {
        obs.disconnect();
        mount(el, cfg);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(function () {
      obs.disconnect();
    }, 20000);
  }

  // Web component <viaair-motor-busca></viaair-motor-busca>
  if (window.customElements && !window.customElements.get("viaair-motor-busca")) {
    window.customElements.define(
      "viaair-motor-busca",
      class extends HTMLElement {
        connectedCallback() {
          this.style.display = "block";
          this.style.width = "100%";
          mount(this, {
            container: "",
            mode: this.getAttribute("mode") || "",
            minHeight: parseInt(this.getAttribute("min-height") || "", 10) || MIN_H,
          });
        }
      },
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot(CURRENT);
    });
  } else {
    boot(CURRENT);
  }
})();
