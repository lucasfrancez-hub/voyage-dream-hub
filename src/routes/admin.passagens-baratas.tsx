/**
 * Passagens aéreas baratas — navegação igual à do Melhores Destinos:
 * região → país → destino → origem → datas, tudo automático e com o link
 * do nosso motor (Comprar Viagem) no lugar do parceiro.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Copy, ExternalLink, Loader2, Plane, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { explorarPassagensMd } from "@/lib/melhores-destinos.functions";

export const Route = createFileRoute("/admin/passagens-baratas")({
  component: PassagensBaratasPage,
});

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

type Step = {
  label: string;
  categoryId?: number;
  toIata?: string;
  fromIata?: string;
  month?: string;
};

function PassagensBaratasPage() {
  const explorar = useServerFn(explorarPassagensMd);
  const [trail, setTrail] = useState<Step[]>([{ label: "Passagens baratas" }]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://pedidos.viaair.tur.br";
  const current = trail[trail.length - 1];

  const q = useQuery({
    queryKey: ["md-explorar", current],
    queryFn: () =>
      explorar({
        data: {
          base: origin,
          ...(current.categoryId ? { categoryId: current.categoryId } : {}),
          ...(current.toIata ? { toIata: current.toIata } : {}),
          ...(current.fromIata ? { fromIata: current.fromIata } : {}),
          ...(current.month ? { month: current.month } : {}),
        },
      }),
    staleTime: 5 * 60 * 1000,
  });

  const go = (step: Step) => setTrail((t) => [...t, step]);
  const backTo = (i: number) => setTrail((t) => t.slice(0, i + 1));

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast.success("Link copiado"),
      () => toast.error("Não consegui copiar"),
    );

  const data = q.data;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Plane className="h-6 w-6 text-primary" /> Passagens aéreas baratas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha a região, o país e o destino. Cada preço abre direto no nosso motor.
          </p>
        </div>
        <Button variant="secondary" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      <nav className="flex flex-wrap items-center gap-1 text-sm">
        {trail.map((s, i) => (
          <span key={`${s.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <button
              className={
                i === trail.length - 1
                  ? "font-semibold"
                  : "text-muted-foreground underline-offset-2 hover:underline"
              }
              onClick={() => backTo(i)}
            >
              {s.label}
            </button>
          </span>
        ))}
      </nav>

      {q.isLoading && (
        <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando os preços mais baratos...
        </Card>
      )}
      {q.isError && <Card className="p-6 text-sm text-destructive">{(q.error as Error).message}</Card>}

      {/* Regiões / países */}
      {data?.categories.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.categories.map((c) => (
            <button
              key={c.id}
              onClick={() => go({ label: c.name, categoryId: c.id })}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary hover:shadow-sm"
            >
              {c.image && (
                <img
                  src={c.image}
                  alt={c.name}
                  loading="lazy"
                  className="h-16 w-20 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{c.name}</div>
                <div className="line-clamp-1 text-xs text-muted-foreground">{c.description}</div>
              </div>
              {c.price != null && (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Ida + volta</div>
                  <div className="font-bold text-primary">{brl(c.price)}</div>
                </div>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {/* Destinos ou origens */}
      {data?.cities.length ? (
        <Card className="divide-y overflow-hidden">
          {data.cities.map((c, i) => (
            <div key={`${c.fromIata ?? ""}-${c.toIata ?? i}`} className="flex items-center gap-3 p-3">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  data.level === "cities"
                    ? go({
                        label: c.toName,
                        categoryId: current.categoryId,
                        toIata: c.toIata ?? undefined,
                      })
                    : go({
                        label: `${c.fromName} → ${c.toName}`,
                        categoryId: current.categoryId,
                        toIata: c.toIata ?? current.toIata,
                        fromIata: c.fromIata ?? undefined,
                      })
                }
              >
                <div className="font-medium">
                  {c.fromName ? `${c.fromName} → ${c.toName}` : c.toName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.level === "cities" ? "Ver origens" : "Ver datas"}
                </div>
              </button>
              {c.price != null && <div className="font-semibold">{brl(c.price)}</div>}
              {c.viaairUrl && (
                <Button size="sm" asChild>
                  <a href={c.viaairUrl} target="_blank" rel="noreferrer">
                    Ver voos
                  </a>
                </Button>
              )}
            </div>
          ))}
        </Card>
      ) : null}

      {/* Meses + datas */}
      {data?.months.length ? (
        <div className="flex flex-wrap gap-2">
          {data.months.map((m) => (
            <Button
              key={m.label}
              size="sm"
              variant={current.month && m.label ? "outline" : m.cheapest ? "default" : "secondary"}
              onClick={() => {
                const [mes, ano] = m.label.split("/");
                const idx =
                  ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].indexOf(
                    mes,
                  ) + 1;
                if (!idx || !ano) return;
                setTrail((t) => [
                  ...t.slice(0, -1),
                  { ...t[t.length - 1], label: `${current.label} · ${m.label}`, month: `${ano}-${idx}` },
                ]);
              }}
            >
              {m.label} {m.price ? `• ${brl(m.price)}` : ""}
            </Button>
          ))}
        </div>
      ) : null}

      {data?.dates.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">CIA</th>
                <th className="p-3 text-left">Ida</th>
                <th className="p-3 text-left">Volta</th>
                <th className="p-3 text-left">Perm.</th>
                <th className="p-3 text-left">Bagagem</th>
                <th className="p-3 text-right">Preço</th>
                <th className="p-3 text-right">Nosso link</th>
              </tr>
            </thead>
            <tbody>
              {data.dates.map((o) => (
                <tr key={`${o.departDate}-${o.returnDate}-${o.price}`} className="border-t">
                  <td className="p-3">
                    {o.airlineLogo ? (
                      <img src={o.airlineLogo} alt={o.airline ?? "Companhia"} className="h-5" />
                    ) : (
                      (o.airline ?? "—")
                    )}
                  </td>
                  <td className="p-3">
                    {o.departLabel}
                    <span className="block text-xs text-muted-foreground">{o.weekdayOut}</span>
                  </td>
                  <td className="p-3">
                    {o.returnLabel ?? "—"}
                    <span className="block text-xs text-muted-foreground">{o.weekdayIn}</span>
                  </td>
                  <td className="p-3">{o.nights ? `${o.nights} dias` : "—"}</td>
                  <td className="p-3 text-xs">{o.baggage ?? "—"}</td>
                  <td className="p-3 text-right font-semibold">{brl(o.price)}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => copy(o.viaairUrl)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" asChild>
                        <a href={o.viaairUrl} target="_blank" rel="noreferrer">
                          Ver voos <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {data && !q.isFetching && !data.categories.length && !data.cities.length && !data.dates.length && (
        <Card className="p-6 text-sm text-muted-foreground">
          Nada encontrado aqui. <Badge variant="secondary">volte um nível</Badge>
        </Card>
      )}
    </div>
  );
}
