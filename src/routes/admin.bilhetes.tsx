import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Building2,
  Clock,
  Loader2,
  Luggage,
  Plane,
  Printer,
  RefreshCw,
  Search,
  TicketCheck,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { passhubReservas } from "@/lib/passhub/passhub.functions";
import type { PassHubReservaLista } from "@/lib/passhub/types";

export const Route = createFileRoute("/admin/bilhetes")({
  component: BilhetesPage,
  head: () => ({
    meta: [
      { title: "Bilhetes emitidos — Consolidadora | VIA AIR" },
      {
        name: "description",
        content:
          "Bilhetes aéreos já emitidos pela VIA AIR na consolidadora: número do bilhete, passageiros, trechos, tarifa, taxas, RAV e comissão.",
      },
      { property: "og:title", content: "Bilhetes emitidos — Consolidadora | VIA AIR" },
      {
        property: "og:description",
        content: "Consulte bilhetes emitidos, valores e detalhes de cada voo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const dataHora = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const dataCurta = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

const hora = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

/** Consideramos bilhete tudo que já foi emitido (ou está em emissão). */
const emitido = (r: PassHubReservaLista) =>
  !!r.emitidaEm || ["ISSUED", "IN_PROGRESS", "EMITIDA"].includes((r.status || "").toUpperCase());

function BoardingPass({ r }: { r: PassHubReservaLista }) {
  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/10 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Bilhete · localizador
            </p>
            <p className="font-mono text-2xl font-extrabold tracking-widest">
              {r.localizador || "—"}
            </p>
            {r.localizadorCompanhia && (
              <p className="text-xs text-muted-foreground">
                Companhia: <span className="font-mono">{r.localizadorCompanhia}</span>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{brl(r.preco)}</p>
            <p className="text-xs text-muted-foreground">
              tarifa {brl(r.precoSemTaxa)} + taxas {brl(r.taxas)}
            </p>
            <div className="mt-1 flex justify-end gap-2">
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                {r.emitidaEm ? "Emitido" : "Em emissão"}
              </Badge>
              {r.companhia && <Badge variant="outline">{r.companhia}</Badge>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Emitido em</p>
            <p className="font-medium">{dataHora(r.emitidaEm)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reservado em</p>
            <p className="font-medium">{dataHora(r.criadaEm)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">RAV</p>
            <p className="font-medium">
              {r.ravPercentual}% · {brl(r.ravValor)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Comissão</p>
            <p className="font-medium">{brl(r.comissao)}</p>
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        {r.segmentos.map((s, i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                <Plane className="h-4 w-4 text-primary" />
                {s.origem} <ArrowRight className="h-3 w-3" /> {s.destino}
              </div>
              <div className="text-sm text-muted-foreground">
                {dataCurta(s.partida)} · {hora(s.partida)} → {hora(s.chegada)} · {s.duracao}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {s.conexoes.map((c, j) => (
                <Badge key={j} variant="outline" className="font-normal">
                  {c.numeroVoo} · {c.origem}→{c.destino} · {c.familiaTarifaria || c.classe}
                </Badge>
              ))}
              <Badge variant="secondary" className="font-normal">
                <Luggage className="mr-1 h-3 w-3" />
                {s.bagagemDespachada
                  ? `${s.bagagemDespachadaQtd || 1} despachada(s)`
                  : "só bagagem de mão"}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <User className="h-4 w-4" /> Passageiros
        </p>
        <div className="flex flex-wrap gap-2">
          {r.passageiros.length ? (
            r.passageiros.map((p) => (
              <Badge key={p} variant="outline" className="font-normal">
                {p}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">Sem passageiros informados</span>
          )}
        </div>
        <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {r.emissor && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Emissor: {r.emissor}
            </span>
          )}
          {r.provedor && <span>Fornecedor: {r.provedor}</span>}
        </p>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir bilhete
        </Button>
      </div>
    </div>
  );
}

function BilhetesPage() {
  const listar = useServerFn(passhubReservas);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<PassHubReservaLista | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["passhub-reservas"],
    queryFn: () => listar({ data: undefined }),
    staleTime: 60_000,
  });

  const erro = data && !data.ok ? data.erro : null;
  const bilhetes = useMemo(() => {
    const lista = (data?.ok ? data.reservas : []).filter(emitido);
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((r) =>
      [r.localizador, r.localizadorCompanhia, r.origem, r.destino, r.companhia, ...r.passageiros]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data, busca]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TicketCheck className="h-6 w-6 text-primary" /> Bilhetes
          </h1>
          <p className="text-sm text-muted-foreground">
            Bilhetes já emitidos na consolidadora, com valores, passageiros e voos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="w-64 pl-8"
              placeholder="Localizador, rota ou passageiro"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          {erro}
        </div>
      )}

      {isFetching && bilhetes.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando bilhetes…
        </div>
      )}

      <div className="grid gap-3">
        {bilhetes.map((r) => (
          <button
            key={r.idPassagem}
            type="button"
            onClick={() => setAberto(r)}
            className="rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/60 hover:shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-lg font-bold tracking-widest">
                  {r.localizador || "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {r.origem} → {r.destino} · {dataCurta(r.dataIda)}
                  {r.dataVolta ? ` · volta ${dataCurta(r.dataVolta)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  {r.emitidaEm ? "Emitido" : "Em emissão"}
                </Badge>
                {r.companhia && <Badge variant="outline">{r.companhia}</Badge>}
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {dataHora(r.emitidaEm)}
                </span>
                <span className="font-semibold">{brl(r.preco)}</span>
              </div>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {r.passageiros.join(" · ") || "sem passageiros"} · RAV {r.ravPercentual}% ·
              comissão {brl(r.comissao)}
            </p>
          </button>
        ))}
        {!isFetching && bilhetes.length === 0 && !erro && (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum bilhete emitido até agora. Depois de emitir uma reserva, ela aparece aqui.
          </p>
        )}
      </div>

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhe do bilhete</DialogTitle>
            <DialogDescription>
              Dados de emissão vindos da consolidadora: voos, passageiros e valores.
            </DialogDescription>
          </DialogHeader>
          {aberto && <BoardingPass r={aberto} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
