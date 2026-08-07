import { useEffect, useState } from "react";

type DebugSnapshot = {
  event: string;
  metrics: Array<[string, string]>;
  paintProbe: string[];
};

const numberValue = (value: number | undefined) =>
  value == null || !Number.isFinite(value) ? "n/a" : value.toFixed(1);

const rectValue = (element: Element | null, key: "top" | "bottom" | "height") => {
  if (!element) return "n/a";
  return numberValue(element.getBoundingClientRect()[key]);
};

const elementLabel = (element: Element) => {
  const htmlElement = element as HTMLElement;
  const id = htmlElement.id ? `#${htmlElement.id}` : "";
  const classes = [...htmlElement.classList].slice(0, 2).map((name) => `.${name}`).join("");
  return `${htmlElement.tagName.toLowerCase()}${id}${classes}`;
};

const paintedHierarchyAt = (x: number, y: number) => {
  const hit = document.elementFromPoint(x, y);
  if (!hit) return [`point(${numberValue(x)},${numberValue(y)}): nenhum elemento`];

  const lines = [`point(${numberValue(x)},${numberValue(y)}): ${elementLabel(hit)}`];
  let current: Element | null = hit;
  let depth = 0;
  while (current && depth < 8) {
    const style = getComputedStyle(current);
    const rect = current.getBoundingClientRect();
    lines.push(
      `${depth === 0 ? "↳" : "  "}${elementLabel(current)} bg=${style.backgroundColor} rect=${numberValue(rect.top)}..${numberValue(rect.bottom)}`,
    );
    current = current.parentElement;
    depth += 1;
  }
  return lines;
};

const readSnapshot = (event: string): DebugSnapshot => {
  const vv = window.visualViewport;
  const html = document.documentElement;
  const body = document.body;
  const appRoot = document.getElementById("root");
  const chatRoot = document.querySelector<HTMLElement>("[data-chat-root]");
  const active = document.activeElement as HTMLElement | null;
  const focusedComposer = active?.closest<HTMLElement>("[data-chat-composer]") ?? null;
  const composer = focusedComposer ?? document.querySelector<HTMLElement>("[data-chat-composer]");
  const editableFocused = !!active && (
    active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable
  );
  const htmlStyle = getComputedStyle(html);
  const bodyStyle = getComputedStyle(body);
  const chatStyle = chatRoot ? getComputedStyle(chatRoot) : null;
  const appStyle = appRoot ? getComputedStyle(appRoot) : null;
  const sampleX = Math.max(0, Math.min(window.innerWidth - 1, window.innerWidth / 2));
  const sampleY = Math.max(0, Math.min(window.innerHeight - 1, (vv?.height ?? window.innerHeight) - 2));

  return {
    event,
    metrics: [
      ["window.innerHeight", numberValue(window.innerHeight)],
      ["window.outerHeight", numberValue(window.outerHeight)],
      ["html.clientHeight", numberValue(html.clientHeight)],
      ["body.clientHeight", numberValue(body.clientHeight)],
      ["visualViewport.height", numberValue(vv?.height)],
      ["visualViewport.offsetTop", numberValue(vv?.offsetTop)],
      ["visualViewport.pageTop", numberValue(vv?.pageTop)],
      ["window.scrollY", numberValue(window.scrollY)],
      ["--chat-vh", htmlStyle.getPropertyValue("--chat-vh").trim() || "unset"],
      ["chatRoot.top", rectValue(chatRoot, "top")],
      ["chatRoot.bottom", rectValue(chatRoot, "bottom")],
      ["chatRoot.height", rectValue(chatRoot, "height")],
      ["composer.top", rectValue(composer, "top")],
      ["composer.bottom", rectValue(composer, "bottom")],
      ["composer.height", rectValue(composer, "height")],
      ["composer.paddingTop", composerStyle?.paddingTop ?? "n/a"],
      ["composer.paddingBottom", composerStyle?.paddingBottom ?? "n/a"],
      ["composer.marginBottom", composerStyle?.marginBottom ?? "n/a"],
      ["composer.minHeight", composerStyle?.minHeight ?? "n/a"],
      ["safe-area-inset-bottom", safeAreaBottom],
      ["chatRoot.position", chatStyle?.position ?? "n/a"],
      ["chatRoot.css.height", chatStyle?.height ?? "n/a"],
      ["html.css.height", htmlStyle.height],
      ["body.css.height", bodyStyle.height],
      ["screen.height", numberValue(window.screen.height)],
      ["screen.availHeight", numberValue(window.screen.availHeight)],
      ["activeElement", active?.tagName ?? "null"],
      ["editableFocused", editableFocused ? "sim" : "não"],
      ["html.bg", htmlStyle.backgroundColor],
      ["body.bg", bodyStyle.backgroundColor],
      ["#root.rect", `${rectValue(appRoot, "top")}..${rectValue(appRoot, "bottom")}`],
      ["#root.bg", appStyle?.backgroundColor ?? "n/a"],
    ],
    paintProbe: paintedHierarchyAt(sampleX, sampleY),
  };
};

export function ChatViewportDebugPanel() {
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = (event: string) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSnapshot(readSnapshot(event)));
    };
    const handlers: Array<[EventTarget, string, EventListener]> = [];
    const listen = (target: EventTarget | null, event: string) => {
      if (!target) return;
      const handler: EventListener = () => update(event);
      target.addEventListener(event, handler);
      handlers.push([target, event, handler]);
    };

    listen(window.visualViewport, "resize");
    listen(window.visualViewport, "scroll");
    listen(window, "resize");
    listen(document, "focusin");
    listen(document, "focusout");
    listen(window, "pageshow");
    listen(document, "visibilitychange");
    listen(window, "orientationchange");
    update("mount");

    return () => {
      cancelAnimationFrame(frame);
      handlers.forEach(([target, event, handler]) => target.removeEventListener(event, handler));
    };
  }, []);

  if (!snapshot) return null;

  return (
    <aside
      aria-label="Diagnóstico temporário do viewport"
      className="pointer-events-none fixed left-1 top-1 z-[9999] max-h-[48vh] w-[min(96vw,390px)] overflow-auto rounded border border-border bg-popover/95 p-2 font-mono text-[9px] leading-tight text-popover-foreground shadow-xl"
    >
      <div className="mb-1 font-bold">VIEWPORT DEBUG · {snapshot.event}</div>
      <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5">
        {snapshot.metrics.map(([label, value]) => (
          <div key={label} className="contents">
            <span>{label}</span><span className="text-right font-bold">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 border-t border-border pt-1 font-bold">PINTURA NO CENTRO INFERIOR</div>
      {snapshot.paintProbe.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
    </aside>
  );
}