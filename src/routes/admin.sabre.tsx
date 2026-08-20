import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlugZap, Search, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { sabreStatus, sabreBuscar } from "@/lib/sabre/sabre.functions";
import type { SabreOferta } from "@/lib/sabre/types";

export const Route = createFileRoute("/admin/sabre")({
  head: () => ({
    meta: [
      { title: "Conector Sabre — Ambiente interno | VIA AIR" },
      {
        name: "description",
        content:
          "Painel interno da VIA AIR para validar o conector Sabre: autenticação, busca aérea de ida, ida e volta e multitrecho.",
      },
      { property: "og:title", content: "Conector Sabre — Ambiente interno | VIA AIR" },
      {
        property: "og:description",
        content: "Teste de autenticação e busca aérea no GDS Sabre.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SabrePage,
});

type Trecho = { origem: string; destino: string; data: string };

function horaCurta(iso: string) {
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : "--:--";
}

function duracao(min: number) {
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

function SabrePage() {
  const statusFn = useServerFn(sabreStatus);
  const buscarFn = useServerFn(sabreBuscar);

  const [trechos, setTrechos] = useState<Trecho[]>([{ origem: "GRU", destino: "MAD", data: "" }]);
  const [adultos, setAdultos] = useState(1);
  const [ofertas, setOfertas] = useState<SabreOferta[] | null>(null);

  const status = useMutation({
    mutationFn: async () => statusFn(),
    onSuccess: (r) =>
      r.ok
        ? toast.success(`Conectado ao Sabre (${r.ambiente.toUpperCase()} · PCC ${r.pcc})`)
        : toast.error(r.erro ?? "Falha na autenticação"),
    onError: (e) => toast.error((e as Error).message),
  });

  const busca = useMutation({
    mutationFn: async () =>
      buscarFn({
        data: {
          trechos: trechos.map((t) => ({
            origem: t.origem.toUpperCase(),
            destino: t.destino.toUpperCase(),
            data: t.data,
          })),
          adultos,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        setOfertas(null);
        toast.error(r.erro);
        return;
      }
      setOfertas(r.resultado.ofertas);
      if (r.resultado.aviso) toast.warning(r.resultado.aviso);
      else toast.success(`${r.resultado.totalOfertas} opções encontradas`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const atualizar = (i: number, campo: keyof Trecho, valor: string) =>
    setTrechos((prev) => prev.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t)));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Conector Sabre</h1>
          <p className="text-sm text-muted-foreground">
            Ambiente interno para validar autenticação e busca aérea (ida, ida e volta e multitrecho).
          </p>
        </div>
        <Button variant="outline" onClick={() => status.mutate()} disabled={status.isPending}>
          {status.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
          Testar conexão
        </Button>
      </header>

      <section className="space-y-3 rounded-lg border p-4">
        {trechos.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1.3fr_auto] items-end gap-2">
            <div>
              <Label className="text-xs">Origem</Label>
              <Input value={t.origem} maxLength={3} onChange={(e) => atualizar(i, "origem", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Destino</Label>
              <Input value={t.destino} maxLength={3} onChange={(e) => atualizar(i, "destino", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={t.data} onChange={(e) => atualizar(i, "data", e.target.value)} />
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={trechos.length === 1}
              onClick={() => setTrechos((p) => p.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <div className="flex items-end justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={trechos.length >= 6}
            onClick={() =>
              setTrechos((p) => [...p, { origem: p[p.length - 1]?.destino ?? "", destino: "", data: "" }])
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar trecho
          </Button>
          <div className="flex items-end gap-3">
            <div className="w-24">
              <Label className="text-xs">Adultos</Label>
              <Input
                type="number"
                min={1}
                max={9}
                value={adultos}
                onChange={(e) => setAdultos(Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
              />
            </div>
            <Button onClick={() => busca.mutate()} disabled={busca.isPending}>
              {busca.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Buscar
            </Button>
          </div>
        </div>
      </section>

      {ofertas && (
        <section className="space-y-3">
          {ofertas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma oferta retornada.</p>}
          {ofertas.map((o) => (
            <article key={o.chave} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{o.companhia}</Badge>
                  {o.familiaTarifaria && <span className="text-xs text-muted-foreground">{o.familiaTarifaria}</span>}
                </div>
                <div className="text-right">
                  <div className="font-semibold">
                    {o.total.toLocaleString("pt-BR", { style: "currency", currency: o.moeda })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    tarifa {o.tarifa.toLocaleString("pt-BR")} + taxas {o.taxas.toLocaleString("pt-BR")}
                  </div>
                </div>
              </div>
              {o.pernas.map((p, i) => (
                <div key={i} className="border-t py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>
                      {p.origem} {horaCurta(p.partida)} → {p.destino} {horaCurta(p.chegada)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {duracao(p.duracaoMin)} · {p.paradas === 0 ? "direto" : `${p.paradas} conexão(ões)`}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {p.segmentos
                      .map((s) => `${s.companhia}${s.voo} ${s.origem}-${s.destino} (${s.classeTarifaria ?? "-"})`)
                      .join(" · ")}
                  </div>
                </div>
              ))}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
