import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlugZap, Search, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passhubStatus, passhubBuscar } from "@/lib/passhub/passhub.functions";

export const Route = createFileRoute("/admin/passhub")({
  head: () => ({
    meta: [
      { title: "Conector PassHub — Ambiente interno | VIA AIR" },
      {
        name: "description",
        content:
          "Painel interno da VIA AIR para validar o conector PassHub: login da agência, busca aérea de ida, ida e volta e multitrecho.",
      },
      { property: "og:title", content: "Conector PassHub — Ambiente interno | VIA AIR" },
      {
        property: "og:description",
        content: "Teste de autenticação e busca aérea na plataforma PassHub.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PassHubPage,
});

type Trecho = { origem: string; destino: string; data: string };

function PassHubPage() {
  const statusFn = useServerFn(passhubStatus);
  const buscarFn = useServerFn(passhubBuscar);

  const [trechos, setTrechos] = useState<Trecho[]>([{ origem: "GRU", destino: "REC", data: "" }]);
  const [dataVolta, setDataVolta] = useState("");
  const [adultos, setAdultos] = useState(1);
  const [bruto, setBruto] = useState<string | null>(null);

  const status = useMutation({
    mutationFn: async () => statusFn(),
    onSuccess: (r) =>
      r.ok ? toast.success("Conectado à PassHub") : toast.error(r.erro ?? "Falha na autenticação"),
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
          dataVolta: trechos.length === 1 && dataVolta ? dataVolta : null,
          adultos,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        setBruto(null);
        toast.error(r.erro);
        return;
      }
      setBruto(JSON.stringify(r.resultado, null, 2));
      toast.success("Busca concluída");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const atualiza = (i: number, campo: keyof Trecho, valor: string) =>
    setTrechos((prev) => prev.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t)));

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Conector PassHub</h1>
        <p className="text-sm text-muted-foreground">
          Login da agência + busca aérea (ida, ida e volta e multitrecho). Uso interno.
        </p>
      </header>

      <Button variant="outline" onClick={() => status.mutate()} disabled={status.isPending}>
        {status.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <PlugZap className="mr-2 h-4 w-4" />
        )}
        Testar conexão
      </Button>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        {trechos.map((t, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <Label>Origem</Label>
              <Input
                value={t.origem}
                maxLength={3}
                onChange={(e) => atualiza(i, "origem", e.target.value)}
              />
            </div>
            <div>
              <Label>Destino</Label>
              <Input
                value={t.destino}
                maxLength={3}
                onChange={(e) => atualiza(i, "destino", e.target.value)}
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={t.data} onChange={(e) => atualiza(i, "data", e.target.value)} />
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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
          <Button onClick={() => busca.mutate()} disabled={busca.isPending}>
            {busca.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Buscar
          </Button>
        </div>
      </section>

      {bruto && (
        <pre className="max-h-[520px] overflow-auto rounded-xl border border-border bg-muted/40 p-4 text-xs">
          {bruto}
        </pre>
      )}
    </main>
  );
}
