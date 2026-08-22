import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Code2, Loader2, PlugZap, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AirportAutocomplete } from "@/components/search/AirportAutocomplete";
import { passhubStatus, passhubMotorBuscar } from "@/lib/passhub/passhub.functions";
import { ReservaPassHubDialog } from "@/components/passhub/ReservaPassHubDialog";
import { ResultadosPassHub } from "@/components/passhub/ResultadosPassHub";
import type { PassHubOferta, PassHubResultado } from "@/lib/passhub/types";

export const Route = createFileRoute("/admin/passhub")({
  head: () => ({
    meta: [
      { title: "Motor PassHub — Ambiente interno | VIA AIR" },
      {
        name: "description",
        content:
          "Motor de busca interno da VIA AIR conectado à PassHub: ida, ida e volta e multitrecho com filtros, bagagem e parcelamento.",
      },
      { property: "og:title", content: "Motor PassHub — Ambiente interno | VIA AIR" },
      {
        property: "og:description",
        content: "Busca aérea PassHub com filtros, ordenação e detalhes de tarifa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PassHubPage,
});

type Trecho = { origem: string; destino: string; data: string };

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });


function PassHubPage() {
  const statusFn = useServerFn(passhubStatus);
  const buscarFn = useServerFn(passhubMotorBuscar);

  const [trechos, setTrechos] = useState<Trecho[]>([{ origem: "GRU", destino: "LDB", data: "" }]);
  const [dataVolta, setDataVolta] = useState("");
  const [adultos, setAdultos] = useState(1);
  const [criancas, setCriancas] = useState(0);
  const [bebes, setBebes] = useState(0);
  const [rav, setRav] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(12);

  const [resultado, setResultado] = useState<PassHubResultado | null>(null);
  const [bruto, setBruto] = useState<string | null>(null);
  const [verBruto, setVerBruto] = useState(false);

  const [ofertaReserva, setOfertaReserva] = useState<PassHubOferta | null>(null);

  const status = useMutation({
    mutationFn: async () => statusFn(),
    onSuccess: (r) =>
      r.ok ? toast.success("Conectado à PassHub") : toast.error(r.erro ?? "Falha na autenticação"),
    onError: (e) => toast.error((e as Error).message),
  });

  const busca = useMutation({
    mutationFn: async (p: number) =>
      buscarFn({
        data: {
          trechos: trechos.map((t) => ({
            origem: t.origem.toUpperCase(),
            destino: t.destino.toUpperCase(),
            data: t.data,
          })),
          dataVolta: trechos.length === 1 && dataVolta ? dataVolta : null,
          adultos,
          criancas,
          bebes,
          ravPercentual: rav,
          pagina: p,
          porPagina,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        setResultado(null);
        setBruto(null);
        toast.error(r.erro);
        return;
      }
      setResultado(r.resultado);
      setBruto(JSON.stringify(r.bruto, null, 2));
      toast.success(`${r.resultado.total} ofertas encontradas`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const atualiza = (i: number, campo: keyof Trecho, valor: string) =>
    setTrechos((prev) => prev.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t)));

  const buscar = (p: number) => {
    setPagina(p);
    busca.mutate(p);
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Motor PassHub</h1>
          <p className="text-sm text-muted-foreground">
            Busca aérea interna via PassHub — ida, ida e volta e multitrecho, com bagagem,
            conexões e parcelamento por bandeira.
          </p>
        </div>
        <Button variant="outline" onClick={() => status.mutate()} disabled={status.isPending}>
          {status.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <PlugZap className="mr-2 h-4 w-4" />
          )}
          Testar conexão
        </Button>
      </header>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        {trechos.map((t, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_180px_44px]">
            <div>
              <Label>Origem</Label>
              <AirportAutocomplete
                value={t.origem}
                onSelect={(iata) => atualiza(i, "origem", iata)}
                placeholder="Cidade ou IATA"
              />
            </div>
            <div>
              <Label>Destino</Label>
              <AirportAutocomplete
                value={t.destino}
                onSelect={(iata) => atualiza(i, "destino", iata)}
                placeholder="Cidade ou IATA"
                isDeparture={false}
              />
            </div>
            <div>
              <Label>{trechos.length > 1 ? `Data ${i + 1}` : "Ida"}</Label>
              <Input
                type="date"
                value={t.data}
                onChange={(e) => atualiza(i, "data", e.target.value)}
              />
            </div>
            <div className="flex items-end">
              {trechos.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTrechos((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {trechos.length === 1 && (
            <div>
              <Label>Volta (opcional)</Label>
              <Input type="date" value={dataVolta} onChange={(e) => setDataVolta(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Adultos</Label>
            <Input
              type="number"
              min={1}
              max={9}
              value={adultos}
              onChange={(e) => setAdultos(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <Label>Crianças</Label>
            <Input
              type="number"
              min={0}
              max={8}
              value={criancas}
              onChange={(e) => setCriancas(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div>
            <Label>Bebês</Label>
            <Input
              type="number"
              min={0}
              max={8}
              value={bebes}
              onChange={(e) => setBebes(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div>
            <Label>RAV (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={rav}
              onChange={(e) => setRav(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div>
            <Label>Por página</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={porPagina}
              onChange={(e) =>
                setPorPagina(Math.min(50, Math.max(1, Number(e.target.value) || 12)))
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setTrechos((p) => [...p, { origem: "", destino: "", data: "" }].slice(0, 6))
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Adicionar trecho
          </Button>
          <Button onClick={() => buscar(1)} disabled={busca.isPending}>
            {busca.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Buscar
          </Button>
          {bruto && (
            <Button variant="ghost" onClick={() => setVerBruto((v) => !v)}>
              <Code2 className="mr-2 h-4 w-4" /> {verBruto ? "Ocultar JSON" : "Ver JSON bruto"}
            </Button>
          )}
        </div>
      </section>

      {resultado && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
            <span className="text-muted-foreground">
              {resultado.total} ofertas · página {resultado.pagina}/{resultado.totalPaginas} ·
              faixa {brl(resultado.precoMin)} – {brl(resultado.precoMax)}
            </span>
          </div>

          <ResultadosPassHub resultado={resultado} onReservar={setOfertaReserva} />

          {resultado.totalPaginas > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                disabled={pagina <= 1 || busca.isPending}
                onClick={() => buscar(pagina - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                {pagina} / {resultado.totalPaginas}
              </span>
              <Button
                variant="outline"
                disabled={pagina >= resultado.totalPaginas || busca.isPending}
                onClick={() => buscar(pagina + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </section>
      )}

      {verBruto && bruto && (
        <pre className="max-h-[520px] overflow-auto rounded-xl border border-border bg-muted/40 p-4 text-xs">
          {bruto}
        </pre>
      )}
      <ReservaPassHubDialog
        oferta={ofertaReserva}
        adultos={adultos}
        criancas={criancas}
        bebes={bebes}
        ravPercentual={rav}
        onClose={() => setOfertaReserva(null)}
      />
    </main>
  );
}
