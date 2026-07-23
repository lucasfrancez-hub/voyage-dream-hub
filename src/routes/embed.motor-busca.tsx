/**
 * Embed público do motor de busca da Owner (befly-widget) com skin VIA AIR.
 * Estilo V3 — Individual Pills: abas como pills flutuantes (sem trilho),
 * campos com underline (sem caixa), sem "brilho" ao redor dos botões.
 * Também trunca as opções do autocomplete pra mostrar só a cidade principal
 * (ex.: "São Paulo, SP, Congonhas" → "São Paulo").
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/embed/motor-busca")({
  head: () => ({
    meta: [
      { title: "Motor de busca · VIA AIR" },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://static.onertravel.com/widget/search/production/styles.css",
      },
    ],
    scripts: [
      {
        src: "https://static.onertravel.com/widget/search/production/widget-befly.js",
        type: "text/javascript",
        async: true,
      },
    ],
  }),
  component: EmbedMotorBusca,
  ssr: false,
});

// Paleta VIA AIR — Deep Blue Glass (V3)
const BRAND = {
  bgOuter: "transparent",
  cardBg: "rgba(10, 22, 44, 0.72)",
  text: "#F8FAFC",
  textMuted: "#B8C5DB",
  fieldUnderline: "rgba(255,255,255,0.18)",
  fieldUnderlineHover: "rgba(255,255,255,0.35)",
  primary: "#F26B1F",
  primaryHover: "#e0591a",
  primaryText: "#FFFFFF",
};

// CSS aplicado DENTRO do shadowRoot do befly-widget
const SHADOW_CSS = `
:host, .befly-widget, .search-widget, form { font-family: 'Inter','Open Sans',system-ui,sans-serif !important; }

/* Esconde bloco de "Não autorizado" (dev/preview) */
.unauthorized, .not-authorized, [class*="unauthorized"], [class*="notAuthorized"] { display: none !important; }

