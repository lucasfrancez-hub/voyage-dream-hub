import { useEffect, useRef } from "react";

const WIDGET_SRC = "https://static.onertravel.com/widget/search/production/widget-befly.js";

export function FlightSearchWidget() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (document.querySelector(`script[src="${WIDGET_SRC}"]`)) return;
    const s = document.createElement("script");
    s.src = WIDGET_SRC;
    s.async = true;
    document.body.appendChild(s);
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full"
      dangerouslySetInnerHTML={{
        __html: `<div id="wrapper"><befly-widget language="pt-br" new-tab="true"></befly-widget></div>`,
      }}
    />
  );
}
