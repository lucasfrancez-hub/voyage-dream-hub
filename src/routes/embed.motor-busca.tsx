/**
 * Embed público do motor de busca da Owner (befly-widget) com skin VIA AIR.
 *
 * O widget renderiza dentro de Shadow DOM aberto — a gente injeta um <style>
 * dentro do shadowRoot pra reestilizar tabs, form-fields, calendário e botão
 * sem quebrar a funcionalidade (autocomplete de IATA/cidade/hotel + datepicker
 * continuam nativos do widget). Também injetamos CSS global pros overlays
 * (autocomplete panel, datepicker) que o Angular CDK monta no <body>.
 *
 * Uso no WordPress:
 *   <iframe src="https://pedidos.viaair.tur.br/embed/motor-busca"
 *           style="width:100%;height:260px;border:0;background:transparent"
 *           loading="lazy"></iframe>
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

// Paleta VIA AIR
const BRAND = {
  bgOuter: "transparent",
  cardBg: "#0a1622",
  cardBorder: "rgba(255,255,255,0.08)",
  text: "#F1F5F9",
  textMuted: "#94A3B8",
  fieldBg: "#0f1e2c",
  fieldBorder: "rgba(255,255,255,0.12)",
  fieldBorderHover: "rgba(242,107,31,0.55)",
  primary: "#F26B1F",
  primaryHover: "#e0591a",
  primaryText: "#FFFFFF",
};

// CSS aplicado DENTRO do shadowRoot do befly-widget
const SHADOW_CSS = `
:host, .befly-widget, .search-widget, form { font-family: 'Inter','Open Sans',system-ui,sans-serif !important; }

/* Card principal */
.mat-card, .search-container, .search-form, [class*="container"] > form {
  background: ${BRAND.cardBg} !important;
  color: ${BRAND.text} !important;
  border: 1px solid ${BRAND.cardBorder} !important;
  border-radius: 20px !important;
  box-shadow: 0 12px 40px rgba(0,0,0,0.35) !important;
}

/* Tabs (Voos / Hotéis / Pacotes ...) */
.mat-tab-label, .mat-tab-link { color: ${BRAND.textMuted} !important; opacity: 1 !important; font-weight: 500 !important; }
.mat-tab-label-active, .mat-tab-link-active { color: ${BRAND.text} !important; font-weight: 600 !important; }
.mat-ink-bar, .mat-tab-header-pagination-chevron { background-color: ${BRAND.primary} !important; border-color: ${BRAND.primary} !important; }
.mat-tab-header { border-bottom-color: ${BRAND.cardBorder} !important; }
.mat-icon, mat-icon, .material-icons, .material-symbols-outlined { color: ${BRAND.text} !important; }
.mat-tab-label:not(.mat-tab-label-active) .mat-icon { color: ${BRAND.textMuted} !important; }

/* Chips secundários (Ida e volta, 1 Viajante) */
.mat-button, .mat-flat-button, .mat-stroked-button, .mat-menu-trigger {
  color: ${BRAND.text} !important;
  background: transparent !important;
  border-radius: 999px !important;
}
.mat-button:hover, .mat-stroked-button:hover { background: rgba(255,255,255,0.04) !important; }

/* Form fields (De onde / Para onde / Datas) */
.mat-form-field { color: ${BRAND.text} !important; width: 100% !important; }
.mat-form-field-appearance-outline .mat-form-field-outline,
.mat-form-field-appearance-outline .mat-form-field-outline-thick {
  color: ${BRAND.fieldBorder} !important;
}
.mat-form-field-appearance-outline.mat-focused .mat-form-field-outline-thick,
.mat-form-field-appearance-outline:hover .mat-form-field-outline-thick {
  color: ${BRAND.fieldBorderHover} !important;
}
.mat-form-field-appearance-fill .mat-form-field-flex,
.mat-form-field-appearance-standard .mat-form-field-flex {
  background: ${BRAND.fieldBg} !important;
  border-radius: 12px !important;
  border: 1px solid ${BRAND.fieldBorder} !important;
}
.mat-form-field-appearance-fill:hover .mat-form-field-flex { border-color: ${BRAND.fieldBorderHover} !important; }
.mat-form-field-underline, .mat-form-field-ripple { background-color: ${BRAND.primary} !important; }
.mat-form-field-label, .mat-form-field-required-marker { color: ${BRAND.textMuted} !important; }
.mat-focused .mat-form-field-label { color: ${BRAND.primary} !important; }
.mat-input-element, .mat-select-value, input, .mat-date-range-input-inner {
  color: ${BRAND.text} !important;
  caret-color: ${BRAND.primary} !important;
}
.mat-input-element::placeholder { color: ${BRAND.textMuted} !important; }

/* Botão BUSCAR */
.mat-raised-button, .search-button, button[type="submit"], .primary-button {
  background: ${BRAND.primary} !important;
  color: ${BRAND.primaryText} !important;
  border-radius: 14px !important;
  font-weight: 600 !important;
  letter-spacing: 0.02em !important;
  box-shadow: 0 8px 24px rgba(242,107,31,0.35) !important;
  transition: background .2s ease, transform .2s ease !important;
}
.mat-raised-button:hover, .search-button:hover, button[type="submit"]:hover {
  background: ${BRAND.primaryHover} !important;
  transform: translateY(-1px);
}

/* Divisor entre origem/destino (ícone de troca) */
.swap-button, .switch-airports, [class*="swap"] {
  background: ${BRAND.fieldBg} !important;
  border: 1px solid ${BRAND.fieldBorder} !important;
  color: ${BRAND.primary} !important;
}
`;

// CSS aplicado no <head> global (para overlays do CDK: autocomplete, datepicker, menus)
const GLOBAL_OVERLAY_CSS = `
.cdk-overlay-container .mat-autocomplete-panel,
.cdk-overlay-container .mat-menu-panel,
.cdk-overlay-container .mat-select-panel,
.cdk-overlay-container .mat-datepicker-content {
  background: ${BRAND.cardBg} !important;
  color: ${BRAND.text} !important;
  border: 1px solid ${BRAND.cardBorder} !important;
  border-radius: 14px !important;
  box-shadow: 0 20px 60px rgba(0,0,0,0.45) !important;
}
.cdk-overlay-container .mat-option, .cdk-overlay-container .mat-menu-item {
  color: ${BRAND.text} !important;
}
.cdk-overlay-container .mat-option:hover:not(.mat-option-disabled),
.cdk-overlay-container .mat-menu-item:hover:not([disabled]),
.cdk-overlay-container .mat-option.mat-active {
  background: rgba(242,107,31,0.10) !important;
}
.cdk-overlay-container .mat-option.mat-selected:not(.mat-option-multiple) {
  background: rgba(242,107,31,0.18) !important;
  color: ${BRAND.text} !important;
}
.cdk-overlay-container .mat-option-text { color: inherit !important; }

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
}
.cdk-overlay-container .mat-calendar-body-in-range::before {
  background: rgba(242,107,31,0.15) !important;
}
.cdk-overlay-container .mat-calendar-previous-button,
.cdk-overlay-container .mat-calendar-next-button,
.cdk-overlay-container .mat-calendar-period-button { color: ${BRAND.text} !important; }
`;

function EmbedMotorBusca() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Injeta CSS global pros overlays do CDK (autocomplete + datepicker vivem no <body>).
    const globalStyle = document.createElement("style");
    globalStyle.setAttribute("data-viaair-overlay", "true");
    globalStyle.textContent = GLOBAL_OVERLAY_CSS;
    document.head.appendChild(globalStyle);

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