/* Card principal — vidro azul, sem borda, sem sombras duras */
.mat-card, .search-container, .search-form, [class*="container"] > form {
  background: ${BRAND.cardBg} !important;
  color: ${BRAND.text} !important;
  border: 0 !important;
  border-radius: 22px !important;
  box-shadow: 0 20px 60px rgba(0,0,0,0.35) !important;
  backdrop-filter: blur(18px) saturate(140%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(140%) !important;
}

/* Abas — pills individuais flutuantes, sem trilho de fundo */
.mat-tab-header, .mat-tab-nav-bar {
  border-bottom-color: transparent !important;
  background: transparent !important;
  padding: 0 !important;
  display: inline-flex !important;
  width: auto !important;
}
.mat-tab-labels, .mat-tab-links { gap: 8px !important; }

.mat-tab-label, .mat-tab-link {
  color: ${BRAND.textMuted} !important;
  opacity: 1 !important;
  font-weight: 500 !important;
  border-radius: 999px !important;
  min-width: 0 !important;
  padding: 0 18px !important;
  height: 38px !important;
  margin: 0 !important;
  background: transparent !important;
  transition: background .2s ease, color .2s ease !important;
}
.mat-tab-label:hover:not(.mat-tab-label-active) { background: rgba(255,255,255,0.06) !important; color: ${BRAND.text} !important; }
.mat-tab-label-active, .mat-tab-link-active {
  color: #FFFFFF !important;
  background: ${BRAND.primary} !important;
  font-weight: 600 !important;
  box-shadow: none !important;
}
.mat-ink-bar { background-color: transparent !important; height: 0 !important; }
.mat-icon, mat-icon, .material-icons, .material-symbols-outlined { color: ${BRAND.text} !important; }
.mat-tab-label:not(.mat-tab-label-active) .mat-icon { color: ${BRAND.textMuted} !important; }
.mat-tab-label-active .mat-icon, .mat-tab-link-active .mat-icon { color: #FFFFFF !important; }

/* Chips secundários (Ida e volta, 1 Viajante) — pills sem brilho */
.mat-button, .mat-flat-button, .mat-stroked-button, .mat-menu-trigger {
  color: ${BRAND.text} !important;
  background: transparent !important;
  border-radius: 999px !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
.mat-button:hover, .mat-stroked-button:hover, .mat-menu-trigger:hover {
  background: rgba(255,255,255,0.06) !important;
}
.mat-button[aria-pressed="true"], .mat-flat-button[aria-pressed="true"],
.mat-stroked-button.mat-accent, .mat-flat-button.mat-accent, .mat-button.mat-accent,
.mat-button-toggle-checked, .mat-button-toggle-checked .mat-button-toggle-label-content {
  background: ${BRAND.primary} !important;
  color: #FFFFFF !important;
  box-shadow: none !important;
}

/* Form fields — underline (sem caixa) */
.mat-form-field { color: ${BRAND.text} !important; width: 100% !important; }

/* Remove outlines de outline-appearance */
.mat-form-field-appearance-outline .mat-form-field-outline,
.mat-form-field-appearance-outline .mat-form-field-outline-thick {
  color: transparent !important;
}
/* Remove backgrounds de fill/standard-appearance */
.mat-form-field-appearance-fill .mat-form-field-flex,
.mat-form-field-appearance-standard .mat-form-field-flex {
  background: transparent !important;
  border-radius: 0 !important;
  border: 0 !important;
  padding: 0 !important;
}
/* Underline sutil por baixo do input */
.mat-form-field-wrapper { padding-bottom: 0 !important; }
.mat-form-field-infix {
  border-bottom: 1px solid ${BRAND.fieldUnderline} !important;
  padding: 8px 0 8px 0 !important;
  transition: border-color .2s ease !important;
}
.mat-form-field:hover .mat-form-field-infix { border-bottom-color: ${BRAND.fieldUnderlineHover} !important; }
.mat-focused .mat-form-field-infix { border-bottom-color: ${BRAND.primary} !important; }
.mat-form-field-underline, .mat-form-field-ripple { background-color: transparent !important; }

.mat-form-field-label, .mat-form-field-required-marker { color: ${BRAND.textMuted} !important; }
.mat-focused .mat-form-field-label { color: ${BRAND.primary} !important; }
.mat-input-element, .mat-select-value, input, .mat-date-range-input-inner {
  color: ${BRAND.text} !important;
  caret-color: ${BRAND.primary} !important;
}
.mat-input-element::placeholder { color: ${BRAND.textMuted} !important; }

/* Botão BUSCAR — sem brilho, só cor sólida */
.mat-raised-button, .search-button, button[type="submit"], .primary-button {
  background: ${BRAND.primary} !important;
  color: ${BRAND.primaryText} !important;
  border-radius: 14px !important;
  font-weight: 700 !important;
  letter-spacing: 0.03em !important;
  text-transform: uppercase !important;
  box-shadow: none !important;
  transition: background .2s ease !important;
}
.mat-raised-button:hover, .search-button:hover, button[type="submit"]:hover {
  background: ${BRAND.primaryHover} !important;
  box-shadow: none !important;
}

/* Divisor entre origem/destino (ícone de troca) */
.swap-button, .switch-airports, [class*="swap"] {
  background: transparent !important;
  border: 0 !important;
  color: ${BRAND.primary} !important;
  box-shadow: none !important;
}
`;

// CSS aplicado no <head> global (para overlays do CDK: autocomplete, datepicker, menus)
const GLOBAL_OVERLAY_CSS = `
.cdk-overlay-container .mat-autocomplete-panel,
.cdk-overlay-container .mat-menu-panel,
.cdk-overlay-container .mat-select-panel,
.cdk-overlay-container .mat-datepicker-content {
  background: rgba(10,22,44,0.92) !important;
  color: ${BRAND.text} !important;
  border: 1px solid rgba(255,255,255,0.06) !important;
  border-radius: 14px !important;
  box-shadow: 0 20px 60px rgba(0,0,0,0.45) !important;
  backdrop-filter: blur(18px) saturate(140%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(140%) !important;
}
.cdk-overlay-container .mat-option, .cdk-overlay-container .mat-menu-item {
  color: ${BRAND.text} !important;
}
.cdk-overlay-container .mat-option:hover:not(.mat-option-disabled),
.cdk-overlay-container .mat-menu-item:hover:not([disabled]),
.cdk-overlay-container .mat-option.mat-active {
  background: rgba(242,107,31,0.12) !important;
}
.cdk-overlay-container .mat-option.mat-selected:not(.mat-option-multiple) {
  background: rgba(242,107,31,0.22) !important;
  color: #FFFFFF !important;
}
.cdk-overlay-container .mat-option-text { color: inherit !important; }

/* Trunca visualmente o texto da opção pra manter compacto */
.cdk-overlay-container .mat-option-text {
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

/* Calendário */
.cdk-overlay-container .mat-calendar { color: ${BRAND.text} !important; }
.cdk-overlay-container .mat-calendar-arrow { fill: ${BRAND.text} !important; }
.cdk-overlay-container .mat-calendar-body-label,
.cdk-overlay-container .mat-calendar-table-header th { color: ${BRAND.textMuted} !important; }
.cdk-overlay-container .mat-calendar-body-cell-content { color: ${BRAND.text} !important; border-color: transparent !important; }
.cdk-overlay-container .mat-calendar-body-today:not(.mat-calendar-body-selected) {
  border-color: ${BRAND.primary} !important;
}
.cdk-overlay-container .mat-calendar-body-selected {
  background: ${BRAND.primary} !important;
  color: ${BRAND.primaryText} !important;
  box-shadow: none !important;
}
.cdk-overlay-container .mat-calendar-body-in-range::before {
  background: rgba(242,107,31,0.18) !important;
}
.cdk-overlay-container .mat-calendar-previous-button,
.cdk-overlay-container .mat-calendar-next-button,
.cdk-overlay-container .mat-calendar-period-button { color: ${BRAND.text} !important; }
`;

/**
 * Reduz o texto da opção pra primeira parte antes da vírgula/hífen.
 * Ex: "São Paulo, SP, Congonhas (CGH)" → "São Paulo"
 *     "Rio de Janeiro - Galeão (GIG)"  → "Rio de Janeiro"
 * Mantém código IATA entre parênteses se aparecer.
 */
function shortenOptionText(raw: string): string {
  const text = raw.trim();
  if (!text) return text;
  const iataMatch = text.match(/\(([A-Z]{3})\)/);
  const firstSegment = text.split(/[,·\-–—]/)[0].trim();
  return iataMatch ? `${firstSegment} (${iataMatch[1]})` : firstSegment;
}

function EmbedMotorBusca() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // CSS global pros overlays do CDK.
    const globalStyle = document.createElement("style");
    globalStyle.setAttribute("data-viaair-overlay", "true");
    globalStyle.textContent = GLOBAL_OVERLAY_CSS;
    document.head.appendChild(globalStyle);

    // Observer que encurta o texto das opções do autocomplete quando aparecem.
    const optionObserver = new MutationObserver(() => {
      document
        .querySelectorAll<HTMLElement>(
          ".cdk-overlay-container .mat-option-text:not([data-viaair-shortened])",
        )
        .forEach((node) => {
          const original = node.textContent || "";
          const short = shortenOptionText(original);
          if (short && short !== original) {
            node.setAttribute("title", original);
            node.textContent = short;
          }
          node.setAttribute("data-viaair-shortened", "1");
        });
    });
    optionObserver.observe(document.body, { childList: true, subtree: true });

    // Observa o befly-widget até o shadowRoot existir, injeta o CSS uma vez.
    let stopped = false;
    let injected = false;
    const inject = () => {
      if (stopped || injected) return;
      const el = hostRef.current?.querySelector("befly-widget") as HTMLElement | null;
      const root = (el as any)?.shadowRoot as ShadowRoot | null;
      if (!root) return;
      if (root.querySelector('style[data-viaair-skin="1"]')) {
        injected = true;
        return;
      }
      const style = document.createElement("style");
      style.setAttribute("data-viaair-skin", "1");
      style.textContent = SHADOW_CSS;
      root.appendChild(style);
      injected = true;
    };

    const interval = window.setInterval(inject, 200);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 15000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      optionObserver.disconnect();
      globalStyle.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{ background: BRAND.bgOuter, padding: 0, margin: 0 }}
      className="w-full"
    >
      <style>{`html,body,#root{background:transparent !important;margin:0;padding:0;}`}</style>
      {/* @ts-expect-error web component customizado da Owner */}
      <befly-widget language="pt-br" new-tab="true"></befly-widget>
    </div>
  );
}
