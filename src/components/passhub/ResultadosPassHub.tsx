import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgePercent,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Filter,
  Luggage,
  Plane,
  Search,
  Ticket,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import type { PassHubOferta, PassHubResultado, PassHubVoo } from "@/lib/passhub/types";

type Props = {
  resultado: PassHubResultado;
  onReservar: (oferta: PassHubOferta) => void;
};

type Ordem = "preco" | "duracao" | "partida" | "chegada";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const hora = (dataHora: string) => (dataHora.split(" ")[1] ?? dataHora).slice(0, 5);
const dia = (dataHora: string) => dataHora.split(" ")[0] ?? "";
const minutosDaPartida = (dataHora: string) => {
  const [h, m] = hora(dataHora).split(":");
  return Number(h ?? 0) * 60 + Number(m ?? 0);
};

const faixas = [
  { id: "madrugada", rotulo: "00h–06h", de: 0, ate: 359 },
  { id: "manha", rotulo: "06h–12h", de: 360, ate: 719 },
  { id: "tarde", rotulo: "12h–18h", de: 720, ate: 1079 },
  { id: "noite", rotulo: "18h–24h", de: 1080, ate: 1440 },
] as const;

function LinhaVoo({ voo, rotulo }: { voo: PassHubVoo; rotulo: string }) {
  const trechos = voo.conexoes.length
    ? [voo.origem, ...voo.conexoes.map((c) => c.aeroporto), voo.destino]
    : [voo.origem, voo.destino];

  return (
    <div className="grid grid-cols-[64px_1fr] items-start gap-3 md:grid-cols-[74px_1fr]">
      <Badge variant="outline" className="justify-center font-normal">
        {rotulo}
      </Badge>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_150px]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div>
            <p className="text-lg font-bold leading-none">{hora(voo.partida)}</p>
            <p className="text-[11px] text-muted-foreground">
              {voo.origem} · {dia(voo.partida)}
            </p>
          </div>
          <div className="flex min-w-28 flex-1 flex-col items-center">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" /> {voo.duracao}
            </span>
            <div className="my-1 h-px w-full bg-border" />
            <span className="text-[11px] text-muted-foreground">
              {voo.paradas === 0 ? "Voo direto" : `${voo.paradas} parada(s)`} ·{" "}
              {trechos.join(" → ")}
            </span>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold leading-none">{hora(voo.chegada)}</p>
            <p className="text-[11px] text-muted-foreground">
              {voo.destino} · {dia(voo.chegada)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 md:justify-end">
          <Badge variant="secondary" className="font-normal">
            {voo.companhiaIata || voo.companhia}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {voo.numeroVoo}
          </Badge>
          {voo.familiaTarifaria && (
            <Badge variant="outline" className="font-normal">
              {voo.familiaTarifaria}
            </Badge>
          )}
          <Badge
            variant={voo.bagagemDespachada ? "secondary" : "outline"}
            className="gap-1 font-normal"
          >
            {voo.bagagemDespachada ? (
              <>
                <Luggage className="h-3 w-3" /> {voo.bagagemDespachadaQtd || 1}
              </>
            ) : (
              <>
                <Briefcase className="h-3 w-3" /> mão
              </>
            )}
          </Badge>
          {voo.mudancaAeroporto && <Badge variant="destructive">troca aeroporto</Badge>}
        </div>
      </div>
    </div>
  );
}

