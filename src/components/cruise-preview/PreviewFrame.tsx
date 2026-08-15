import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Monitor, Tablet, Smartphone } from "lucide-react";
import { FakeTopBar, cx } from "./kit";
import { getScreen, type ModelKey } from "./registry";

const larguras = { desktop: "100%", tablet: "834px", mobile: "390px" } as const;
type VP = keyof typeof larguras;

export function PreviewFrame({ slug, modelo }: { slug: string; modelo: ModelKey }) {
  const [vp, setVp] = React.useState<VP>("desktop");
  const screen = getScreen(slug);
  if (!screen) return <div className="p-10 text-center text-muted-foreground">Tela não encontrada.</div>;
  const Comp = screen.modelos[modelo].Comp;

  return (
    <div className="min-h-screen bg-[oklch(0.11_0.02_235)]">
      {/* barra exclusiva do ambiente de preview — não faz parte da interface final */}
      <div className="sticky top-0 z-[70] border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5">
          <Link to="/cruzeiros/ui-preview" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" />Voltar aos modelos
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Tela: <b className="text-foreground">{screen.ordem}. {screen.titulo}</b>
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {(["a", "b", "c"] as ModelKey[]).map((m) => (
              <Link key={m} to="/cruzeiros/ui-preview/$screen/$model" params={{ screen: slug, model: m }}
                className={cx("h-8 w-8 rounded-lg text-center text-xs font-bold leading-8 transition",
                  m === modelo ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground")}>
                {m.toUpperCase()}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([k, I]) => (
              <button key={k} onClick={() => setVp(k)} title={k}
                className={cx("rounded-md p-1.5 transition", vp === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <I className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-border bg-accent/20 px-4 py-1.5 text-center text-[11px] text-muted-foreground">
          Modelo {modelo.toUpperCase()} — {screen.modelos[modelo].nome}: {screen.modelos[modelo].resumo}
        </div>
      </div>

      <div className="flex justify-center py-5">
        <div
          style={{ width: larguras[vp], maxWidth: "100%" }}
          className={cx(
            "relative min-h-[720px] overflow-hidden bg-background text-foreground transition-all duration-300",
            vp === "desktop" ? "w-full" : "rounded-[28px] border border-border shadow-2xl",
          )}
        >
          <FakeTopBar />
          <Comp />
        </div>
      </div>
    </div>
  );
}
