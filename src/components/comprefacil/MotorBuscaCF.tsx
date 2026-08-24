import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, RefreshCw, MapPin, CalendarDays, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buscarPacotesCompreFacil } from "@/lib/comprefacil/comprefacil.functions";
import type { FiltrosBuscaCF } from "@/lib/comprefacil/busca.server";

const moeda = (valor: number | null, sigla: string | null) => {
  if (typeof valor !== "number") return "—";
  const currency = sigla === "USD" ? "USD" : sigla === "EUR" ? "EUR" : "BRL";
  return valor.toLocaleString("pt-BR", { style: "currency", currency });
};

const dataBr = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

/** Motor de busca de pacotes da CompreFácil (catálogo + consulta ao vivo). */
export function MotorBuscaCF() {
  const buscar = useServerFn(buscarPacotesCompreFacil);

  const [form, setForm] = useState<FiltrosBuscaCF>({
    termo: "",
    cidade: "",
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

  const q = useQuery({
    queryKey: ["cf", "motor", filtros, pagina],
    queryFn: () => buscar({ data: { ...(filtros as FiltrosBuscaCF), pagina } }),
    enabled: !!filtros,
  });

  function pesquisar(e: React.FormEvent) {
    e.preventDefault();
    setPagina(1);
    setFiltros({ ...form });
  }

  const total = q.data?.total ?? 0;
  const porPagina = q.data?.porPagina ?? 24;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div className="space-y-5">
      <form onSubmit={pesquisar} className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Destino ou nome do pacote</label>
            <Input
              value={form.termo ?? ""}
              onChange={(e) => setForm({ ...form, termo: e.target.value })}
              placeholder="Ex.: Cancún, Gramado, Disney…"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Saindo de</label>
            <Input
              value={form.saida ?? ""}
              onChange={(e) => setForm({ ...form, saida: e.target.value })}
              placeholder="Cidade de saída"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ordenar por</label>
            <select
              value={form.ordenar}
              onChange={(e) => setForm({ ...form, ordenar: e.target.value as FiltrosBuscaCF["ordenar"] })}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="relevancia">Relevância</option>
              <option value="preco">Menor preço</option>
              <option value="dias">Duração</option>
              <option value="nome">Nome</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="text-xs text-muted-foreground">Ida a partir de</label>
            <Input
              type="date"
              value={form.dataDe ?? ""}
              onChange={(e) => setForm({ ...form, dataDe: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Volta até</label>
            <Input
              type="date"
              value={form.dataAte ?? ""}
              onChange={(e) => setForm({ ...form, dataAte: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Noites (mín.)</label>
            <Input
              type="number"
              min={1}
              value={form.noitesMin ?? ""}
              onChange={(e) => setForm({ ...form, noitesMin: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Noites (máx.)</label>
            <Input
              type="number"
              min={1}
              value={form.noitesMax ?? ""}
              onChange={(e) => setForm({ ...form, noitesMax: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Valor até (por pessoa)</label>
            <Input
              type="number"
              min={0}
              value={form.precoMax ?? ""}
              onChange={(e) => setForm({ ...form, precoMax: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={!!form.aoVivo}
              onChange={(e) => setForm({ ...form, aoVivo: e.target.checked })}
            />
            Consultar a operadora ao vivo
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={!!form.somenteDestaque}
              onChange={(e) => setForm({ ...form, somenteDestaque: e.target.checked })}
            />
            Só destaques
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={!!form.somenteCircuito}
              onChange={(e) => setForm({ ...form, somenteCircuito: e.target.checked })}
            />
            Só circuitos
          </label>
          <Button type="submit" className="ml-auto gap-2" disabled={q.isFetching}>
            {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Pesquisar
          </Button>
        </div>
      </form>

      {filtros && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {q.isFetching ? "Buscando…" : `${total} pacote(s) encontrado(s)`}
            {q.data?.aoVivo.tentou
              ? q.data.aoVivo.encontrados > 0
                ? ` · ${q.data.aoVivo.encontrados} atualizado(s) ao vivo`
                : " · operadora não respondeu, mostrando catálogo"
              : ""}
          </span>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => q.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(q.data?.itens ?? []).map((p) => (
          <article key={p.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            {p.imagem ? (
              <img src={p.imagem} alt={p.nome} loading="lazy" className="h-40 w-full object-cover" />
            ) : (
              <div className="h-40 w-full bg-muted" />
            )}
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold leading-snug">{p.nome}</h3>
                {p.destaque && <Star className="h-4 w-4 shrink-0 text-brand-orange" />}
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {p.cidade ?? "Destino não informado"}
                {p.cidade_saida ? ` · saindo de ${p.cidade_saida}` : ""}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {p.dias ? `${p.dias} dia(s)` : "Duração sob consulta"} · validade até {dataBr(p.validade_ate)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {p.circuito && <Badge variant="secondary">Circuito</Badge>}
                {p.sob_pedido && <Badge variant="outline">Sob pedido</Badge>}
                {p.hoteis.slice(0, 2).map((h) => (
                  <Badge key={h} variant="outline" className="max-w-[12rem] truncate">
                    {h}
                  </Badge>
                ))}
              </div>
              <div className="pt-1 text-sm">
                <span className="text-muted-foreground text-xs">A partir de </span>
                <strong className="text-brand-orange">{moeda(p.valor_servico, p.moeda)}</strong>
                {p.valor_taxa ? (
                  <span className="text-xs text-muted-foreground"> + taxas {moeda(p.valor_taxa, p.moeda)}</span>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>

      {filtros && !q.isFetching && (q.data?.itens.length ?? 0) === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
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
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
