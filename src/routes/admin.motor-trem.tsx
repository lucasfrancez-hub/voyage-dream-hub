import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, TrainFront, ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { omioAutocomplete, omioDetalhe, omioPesquisar } from "@/lib/omio/omio.functions";
import type { OmioBusca, OmioDetalhe, OmioPosition } from "@/lib/omio/types";

export const Route = createFileRoute("/admin/motor-trem")({
  head: () => ({
    meta: [
      { title: "Motor de trem (Omio) — Ambiente de teste | VIA AIR" },
      {
        name: "description",
        content:
          "Ambiente interno para validar o conector de pesquisa de trens: estações, horários, tarifas e extras antes de entrar no motor de busca VIA AIR.",
      },
      { property: "og:title", content: "Motor de trem (Omio) — Ambiente de teste | VIA AIR" },
      { property: "og:description", content: "Pesquisa read-only de trens para o motor VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MotorTremPage,
});

function fmtPreco(p?: { valor: number; moeda: string }) {
  if (!p) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: p.moeda || "EUR" }).format(p.valor);
}

function StationField({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: OmioPosition | null;
  onSelect: (p: OmioPosition | null) => void;
}) {
  const buscar = useServerFn(omioAutocomplete);
  const [termo, setTermo] = useState("");
  const [opcoes, setOpcoes] = useState<OmioPosition[]>([]);
  const [carregando, setCarregando] = useState(false);
  const requestId = useRef(0);

  function pesquisar(t: string) {
    setTermo(t);
    onSelect(null);
    if (t.trim().length < 3) {
      setOpcoes([]);
    }
  }

  useEffect(() => {
    const consulta = termo.trim();
    if (value || consulta.length < 3) {
      setCarregando(false);
      return;
    }

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setCarregando(true);
      try {
        const r = await buscar({ data: { termo: consulta } });
        if (requestId.current === currentRequest) setOpcoes(r.opcoes);
      } catch (e) {
        if (requestId.current === currentRequest) {
          toast.error(e instanceof Error ? e.message : "Falha no autocomplete");
        }
      } finally {
        if (requestId.current === currentRequest) setCarregando(false);
      }
    }, 600);

    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [buscar, termo, value]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          value={value ? value.nome : termo}
          onChange={(e) => pesquisar(e.target.value)}
          placeholder="Ex.: Berlin, Praha hlavní nádraží"
        />
        {carregando && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {!value && opcoes.length > 0 && (
        <div className="rounded-md border bg-card">
          {opcoes.map((o) => (
            <button
              key={o.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onSelect(o);
                setOpcoes([]);
              }}
            >
              <span>{o.nome}</span>
              <span className="text-xs text-muted-foreground">{o.pais ?? o.tipo}</span>
            </button>
          ))}
        </div>
      )}
      {value && <p className="text-xs text-muted-foreground">ID Omio: {value.id}</p>}
    </div>
  );
}

function MotorTremPage() {
  const pesquisarFn = useServerFn(omioPesquisar);
  const detalheFn = useServerFn(omioDetalhe);

  const [origem, setOrigem] = useState<OmioPosition | null>(null);
  const [destino, setDestino] = useState<OmioPosition | null>(null);
  const [data, setData] = useState("");
  const [adultos, setAdultos] = useState(1);
  const [busca, setBusca] = useState<OmioBusca | null>(null);
  const [detalhe, setDetalhe] = useState<OmioDetalhe | null>(null);

  const buscaMut = useMutation({
    mutationFn: async () => {
      if (!origem || !destino || !data) throw new Error("Preencha origem, destino e data");
      return pesquisarFn({
        data: { origemId: origem.id, destinoId: destino.id, data, adultos, modo: "train" },
      });
    },
    onSuccess: (r) => {
      setBusca(r);
      setDetalhe(null);
      if (!r.resultados.length) toast.warning("Busca concluída, mas nenhuma opção foi normalizada.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na pesquisa"),
  });

  const detalheMut = useMutation({
    mutationFn: async (journeyId: string) => {
      if (!busca) throw new Error("Faça uma busca primeiro");
      return detalheFn({ data: { searchId: busca.searchId, journeyId, legId: journeyId, modo: "train" } });
    },
    onSuccess: (r) => setDetalhe(r as OmioDetalhe),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao detalhar"),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <TrainFront className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Motor de trem — ambiente de teste</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Conector read-only (Omio) para validar estações, horários, tarifas e extras antes de plugar no motor de busca
          VIA AIR. Nenhuma reserva é feita por aqui.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <StationField label="Origem" value={origem} onSelect={setOrigem} />
          <StationField label="Destino" value={destino} onSelect={setDestino} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Data da viagem</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Passageiros</Label>
            <Input
              type="number"
              min={1}
              max={9}
              value={adultos}
              onChange={(e) => setAdultos(Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => buscaMut.mutate()} disabled={buscaMut.isPending}>
              {buscaMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Pesquisar trens
            </Button>
          </div>
        </div>
      </section>

      {busca && (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">searchId: {busca.searchId}</Badge>
            <Badge variant="outline">{busca.resultados.length} opção(ões)</Badge>
            <a
              href={busca.urlResultados}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline underline-offset-2"
            >
              abrir na Omio
            </a>
          </div>
          <Separator />
          <div className="space-y-2">
            {busca.resultados.map((r) => (
              <div key={r.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <span>{r.partida}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{r.chegada}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.origem || "—"} → {r.destino || "—"} · {r.conexoes} conexão(ões)
                      {r.transportadoras.length ? ` · ${r.transportadoras.join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{fmtPreco(r.preco)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => detalheMut.mutate(r.id)}
                      disabled={detalheMut.isPending}
                    >
                      {detalheMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ver tarifas"}
                    </Button>
                  </div>
                </div>
                {r.segmentos.length > 1 && (
                  <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                    {r.segmentos.map((s, i) => (
                      <li key={i}>
                        {s.partida ?? "—"} {s.origem ?? ""} → {s.chegada ?? "—"} {s.destino ?? ""}
                        {s.transportadora ? ` · ${s.transportadora}` : ""}
                        {s.numero ? ` ${s.numero}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {!busca.resultados.length && (
              <p className="text-sm text-muted-foreground">
                Nenhuma opção normalizada — veja o diagnóstico abaixo.
              </p>
            )}
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Diagnóstico</summary>
            <ul className="mt-2 space-y-1">
              {busca.diagnostico.map((d, i) => (
                <li key={i}>· {d}</li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {detalhe && (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Info className="h-4 w-4 text-primary" /> Tarifas e extras
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {detalhe.tarifas.map((t) => (
              <div key={t.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.nome}</span>
                  <span className="font-semibold">{fmtPreco(t.preco)}</span>
                </div>
                {t.descricao && <p className="mt-1 text-xs text-muted-foreground">{t.descricao}</p>}
                <div className="mt-2 flex gap-2">
                  {t.reembolsavel !== undefined && (
                    <Badge variant={t.reembolsavel ? "secondary" : "outline"}>
                      {t.reembolsavel ? "Reembolsável" : "Não reembolsável"}
                    </Badge>
                  )}
                  {t.trocavel !== undefined && (
                    <Badge variant={t.trocavel ? "secondary" : "outline"}>
                      {t.trocavel ? "Permite troca" : "Sem troca"}
                    </Badge>
                  )}
                </div>
                {t.termos.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {t.termos.slice(0, 5).map((c, i) => (
                      <li key={i}>· {c}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {!detalhe.tarifas.length && (
              <p className="text-sm text-muted-foreground">Nenhuma tarifa capturada nesta viagem.</p>
            )}
          </div>
          {detalhe.extras.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2">
                {detalhe.extras.map((e) => (
                  <Badge key={e.id} variant="outline">
                    {e.nome} {e.preco ? `· ${fmtPreco(e.preco)}` : ""}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