function LinhaOferta({
  oferta,
  maisBarata,
  onReservar,
}: {
  oferta: PassHubOferta;
  maisBarata: boolean;
  onReservar: (o: PassHubOferta) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const maxParcelas = oferta.ida.parcelamento.reduce((m, p) => Math.max(m, p.maxParcelas), 0);

  return (
    <article
      className={`rounded-xl border p-3 transition md:p-4 ${
        maisBarata
          ? "border-emerald-500/60 bg-emerald-500/5"
          : "border-border bg-card hover:border-primary/50"
      }`}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
        <div className="space-y-3">
          <LinhaVoo voo={oferta.ida} rotulo="Ida" />
          {oferta.voltas.map((v, i) => (
            <LinhaVoo key={i} voo={v} rotulo="Volta" />
          ))}
        </div>

        <div className="flex flex-col items-stretch gap-2 border-t border-border pt-3 md:items-end md:border-l md:border-t-0 md:pl-4 md:pt-0">
          {maisBarata && (
            <Badge className="w-fit gap-1 self-end bg-emerald-600 text-white hover:bg-emerald-600">
              <BadgePercent className="h-3 w-3" /> Mais barato
            </Badge>
          )}
          <div className="md:text-right">
            <p className="text-2xl font-extrabold leading-none">{brl(oferta.precoTotal)}</p>
            <p className="text-[11px] text-muted-foreground">
              tarifa {brl(oferta.ida.precoTarifa)} + taxas {brl(oferta.ida.taxas)}
            </p>
            {maxParcelas > 0 && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground md:justify-end">
                <CreditCard className="h-3 w-3" /> até {maxParcelas}x no cartão
              </p>
            )}
            {oferta.ida.provedor && (
              <p className="text-[11px] text-muted-foreground">
                {oferta.ida.provedor}
                {oferta.ida.canal ? ` · ${oferta.ida.canal}` : ""}
              </p>
            )}
          </div>
          <div className="flex gap-2 md:flex-col">
            <Button className="flex-1" onClick={() => onReservar(oferta)}>
              <Ticket className="mr-2 h-4 w-4" /> Reservar
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setAberto((a) => !a)}>
              <ChevronDown
                className={`mr-2 h-4 w-4 transition ${aberto ? "rotate-180" : ""}`}
              />
              Detalhes
            </Button>
          </div>
        </div>
      </div>

      {aberto && (
        <div className="mt-3 grid gap-3 rounded-lg bg-muted/40 p-3 text-xs md:grid-cols-3">
          <div>
            <p className="mb-1 font-semibold">Serviços da tarifa</p>
            <ul className="space-y-1">
              {oferta.ida.servicos.map((s, i) => (
                <li key={i} className={s.incluso ? "text-foreground" : "text-muted-foreground"}>
                  {s.incluso ? "✔" : "✖"} {s.descricao || s.tipo}
                </li>
              ))}
              {oferta.ida.servicos.length === 0 && <li>Não informado</li>}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold">Conexões</p>
            <ul className="space-y-1 text-muted-foreground">
              {[oferta.ida, ...oferta.voltas].flatMap((v, vi) =>
                v.conexoes.map((c, ci) => (
                  <li key={`${vi}-${ci}`}>
                    {c.aeroporto} · espera {c.duracao}
                    {c.mudancaAeroporto ? " · troca de aeroporto" : ""}
                  </li>
                )),
              )}
              {[oferta.ida, ...oferta.voltas].every((v) => v.conexoes.length === 0) && (
                <li>Sem conexões</li>
              )}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold">Parcelamento por bandeira</p>
            <ul className="space-y-1 text-muted-foreground">
              {oferta.ida.parcelamento.map((p) => (
                <li key={p.bandeira}>
                  <span className="text-foreground">{p.bandeira}</span>: até {p.maxParcelas}x
                </li>
              ))}
              {oferta.ida.parcelamento.length === 0 && <li>Não informado pela consolidadora</li>}
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}

export function ResultadosPassHub({ resultado, onReservar }: Props) {
  const [texto, setTexto] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("preco");
  const [companhias, setCompanhias] = useState<string[]>([]);
  const [paradas, setParadas] = useState<"todas" | "0" | "1" | "2+">("todas");
  const [soBagagem, setSoBagagem] = useState(false);
  const [familias, setFamilias] = useState<string[]>([]);
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [tetoPreco, setTetoPreco] = useState(resultado.precoMax);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  useEffect(() => {
    setCompanhias([]);
    setFamilias([]);
    setPeriodos([]);
    setParadas("todas");
    setSoBagagem(false);
    setTexto("");
    setTetoPreco(resultado.precoMax);
  }, [resultado]);

  const alterna = (lista: string[], set: (v: string[]) => void, valor: string) =>
    set(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);

  /** Menor preço por companhia — alimenta o resumo do topo e o filtro. */
  const precoPorCompanhia = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of resultado.ofertas) {
      const cia = o.ida.companhia || o.ida.companhiaIata;
      const atual = mapa.get(cia);
      if (atual === undefined || o.precoTotal < atual) mapa.set(cia, o.precoTotal);
    }
    return [...mapa.entries()].sort((a, b) => a[1] - b[1]);
  }, [resultado]);

  const ofertas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const lista = resultado.ofertas.filter((o) => {
      const voos = [o.ida, ...o.voltas];
      if (o.precoTotal > tetoPreco) return false;
      if (companhias.length && !voos.some((v) => companhias.includes(v.companhia))) return false;
      if (familias.length && !voos.some((v) => familias.includes(v.familiaTarifaria))) return false;
      if (soBagagem && voos.some((v) => !v.bagagemDespachada)) return false;
      if (paradas === "0" && voos.some((v) => v.paradas > 0)) return false;
      if (paradas === "1" && voos.some((v) => v.paradas > 1)) return false;
      if (paradas === "2+" && !voos.some((v) => v.paradas >= 2)) return false;
      if (periodos.length) {
        const m = minutosDaPartida(o.ida.partida);
        const bate = faixas.some(
          (f) => periodos.includes(f.id) && m >= f.de && m <= f.ate,
        );
        if (!bate) return false;
      }
      if (q) {
        const alvo = voos
          .flatMap((v) => [
            v.companhia,
            v.companhiaIata,
            v.numeroVoo,
            v.origem,
            v.destino,
            v.familiaTarifaria,
            ...v.conexoes.map((c) => c.aeroporto),
          ])
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });

    const chave = (o: PassHubOferta) => {
      if (ordem === "preco") return o.precoTotal;
      if (ordem === "duracao")
        return [o.ida, ...o.voltas].reduce((s, v) => s + v.duracaoMinutos, 0);
      if (ordem === "chegada") return minutosDaPartida(o.ida.chegada);
      return minutosDaPartida(o.ida.partida);
    };
    return [...lista].sort((a, b) => chave(a) - chave(b));
  }, [resultado, texto, ordem, companhias, familias, paradas, soBagagem, periodos, tetoPreco]);

  const menorPreco = ofertas.length ? Math.min(...ofertas.map((o) => o.precoTotal)) : 0;
  const filtrosAtivos =
    companhias.length +
    familias.length +
    periodos.length +
    (soBagagem ? 1 : 0) +
    (paradas !== "todas" ? 1 : 0) +
    (tetoPreco < resultado.precoMax ? 1 : 0);

  const limpar = () => {
    setCompanhias([]);
    setFamilias([]);
    setPeriodos([]);
    setParadas("todas");
    setSoBagagem(false);
    setTetoPreco(resultado.precoMax);
    setTexto("");
  };

  const painelFiltros = (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Companhia aérea
        </p>
        <div className="space-y-2">
          {precoPorCompanhia.map(([cia, preco]) => (
            <label
              key={cia}
              className="flex cursor-pointer items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <Checkbox
                  checked={companhias.includes(cia)}
                  onCheckedChange={() => alterna(companhias, setCompanhias, cia)}
                />
                {cia}
              </span>
              <span className="text-xs text-muted-foreground">{brl(preco)}</span>
            </label>
          ))}
          {precoPorCompanhia.length === 0 && (
            <p className="text-xs text-muted-foreground">Sem companhias nesta busca.</p>
          )}
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Paradas
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["todas", "Todas"],
              ["0", "Direto"],
              ["1", "Até 1"],
              ["2+", "2 ou mais"],
            ] as const
          ).map(([v, rotulo]) => (
            <Button
              key={v}
              size="sm"
              variant={paradas === v ? "default" : "outline"}
              onClick={() => setParadas(v)}
            >
              {rotulo}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Horário de partida (ida)
        </p>
        <div className="flex flex-wrap gap-2">
          {faixas.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={periodos.includes(f.id) ? "default" : "outline"}
              onClick={() => alterna(periodos, setPeriodos, f.id)}
            >
              {f.rotulo}
            </Button>
          ))}
        </div>
      </div>

      {resultado.familias.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Família tarifária
          </p>
          <div className="flex flex-wrap gap-2">
            {resultado.familias.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={familias.includes(f) ? "default" : "outline"}
                onClick={() => alterna(familias, setFamilias, f)}
              >
                {f}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={soBagagem} onCheckedChange={(v) => setSoBagagem(v === true)} />
          Só com bagagem despachada
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preço até
          </p>
          <span className="text-sm font-semibold">{brl(tetoPreco)}</span>
        </div>
        <Slider
          min={Math.floor(resultado.precoMin)}
          max={Math.ceil(resultado.precoMax)}
          step={10}
          value={[tetoPreco]}
          onValueChange={([v]) => setTetoPreco(v ?? resultado.precoMax)}
        />
      </div>

      <Button variant="ghost" className="w-full" onClick={limpar}>
        <X className="mr-2 h-4 w-4" /> Limpar filtros
      </Button>
    </div>
  );

  return (
    <section className="space-y-4">
      {/* Resumo: menor preço por companhia (clicável = filtro) */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {precoPorCompanhia.slice(0, 4).map(([cia, preco], i) => {
          const ativo = companhias.includes(cia);
          return (
            <button
              key={cia}
              type="button"
              onClick={() => alterna(companhias, setCompanhias, cia)}
              className={`rounded-xl border p-3 text-left transition ${
                ativo ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Plane className="h-4 w-4 text-primary" /> {cia}
                </span>
                {i === 0 && (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">menor</Badge>
                )}
                {ativo && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
              <p className="mt-1 text-lg font-extrabold">{brl(preco)}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-xl border border-border bg-card p-4 lg:block">
          <p className="mb-3 flex items-center gap-2 font-semibold">
            <Filter className="h-4 w-4 text-primary" /> Filtros
            {filtrosAtivos > 0 && <Badge variant="secondary">{filtrosAtivos}</Badge>}
          </p>
          {painelFiltros}
        </aside>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <div className="relative min-w-52 flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Cia, voo, aeroporto ou família tarifária"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Ordenar</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={ordem}
                onChange={(e) => setOrdem(e.target.value as Ordem)}
              >
                <option value="preco">Menor preço</option>
                <option value="duracao">Menor duração</option>
                <option value="partida">Partida mais cedo</option>
                <option value="chegada">Chegada mais cedo</option>
              </select>
            </div>
            <Button
              variant="outline"
              className="lg:hidden"
              onClick={() => setFiltrosAbertos((v) => !v)}
            >
              <Filter className="mr-2 h-4 w-4" /> Filtros
              {filtrosAtivos > 0 && <Badge className="ml-2">{filtrosAtivos}</Badge>}
            </Button>
            <span className="text-xs text-muted-foreground">
              {ofertas.length} de {resultado.ofertas.length} ofertas
            </span>
          </div>

          {filtrosAbertos && (
            <div className="rounded-xl border border-border bg-card p-4 lg:hidden">
              {painelFiltros}
            </div>
          )}

          <div className="hidden grid-cols-[minmax(0,1fr)_190px] gap-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
            <span>Itinerário · companhia · bagagem</span>
            <span className="md:text-right">Total e reserva</span>
          </div>

          {ofertas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhuma oferta com os filtros atuais.{" "}
              <button type="button" className="underline" onClick={limpar}>
                Limpar filtros
              </button>
            </p>
          ) : (
            <div className="space-y-3">
              {ofertas.map((o) => (
                <LinhaOferta
                  key={o.id}
                  oferta={o}
                  maisBarata={o.precoTotal === menorPreco}
                  onReservar={onReservar}
                />
              ))}
            </div>
          )}

          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <ArrowRight className="h-3 w-3" /> A reserva é feita aqui mesmo: revalidamos a tarifa e
            emitimos o localizador sem sair do sistema.
          </p>
        </div>
      </div>
    </section>
  );
}
