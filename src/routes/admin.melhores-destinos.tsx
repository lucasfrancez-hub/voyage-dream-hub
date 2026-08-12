/**
 * Melhores Destinos — promoções automáticas.
 * A página busca sozinha as promoções mais recentes do site e mostra os
 * trechos mais baratos já com o link do NOSSO motor (Comprar Viagem).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Copy, ExternalLink, Plane, CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listarPromocoesMd, datasDaRotaMd } from "@/lib/melhores-destinos.functions";
import type { MdPromo, MdRouteDates } from "@/lib/melhores-destinos.server";

export const Route = createFileRoute("/admin/melhores-destinos")({
  component: MelhoresDestinosPage,
});

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

function MelhoresDestinosPage() {
  const listar = useServerFn(listarPromocoesMd);
  const buscarDatas = useServerFn(datasDaRotaMd);
  const [pages, setPages] = useState(2);
  const [dates, setDates] = useState<MdRouteDates | null>(null);
  const [loadingRoute, setLoadingRoute] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://pedidos.viaair.tur.br";

  const promos = useQuery({
    queryKey: ["md-promos", pages],
    queryFn: () => listar({ data: { pages, base: origin } }),
    staleTime: 5 * 60 * 1000,
  });

  const datasMut = useMutation({
    mutationFn: (v: { key: string; from: string; to: string }) =>
      buscarDatas({ data: { ...v, base: origin } }),
    onSuccess: (res) => setDates(res),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setLoadingRoute(null),
  });

  const copy = (text: string, msg = "Link copiado") => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(msg),
      () => toast.error("Não consegui copiar"),
    );
  };

  const lista: MdPromo[] = promos.data?.promos ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Plane className="h-6 w-6 text-primary" /> Melhores Destinos — promoções do dia
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Atualiza sozinho com as passagens mais baratas publicadas hoje. Cada trecho já
            aponta para o nosso motor de busca.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={pages}
            onChange={(e) => setPages(Number(e.target.value))}
          >
            <option value={1}>6 promoções</option>
            <option value={2}>12 promoções</option>
            <option value={4}>24 promoções</option>
            <option value={6}>36 promoções</option>
          </select>
          <Button
            variant="secondary"
            onClick={() => promos.refetch()}
            disabled={promos.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${promos.isFetching ? "animate-spin" : ""}`} />
            {promos.isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </header>

      {promos.isLoading && (
        <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando as promoções mais recentes...
        </Card>
      )}
      {promos.isError && (
        <Card className="p-6 text-sm text-destructive">
          {(promos.error as Error).message}
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {lista.map((p) => (
          <Card key={p.url} className="overflow-hidden">
            <div className="flex gap-3 border-b p-3">
              {p.image && (
                <img
                  src={p.image}
                  alt={p.title}
                  className="h-20 w-28 shrink-0 rounded-md object-cover"
                  loading="lazy"
                />
              )}
              <div className="min-w-0">
                <div className="line-clamp-2 text-sm font-semibold">{p.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{p.ageLabel || "hoje"}</Badge>
                  {p.updatedAt && <span>preços de {p.updatedAt}</span>}
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    fonte <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            {p.error ? (
              <div className="p-3 text-xs text-destructive">{p.error}</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {p.routes.map((r) => {
                    const id = `${p.key}-${r.originCode}-${r.destinationCode}`;
                    return (
                      <tr key={id} className="border-t">
                        <td className="p-2">
                          {r.originName}
                          <span className="text-muted-foreground"> → {r.destinationName}</span>
                        </td>
                        <td className="p-2 text-right font-semibold">{brl(r.price)}</td>
                        <td className="p-2">
                          <div className="flex justify-end gap-1">
                            {p.key && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={loadingRoute === id}
                                onClick={() => {
                                  setLoadingRoute(id);
                                  datasMut.mutate({
                                    key: p.key!,
                                    from: r.originCode,
                                    to: r.destinationCode,
                                  });
                                }}
                              >
                                {loadingRoute === id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CalendarDays className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => copy(`${origin}${r.viaairUrl.replace(origin, "")}`)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" asChild>
                              <a href={r.viaairUrl} target="_blank" rel="noreferrer">
                                Ver voos
                              </a>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        ))}
      </div>

      {dates && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <div>
              <div className="text-lg font-semibold">
                {dates.originName} → {dates.destinationName}
              </div>
              <div className="text-xs text-muted-foreground">
                {dates.dates.length} datas encontradas
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {dates.months.map((m) => (
                <Badge key={m.label} variant={m.cheapest ? "default" : "secondary"}>
                  {m.label} {m.price ? `• ${brl(m.price)}` : ""}
                </Badge>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setDates(null)}>
                Fechar
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
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
                {dates.dates.map((o) => (
                  <tr key={`${o.departDate}-${o.returnDate}-${o.price}`} className="border-t">
                    <td className="p-3">
                      {o.airlineLogo ? (
                        <img
                          src={o.airlineLogo}
                          alt={o.airline ?? "Companhia aérea"}
                          className="h-5"
                        />
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
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => copy(`${origin}${o.viaairUrl.replace(origin, "")}`)}
                        >
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
          </div>
        </Card>
      )}
    </div>
  );
}
