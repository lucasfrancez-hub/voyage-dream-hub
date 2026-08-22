import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Copy,
  CreditCard,
  Clock,
  Loader2,
  Luggage,
  Plane,
  RefreshCw,
  Search,
  Ticket,
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

export const Route = createFileRoute("/admin/reservas")({
  component: ReservasPage,
  head: () => ({
    meta: [
      { title: "Reservas e emissões — Consolidadora | VIA AIR" },
      {
        name: "description",
        content:
          "Todas as reservas aéreas da VIA AIR na consolidadora: localizador, prazo de emissão, valores, passageiros e link de pagamento.",
      },
      { property: "og:title", content: "Reservas e emissões — Consolidadora | VIA AIR" },
      {
        property: "og:description",
        content: "Acompanhe reservas, prazos de emissão e links de pagamento em um só lugar.",
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
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

const rotuloStatus: Record<string, string> = {
  CREATED: "Reservada",
  ISSUED: "Emitida",
  CANCELED: "Cancelada",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
  IN_PROGRESS: "Em emissão",
  ERROR: "Erro",
};

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toUpperCase();
  const label = rotuloStatus[s] ?? status ?? "—";
  const variante =
    s === "ISSUED" ? "default" : s === "CREATED" ? "secondary" : "outline";
  return <Badge variant={variante as "default" | "secondary" | "outline"}>{label}</Badge>;
}

function CopiarBotao({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        toast.success(`${rotulo} copiado`);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
      {rotulo}
    </Button>
  );
}

function DetalheReserva({ r }: { r: PassHubReservaLista }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Localizador</p>
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
            Tarifa {brl(r.precoSemTaxa)} + taxas {brl(r.taxas)}
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <StatusBadge status={r.status} />
            {r.provedor && <Badge variant="outline">{r.provedor}</Badge>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Criada em</p>
          <p className="font-medium">{dataHora(r.criadaEm)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Limite de emissão</p>
          <p className="font-medium">{dataHora(r.limiteEmissao)}</p>
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
        {r.emissor && (
          <p className="mt-2 text-xs text-muted-foreground">Emissor: {r.emissor}</p>
        )}
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <CreditCard className="h-4 w-4" /> Link de pagamento
        </p>
        {r.linkPagamento ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-muted px-2 py-1 text-xs">{r.linkPagamento}</code>
            <CopiarBotao texto={r.linkPagamento} rotulo="Copiar link" />
            <Button size="sm" asChild>
              <a href={r.linkPagamento} target="_blank" rel="noreferrer">
                Abrir checkout
              </a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta reserva ainda não tem link de pagamento gerado.
          </p>
        )}
      </div>
    </div>
  );
}

function ReservasPage() {
  const listar = useServerFn(passhubReservas);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<PassHubReservaLista | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["passhub-reservas"],
    queryFn: () => listar({ data: undefined }),
    staleTime: 60_000,
  });

  const reservas = data?.ok ? data.reservas : [];
  const erro = data && !data.ok ? data.erro : null;

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return reservas;
    return reservas.filter((r) =>
      [r.localizador, r.localizadorCompanhia, r.origem, r.destino, r.companhia, ...r.passageiros]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [reservas, busca]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Ticket className="h-6 w-6 text-primary" /> Reservas e emissões
          </h1>
          <p className="text-sm text-muted-foreground">
            Todas as reservas da agência na consolidadora — inclusive as feitas direto no portal
            deles.
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

      {isFetching && reservas.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando reservas…
        </div>
      )}

      <div className="grid gap-3">
        {filtradas.map((r) => (
          <button
            key={r.idPassagem}
            type="button"
            onClick={() => setAberta(r)}
            className="rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/60 hover:shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-mono text-lg font-bold tracking-widest">
                    {r.localizador || "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.origem} → {r.destino} · {dataCurta(r.dataIda)}
                    {r.dataVolta ? ` · volta ${dataCurta(r.dataVolta)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge status={r.status} />
                {r.companhia && <Badge variant="outline">{r.companhia}</Badge>}
                {!r.linkPagamento && <Badge variant="destructive">Sem link</Badge>}
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {dataHora(r.limiteEmissao)}
                </span>
                <span className="font-semibold">{brl(r.preco)}</span>
              </div>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {r.passageiros.join(" · ") || "sem passageiros"} · criada em {dataHora(r.criadaEm)}
            </p>
          </button>
        ))}
        {!isFetching && filtradas.length === 0 && !erro && (
          <p className="text-sm text-muted-foreground">Nenhuma reserva encontrada.</p>
        )}
      </div>

      <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhe da reserva</DialogTitle>
            <DialogDescription>
              Dados vindos direto da consolidadora, com valores, passageiros e pagamento.
            </DialogDescription>
          </DialogHeader>
          {aberta && <DetalheReserva r={aberta} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
