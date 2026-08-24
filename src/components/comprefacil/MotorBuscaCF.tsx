import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, RefreshCw, MapPin, CalendarDays, Star, Users, Moon, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CidadeAutocompleteCF } from "@/components/comprefacil/CidadeAutocompleteCF";
import { RoomsPaxField, QUARTO_PADRAO, totalPax, type QuartoPax } from "@/components/search/RoomsPaxField";
import { buscarPacotesCompreFacil } from "@/lib/comprefacil/comprefacil.functions";
import type { FiltrosBuscaCF } from "@/lib/comprefacil/busca.server";

const moeda = (valor: number | null, sigla: string | null) => {
  if (typeof valor !== "number") return "—";
  const currency = sigla === "USD" ? "USD" : sigla === "EUR" ? "EUR" : "BRL";
  return valor.toLocaleString("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 });
};

const dataBr = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

/** Motor de busca de pacotes da CompreFácil (consulta sempre ao vivo + catálogo). */
export function MotorBuscaCF() {
  const buscar = useServerFn(buscarPacotesCompreFacil);

  const [quartos, setQuartos] = useState<QuartoPax[]>([{ ...QUARTO_PADRAO }]);
  const [form, setForm] = useState<FiltrosBuscaCF>({
    termo: "",
    cidade: "",
    cidadeId: null,
    saida: "",
    dataDe: null,
    dataAte: null,
    noitesMin: null,
    noitesMax: null,
    precoMax: null,
    somenteDestaque: false,
    somenteCircuito: false,
    ordenar: "relevancia",
    aoVivo: true,
  });
  const [filtros, setFiltros] = useState<FiltrosBuscaCF | null>(null);
  const [pagina, setPagina] = useState(1);

  const pax = useMemo(() => {
    const t = totalPax(quartos);
    return { ...t, pessoas: t.adultos + t.criancas + t.bebes };
  }, [quartos]);

  const q = useQuery({
    queryKey: ["cf", "motor", filtros, pagina],
    queryFn: () => buscar({ data: { ...(filtros as FiltrosBuscaCF), pagina } }),
    enabled: !!filtros,
  });

  function pesquisar(e: React.FormEvent) {
    e.preventDefault();
    setPagina(1);
    setFiltros({ ...form, aoVivo: true });
  }

  const total = q.data?.total ?? 0;
  const porPagina = q.data?.porPagina ?? 24;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagantes = Math.max(1, pax.adultos + pax.criancas);

  return (
    <div className="space-y-6">
      <form
        onSubmit={pesquisar}
        className="rounded-3xl border border-brand-blue/25 bg-gradient-to-br from-brand-blue/15 via-card to-card p-5 shadow-[0_18px_45px_-30px_var(--brand-blue)] space-y-4"
      >
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Destino
            </label>
            <CidadeAutocompleteCF
              campo="destino"
              valor={form.cidade ?? ""}
              onChange={(nome, cidadeId) => setForm({ ...form, cidade: nome, cidadeId, termo: cidadeId ? "" : nome })}
              placeholder="Ex.: Cancún, Gramado, Orlando…"
            />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Saindo de
            </label>
            <CidadeAutocompleteCF
              campo="saida"
              valor={form.saida ?? ""}
              onChange={(nome) => setForm({ ...form, saida: nome })}
              placeholder="Cidade de saída"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ida a partir de
            </label>
            <Input
              type="date"
              className="h-11"
              value={form.dataDe ?? ""}
              onChange={(e) => setForm({ ...form, dataDe: e.target.value || null })}
            />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pessoas e quartos
            </label>
            <RoomsPaxField quartos={quartos} onChange={setQuartos} />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-12">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Volta até
            </label>
            <Input
              type="date"
              className="h-11"
              value={form.dataAte ?? ""}
              onChange={(e) => setForm({ ...form, dataAte: e.target.value || null })}
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Noites (mín.)
            </label>
            <Input
              type="number"
              min={1}
              className="h-11"
              value={form.noitesMin ?? ""}
              onChange={(e) => setForm({ ...form, noitesMin: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Noites (máx.)
            </label>
            <Input
              type="number"
              min={1}
              className="h-11"
              value={form.noitesMax ?? ""}
              onChange={(e) => setForm({ ...form, noitesMax: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Valor até (por pessoa)
            </label>
            <Input
              type="number"
              min={0}
              className="h-11"
              value={form.precoMax ?? ""}
              onChange={(e) => setForm({ ...form, precoMax: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ordenar por
            </label>
            <select
              value={form.ordenar}
              onChange={(e) => setForm({ ...form, ordenar: e.target.value as FiltrosBuscaCF["ordenar"] })}
              className="h-11 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
            >
              <option value="relevancia">Relevância</option>
              <option value="preco">Menor preço</option>
              <option value="dias">Duração</option>
              <option value="nome">Nome</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
          <button
            type="button"
            onClick={() => setForm({ ...form, somenteDestaque: !form.somenteDestaque })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              form.somenteDestaque
                ? "border-brand-orange bg-brand-orange/15 text-brand-orange"
                : "border-border/60 text-muted-foreground hover:border-brand-orange/50"
            }`}
          >
            Só destaques
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, somenteCircuito: !form.somenteCircuito })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              form.somenteCircuito
                ? "border-brand-orange bg-brand-orange/15 text-brand-orange"
                : "border-border/60 text-muted-foreground hover:border-brand-orange/50"
            }`}
          >
            Só circuitos
          </button>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {pax.pessoas} pessoa(s) · {quartos.length} quarto(s)
          </span>
          <Button type="submit" size="lg" className="ml-auto gap-2 rounded-full px-6" disabled={q.isFetching}>
            {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Pesquisar pacotes
          </Button>
        </div>
      </form>

      {filtros && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {q.isFetching ? "Consultando a operadora…" : `${total} pacote(s) para ${pax.pessoas} pessoa(s)`}
            {q.data?.aoVivo.tentou && q.data.aoVivo.encontrados > 0
              ? ` · ${q.data.aoVivo.encontrados} atualizado(s) agora`
              : ""}
          </span>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => q.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {(q.data?.itens ?? []).map((p) => {
          const porPessoa = p.valor_servico ?? null;
          const estimado = typeof porPessoa === "number" ? porPessoa * pagantes : null;
          return (
            <article
              key={p.id}
              className="group overflow-hidden rounded-3xl border border-border/70 bg-card transition hover:-translate-y-0.5 hover:border-brand-orange/50 hover:shadow-[0_20px_45px_-28px_var(--brand-orange)]"
            >
              <div className="relative h-44 w-full overflow-hidden">
                {p.imagem ? (
                  <img
                    src={p.imagem}
                    alt={p.nome}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/10 to-transparent" />
                <div className="absolute left-3 top-3 flex gap-1.5">
                  {p.destaque && (
                    <Badge className="gap-1 bg-brand-orange text-primary-foreground">
                      <Star className="h-3 w-3" /> Destaque
                    </Badge>
                  )}
                  {p.circuito && <Badge variant="secondary">Circuito</Badge>}
                  {p.sob_pedido && <Badge variant="outline">Sob pedido</Badge>}
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{p.nome}</h3>
                </div>
              </div>

              <div className="space-y-3 p-4">
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-brand-blue" />
                    <span className="truncate">{p.cidade ?? "Destino a definir"}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Plane className="h-3.5 w-3.5 text-brand-blue" />
                    <span className="truncate">{p.cidade_saida ? `Saindo de ${p.cidade_saida}` : "Saída flexível"}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Moon className="h-3.5 w-3.5 text-brand-blue" />
                    {p.dias ? `${p.dias} dia(s)` : "Duração sob consulta"}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-brand-blue" />
                    até {dataBr(p.validade_ate)}
                  </p>
                </div>

                {p.hoteis.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {p.hoteis.slice(0, 2).map((h) => (
                      <Badge key={h} variant="outline" className="max-w-[12rem] truncate font-normal">
                        {h}
                      </Badge>
                    ))}
                    {p.hoteis.length > 2 && (
                      <Badge variant="outline" className="font-normal">
                        +{p.hoteis.length - 2}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="rounded-2xl bg-muted/40 p-3">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Por pessoa</p>
                      <p className="text-lg font-bold text-brand-orange">{moeda(porPessoa, p.moeda)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Total {pagantes} pax
                      </p>
                      <p className="text-sm font-semibold">{moeda(estimado, p.moeda)}</p>
                    </div>
                  </div>
                  {p.valor_taxa ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      + taxas {moeda(p.valor_taxa, p.moeda)} por pessoa
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {filtros && !q.isFetching && (q.data?.itens.length ?? 0) === 0 && (
        <p className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum pacote encontrado com esses filtros.
        </p>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {pagina} de {totalPaginas}
          </span>
          <Button variant="outline" size="sm" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
