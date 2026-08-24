import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Package, RefreshCw, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listarPacotesCompreFacil,
  listarServicosCompreFacil,
  resumoCompreFacil,
  sincronizarCompreFacil,
} from "@/lib/comprefacil/comprefacil.functions";
import { MotorBuscaCF } from "@/components/comprefacil/MotorBuscaCF";

export const Route = createFileRoute("/admin/comprefacil")({
  head: () => ({
    meta: [
      { title: "Catálogo CompreFácil | VIA AIR" },
      { name: "description", content: "Pacotes e serviços importados da consolidadora CompreFácil." },
      { property: "og:title", content: "Catálogo CompreFácil | VIA AIR" },
      { property: "og:description", content: "Pacotes e serviços importados da consolidadora CompreFácil." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompreFacilPage,
});

const moedaFmt = (valor: number | null, sigla: string | null) => {
  if (typeof valor !== "number") return "—";
  const currency = sigla === "USD" ? "USD" : sigla === "EUR" ? "EUR" : "BRL";
  return valor.toLocaleString("pt-BR", { style: "currency", currency });
};

const dataBr = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

function CompreFacilPage() {
  const qc = useQueryClient();
  const resumoFn = useServerFn(resumoCompreFacil);
  const pacotesFn = useServerFn(listarPacotesCompreFacil);
  const servicosFn = useServerFn(listarServicosCompreFacil);
  const sincronizarFn = useServerFn(sincronizarCompreFacil);

  const [buscaPacote, setBuscaPacote] = useState("");
  const [buscaServico, setBuscaServico] = useState("");
  const [paginaPacote, setPaginaPacote] = useState(1);
  const [paginaServico, setPaginaServico] = useState(1);

  const resumo = useQuery({ queryKey: ["cf", "resumo"], queryFn: () => resumoFn({ data: {} as never }) });
  const pacotes = useQuery({
    queryKey: ["cf", "pacotes", buscaPacote, paginaPacote],
    queryFn: () => pacotesFn({ data: { busca: buscaPacote, pagina: paginaPacote } }),
  });
  const servicos = useQuery({
    queryKey: ["cf", "servicos", buscaServico, paginaServico],
    queryFn: () => servicosFn({ data: { busca: buscaServico, pagina: paginaServico } }),
  });

  const sync = useMutation({
    mutationFn: (escopo: "pacotes" | "servicos" | "tudo") => sincronizarFn({ data: { escopo } }),
    onSuccess: (r) => {
      toast.success(
        `Importação concluída — ${r.pacotes_novos + r.pacotes_atualizados} pacotes e ${r.servicos_novos + r.servicos_atualizados} serviços.`,
      );
      qc.invalidateQueries({ queryKey: ["cf"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao importar do CompreFácil."),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Catálogo CompreFácil</h1>
          <p className="text-sm text-muted-foreground">
            {resumo.data
              ? `${resumo.data.pacotes} pacotes e ${resumo.data.servicos} serviços ativos · última importação em ${
                  resumo.data.ultima ? new Date(resumo.data.ultima.iniciado_em).toLocaleString("pt-BR") : "—"
                }`
              : "Carregando resumo…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate("pacotes")}>
            {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
            Importar pacotes
          </Button>
          <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate("servicos")}>
            {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Importar serviços
          </Button>
          <Button disabled={sync.isPending} onClick={() => sync.mutate("tudo")}>
            {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Importar tudo
          </Button>
        </div>
      </header>

      <Tabs defaultValue="motor">
        <TabsList>
          <TabsTrigger value="motor">Motor de busca</TabsTrigger>
          <TabsTrigger value="pacotes">Pacotes</TabsTrigger>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="cancelamentos">Cancelamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="cancelamentos" className="space-y-4">
          <PainelCancelamentos />
        </TabsContent>


        <TabsContent value="motor" className="space-y-4">
          <MotorBuscaCF />
        </TabsContent>

        <TabsContent value="pacotes" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome, cidade ou referência"
              value={buscaPacote}
              onChange={(e) => {
                setBuscaPacote(e.target.value);
                setPaginaPacote(1);
              }}
            />
          </div>

          {pacotes.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando pacotes…</p>
          ) : !pacotes.data?.itens.length ? (
            <p className="text-sm text-muted-foreground">Nenhum pacote importado ainda.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pacotes.data.itens.map((p: any) => (
                <article key={p.id} className="flex gap-3 rounded-lg border bg-card p-3">
                  {p.imagens?.[0]?.url ? (
                    <img
                      src={p.imagens[0].url}
                      alt={`Imagem do pacote ${p.nome}`}
                      loading="lazy"
                      className="h-20 w-28 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-20 w-28 shrink-0 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.cidade ?? "—"} · {p.dias ?? "?"} dias · válido até {dataBr(p.validade_ate)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{moedaFmt(p.valor_servico, p.moeda)}</Badge>
                      {p.sob_pedido && <Badge variant="outline">Sob pedido</Badge>}
                      {p.circuito && <Badge variant="outline">Circuito</Badge>}
                      {Array.isArray(p.periodos) && p.periodos.length > 0 && (
                        <Badge variant="outline">{p.periodos.length} saídas</Badge>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <Paginacao
            pagina={paginaPacote}
            total={pacotes.data?.total ?? 0}
            porPagina={pacotes.data?.porPagina ?? 20}
            onChange={setPaginaPacote}
          />
        </TabsContent>

        <TabsContent value="servicos" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por serviço ou fornecedor"
              value={buscaServico}
              onChange={(e) => {
                setBuscaServico(e.target.value);
                setPaginaServico(1);
              }}
            />
          </div>

          {servicos.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando serviços…</p>
          ) : !servicos.data?.itens.length ? (
            <p className="text-sm text-muted-foreground">Nenhum serviço importado ainda.</p>
          ) : (
            <div className="divide-y rounded-lg border bg-card">
              {servicos.data.itens.map((s: any) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.titulo}</p>
                    <p className="text-xs text-muted-foreground">{s.fornecedor ?? "Fornecedor não informado"}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {s.tipo && <Badge variant="secondary">{s.tipo}</Badge>}
                    {s.combo && <Badge variant="outline">Combo</Badge>}
                    {s.internacional && <Badge variant="outline">Internacional</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Paginacao
            pagina={paginaServico}
            total={servicos.data?.total ?? 0}
            porPagina={servicos.data?.porPagina ?? 20}
            onChange={setPaginaServico}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Busca um orçamento da operadora e permite cancelar item a item ou tudo. */
function PainelCancelamentos() {
  const [texto, setTexto] = useState("");
  const [orcamentoId, setOrcamentoId] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex max-w-md gap-2">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
          placeholder="Número do orçamento na operadora"
          onKeyDown={(e) => {
            if (e.key === "Enter" && texto) setOrcamentoId(Number(texto));
          }}
        />
        <Button disabled={!texto} onClick={() => setOrcamentoId(Number(texto))}>
          <Search className="mr-2 h-4 w-4" /> Abrir
        </Button>
      </div>
      {orcamentoId ? (
        <CancelarReservaFrt key={orcamentoId} orcamentoId={orcamentoId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Informe o número do orçamento da reserva para consultar os itens e cancelar.
        </p>
      )}
    </div>
  );
}


function Paginacao({
  pagina,
  total,
  porPagina,
  onChange,
}: {
  pagina: number;
  total: number;
  porPagina: number;
  onChange: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => onChange(pagina - 1)}>
        Anterior
      </Button>
      <span className="text-xs text-muted-foreground">
        Página {pagina} de {paginas} · {total} itens
      </span>
      <Button variant="outline" size="sm" disabled={pagina >= paginas} onClick={() => onChange(pagina + 1)}>
        Próxima
      </Button>
    </div>
  );
}
