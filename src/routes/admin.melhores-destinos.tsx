/**
 * Importador da tabela de passagens do Melhores Destinos.
 * Cola o link da promoção (ou da página /voos) e devolve a tabela em JSON,
 * já com o link equivalente no motor da VIA AIR (Comprar Viagem).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Copy, ExternalLink, Plane, Braces } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { scrapeMelhoresDestinos } from "@/lib/melhores-destinos.functions";
import type { MdTable } from "@/lib/melhores-destinos.parse";

export const Route = createFileRoute("/admin/melhores-destinos")({
  component: MelhoresDestinosPage,
});

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

function MelhoresDestinosPage() {
  const run = useServerFn(scrapeMelhoresDestinos);
  const [url, setUrl] = useState("");
  const [table, setTable] = useState<MdTable | null>(null);
  const [showJson, setShowJson] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://pedidos.viaair.tur.br";

  const mut = useMutation({
    mutationFn: (u: string) => run({ data: { url: u, base: origin } }),
    onSuccess: (res) => {
      setTable(res);
      toast.success(`${res.offers.length} datas importadas`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = (text: string, msg = "Link copiado") => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(msg),
      () => toast.error("Não consegui copiar"),
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Plane className="h-6 w-6 text-primary" /> Melhores Destinos — importar tabela
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole o link da promoção ou da página de datas. A tabela vem pronta com o link do
          nosso motor no lugar do site parceiro.
        </p>
      </header>

      <Card className="space-y-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.melhoresdestinos.com.br/promocao/... ou /voos?rota=..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim()) mut.mutate(url.trim());
            }}
          />
          <Button
            onClick={() => mut.mutate(url.trim())}
            disabled={!url.trim() || mut.isPending}
            className="shrink-0"
          >
            <Search className="mr-2 h-4 w-4" />
            {mut.isPending ? "Buscando..." : "Importar tabela"}
          </Button>
        </div>
        {mut.isPending && (
          <p className="text-xs text-muted-foreground">
            Abrindo a página como navegador real — pode levar alguns segundos.
          </p>
        )}
      </Card>

      {table && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <div className="text-lg font-semibold">
                {table.origin} → {table.destination}
              </div>
              <div className="text-xs text-muted-foreground">
                {table.offers.length} datas • fonte: Melhores Destinos
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {table.months.map((m) => (
                <Badge key={m.label} variant="secondary">
                  {m.label} {m.price ? `• ${brl(m.price)}` : ""}
                </Badge>
              ))}
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
                {table.offers.map((o) => (
                  <tr key={`${o.departDate}-${o.returnDate}-${o.price}`} className="border-t">
                    <td className="p-3">
                      {o.airlineLogo ? (
                        <img src={o.airlineLogo} alt={o.airline ?? "Companhia aérea"} className="h-5" />
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
                          onClick={() => copy(`${origin}${o.viaairUrl}`)}
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

          <div className="flex items-center justify-between gap-2 border-t p-3">
            <Button variant="ghost" size="sm" onClick={() => setShowJson((v) => !v)}>
              <Braces className="mr-2 h-4 w-4" /> {showJson ? "Ocultar JSON" : "Ver JSON"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => copy(JSON.stringify(table, null, 2), "JSON copiado")}
            >
              <Copy className="mr-2 h-4 w-4" /> Copiar JSON
            </Button>
          </div>

          {showJson && (
            <pre className="max-h-80 overflow-auto border-t bg-muted/40 p-3 text-xs">
              {JSON.stringify(table, null, 2)}
            </pre>
          )}
        </Card>
      )}
    </div>
  );
}
