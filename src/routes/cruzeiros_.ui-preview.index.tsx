import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FlaskConical } from "lucide-react";
import { screens, type ModelKey } from "@/components/cruise-preview/registry";

export const Route = createFileRoute("/cruzeiros_/ui-preview/")({
  head: () => ({
    meta: [
      { title: "Estudo de Interface — Cruzeiros VIA AIR" },
      { name: "description", content: "Ambiente interno de protótipos clicáveis das telas do módulo de Cruzeiros da VIA AIR." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Estudo de Interface — Cruzeiros VIA AIR" },
      { property: "og:description", content: "Protótipos navegáveis A/B/C para cada tela do módulo de Cruzeiros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Central,
});

const letras: ModelKey[] = ["a", "b", "c"];

function Central() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-[oklch(0.13_0.02_235)]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
            <FlaskConical className="h-3.5 w-3.5" />Ambiente de estudo — dados fictícios
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">Cruzeiros — Estudo de Interface</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Três propostas clicáveis para cada tela do módulo. Nada aqui altera o sistema em produção: rotas, banco,
            componentes e plugin permanecem intactos. Escolha tela por tela o modelo preferido.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Dentro de cada preview há uma barra com <b>A / B / C</b> e alternância <b>Desktop / Tablet / Mobile</b>.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="space-y-8">
          {screens.map((s) => (
            <section key={s.slug}>
              <div className="mb-3 flex items-baseline gap-3 border-b border-border pb-2">
                <span className="text-xs font-bold text-primary">{s.ordem}</span>
                <h2 className="text-xl font-bold">{s.titulo}</h2>
                <span className="hidden text-xs text-muted-foreground sm:inline">{s.descricao}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {letras.map((m) => {
                  const mod = s.modelos[m];
                  return (
                    <Link key={m} to="/cruzeiros/ui-preview/$screen/$model" params={{ screen: s.slug, model: m }}
                      className="group rounded-2xl border border-border bg-card/60 p-5 transition hover:-translate-y-0.5 hover:border-primary/60">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
                          {m.toUpperCase()}
                        </span>
                        <span className="text-sm font-bold">{mod.nome}</span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{mod.resumo}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        Ver preview <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
