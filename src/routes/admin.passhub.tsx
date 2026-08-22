import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgePercent,
  Briefcase,
  Clock,
  Code2,
  CreditCard,
  Loader2,
  Luggage,
  PlugZap,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AirportAutocomplete } from "@/components/search/AirportAutocomplete";
import { passhubStatus, passhubMotorBuscar } from "@/lib/passhub/passhub.functions";
import type { PassHubOferta, PassHubVoo, PassHubResultado } from "@/lib/passhub/types";

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
type Ordem = "preco" | "duracao" | "partida";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const hora = (dataHora: string) => dataHora.split(" ")[1] ?? dataHora;
const dia = (dataHora: string) => dataHora.split(" ")[0] ?? "";

function VooCard({ voo, titulo }: { voo: PassHubVoo; titulo: string }) {
  const maxParcelas = voo.parcelamento.reduce((m, p) => Math.max(m, p.maxParcelas), 0);

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{titulo}</Badge>
        <span className="font-medium text-foreground">{voo.companhia}</span>
        <span>{voo.numeroVoo}</span>
        {voo.familiaTarifaria && <Badge variant="outline">{voo.familiaTarifaria}</Badge>}
        <Badge variant="outline">{voo.classe}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="text-center">
          <p className="text-lg font-bold leading-none">{hora(voo.partida)}</p>
          <p className="text-xs text-muted-foreground">
            {voo.origem} · {dia(voo.partida)}
          </p>
        </div>
        <div className="flex min-w-32 flex-1 flex-col items-center">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> {voo.duracao}
          </span>
          <div className="my-1 h-px w-full bg-border" />
          <span className="text-xs text-muted-foreground">
            {voo.paradas === 0 ? "Voo direto" : voo.escala}
            {voo.conexoes.length > 0 &&
              ` (${voo.conexoes.map((c) => `${c.aeroporto} ${c.duracao}`).join(", ")})`}
          </span>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold leading-none">{hora(voo.chegada)}</p>
          <p className="text-xs text-muted-foreground">
            {voo.destino} · {dia(voo.chegada)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={voo.bagagemMao ? "secondary" : "outline"} className="gap-1">
          <Briefcase className="h-3 w-3" /> Mão {voo.bagagemMao ? "inclusa" : "não inclusa"}
        </Badge>
        <Badge variant={voo.bagagemDespachada ? "secondary" : "outline"} className="gap-1">
          <Luggage className="h-3 w-3" />
          {voo.bagagemDespachada ? `Despachada ${voo.bagagemDespachadaQtd}x` : "Sem despachada"}
        </Badge>
        {voo.mudancaAeroporto && <Badge variant="destructive">Troca de aeroporto</Badge>}
        {voo.provedor && <Badge variant="outline">{voo.provedor}{voo.canal ? ` · ${voo.canal}` : ""}</Badge>}
        {maxParcelas > 0 && (
          <Badge variant="outline" className="gap-1">
            <CreditCard className="h-3 w-3" /> até {maxParcelas}x
          </Badge>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Tarifa {brl(voo.precoTarifa)} + taxas {brl(voo.taxas)} ={" "}
        <span className="font-semibold text-foreground">{brl(voo.precoTotal)}</span>
      </p>
    </div>
  );
}

function OfertaCard({ oferta, maisBarata }: { oferta: PassHubOferta; maisBarata: boolean }) {
  const [aberto, setAberto] = useState(false);

  return (
    <article
      className={`space-y-3 rounded-xl border p-4 ${
        maisBarata ? "border-emerald-500/60 bg-emerald-500/5" : "border-border bg-card"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 space-y-3">
          <VooCard voo={oferta.ida} titulo="Ida" />
          {oferta.voltas.map((v, i) => (
            <VooCard key={i} voo={v} titulo="Volta" />
          ))}
        </div>
        <div className="min-w-40 text-right">
          {maisBarata && (
            <Badge className="mb-1 gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
              <BadgePercent className="h-3 w-3" /> Mais barato
            </Badge>
          )}
          <p className="text-2xl font-extrabold">{brl(oferta.precoTotal)}</p>
          <p className="text-xs text-muted-foreground">total da oferta</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setAberto((a) => !a)}>
            {aberto ? "Ocultar detalhes" : "Ver detalhes"}
          </Button>
        </div>
      </div>

      {aberto && (
        <div className="grid gap-3 rounded-lg bg-muted/40 p-3 text-xs md:grid-cols-2">
          <div>
            <p className="mb-1 font-semibold">Serviços da tarifa</p>
            <ul className="space-y-1">
              {oferta.ida.servicos.map((s, i) => (
                <li key={i} className={s.incluso ? "text-foreground" : "text-muted-foreground"}>
                  {s.incluso ? "✔" : "✖"} {s.descricao || s.tipo}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold">Parcelamento por bandeira</p>
            <ul className="space-y-1">
              {oferta.ida.parcelamento.map((p) => (
                <li key={p.bandeira} className="text-muted-foreground">
                  <span className="text-foreground">{p.bandeira}</span>: até {p.maxParcelas}x —{" "}
                  {p.motivos.join("; ")}
                </li>
              ))}
              {oferta.ida.parcelamento.length === 0 && <li>Não informado pela PassHub</li>}
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}

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

  const [ordem, setOrdem] = useState<Ordem>("preco");
  const [soDireto, setSoDireto] = useState(false);
  const [soBagagem, setSoBagagem] = useState(false);
  const [companhia, setCompanhia] = useState<string>("todas");

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

  const ofertas = useMemo(() => {
    const lista = (resultado?.ofertas ?? []).filter((o) => {
      const voos = [o.ida, ...o.voltas];
      if (soDireto && voos.some((v) => v.paradas > 0)) return false;
      if (soBagagem && voos.some((v) => !v.bagagemDespachada)) return false;
      if (companhia !== "todas" && !voos.some((v) => v.companhia === companhia)) return false;
      return true;
    });
    const chave = (o: PassHubOferta) =>
      ordem === "preco"
        ? o.precoTotal
        : ordem === "duracao"
          ? [o.ida, ...o.voltas].reduce((s, v) => s + v.duracaoMinutos, 0)
          : [o.ida.partida.split(" ")[1] ?? ""].map((h) => Number(h.replace(":", "")))[0] ?? 0;
    return [...lista].sort((a, b) => chave(a) - chave(b));
  }, [resultado, ordem, soDireto, soBagagem, companhia]);

  const menorPreco = ofertas.length ? Math.min(...ofertas.map((o) => o.precoTotal)) : 0;

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
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={ordem}
                onChange={(e) => setOrdem(e.target.value as Ordem)}
              >
                <option value="preco">Menor preço</option>
                <option value="duracao">Menor duração</option>
                <option value="partida">Partida mais cedo</option>
              </select>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={companhia}
                onChange={(e) => setCompanhia(e.target.value)}
              >
                <option value="todas">Todas as companhias</option>
                {resultado.companhias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant={soDireto ? "default" : "outline"}
                onClick={() => setSoDireto((v) => !v)}
              >
                <ArrowRight className="mr-1 h-3 w-3" /> Só diretos
              </Button>
              <Button
                size="sm"
                variant={soBagagem ? "default" : "outline"}
                onClick={() => setSoBagagem((v) => !v)}
              >
                <Luggage className="mr-1 h-3 w-3" /> Com despachada
              </Button>
            </div>
          </div>

          {ofertas.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhuma oferta com os filtros atuais.
            </p>
          )}

          <div className="space-y-3">
            {ofertas.map((o) => (
              <OfertaCard key={o.id} oferta={o} maisBarata={o.precoTotal === menorPreco} />
            ))}
          </div>

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
    </main>
  );
}
