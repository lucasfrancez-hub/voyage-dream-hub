import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, PackageSearch, Plane, RefreshCw, Archive, ArchiveRestore } from "lucide-react";
import {
  resumoCativa,
  listarPacotesCativa,
  carregarPacotesCativaParaImportar,
  sincronizarCativa,
  arquivarPacotesCativa,
} from "@/lib/cativa/cativa.functions";
import { montarDraftsCativa, type CativaDraft } from "@/lib/cativa/to-package-draft";

const brl = (v: number | null | undefined) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) =>
  v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

/** Badge com a quantidade de pacotes Cativa disponíveis (atualiza sozinho). */
export function CativaCountBadge({ active }: { active?: boolean }) {
  const resumo = useServerFn(resumoCativa);
  const q = useQuery({
    queryKey: ["cativa-ativos"],
    queryFn: () => resumo({ data: undefined } as any),
    refetchInterval: 120_000,
  });
  const n = (q.data as any)?.ativos ?? 0;
  if (!n) return null;
  return (
    <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20" : "bg-muted"}`}>{n}</span>
  );
}

export function CativaTab({ onImport }: { onImport: (drafts: CativaDraft[]) => void }) {
  const listar = useServerFn(listarPacotesCativa);
  const carregar = useServerFn(carregarPacotesCativaParaImportar);
  const sincronizar = useServerFn(sincronizarCativa);
  const arquivar = useServerFn(arquivarPacotesCativa);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [fonte, setFonte] = useState("");
  const [pagina, setPagina] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [importando, setImportando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [arquivados, setArquivados] = useState(false);

  // status "ativo": pacotes esgotados somem sozinhos da lista
  const q = useQuery({
    queryKey: ["cativa-tab", filtro, fonte, pagina, arquivados],
    queryFn: () =>
      listar({
        data: { busca: filtro || undefined, fonte: fonte || undefined, status: "ativo", pagina, arquivados },
      }),
    refetchInterval: 120_000,
  });

  const rows = (q.data?.rows ?? []) as any[];
  const total = q.data?.total ?? 0;

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function importar() {
    if (!sel.length) return;
    setImportando(true);
    try {
      const { pacotes } = await carregar({ data: { ids: sel } });
      const drafts: CativaDraft[] = [];
      for (const item of pacotes as any[]) {
        drafts.push(...montarDraftsCativa(item.pacote, item.voos));
      }
      if (!drafts.length) throw new Error("Nenhum pacote pôde ser convertido");
      const extras = drafts.length - sel.length;
      toast.success(
        extras > 0
          ? `${drafts.length} rascunhos gerados (${extras} por datas diferentes nas opções de voo).`
          : `${drafts.length} rascunho(s) gerado(s).`,
      );
      onImport(drafts);
      setSel([]);
      await q.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao importar pacotes Cativa");
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm"
            placeholder="Buscar pacote, origem ou destino"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPagina(0);
                setFiltro(busca);
              }
            }}
          />
        </div>
        <select
          className="h-9 rounded-xl border border-border bg-card px-3 text-sm"
          value={fonte}
          onChange={(e) => {
            setPagina(0);
            setFonte(e.target.value);
          }}
        >
          <option value="">Todas as fontes</option>
          <option value="tradicionais">Tradicionais</option>
          <option value="eventos">Eventos</option>
          <option value="internacionais">Internacionais</option>
        </select>
        <button
          type="button"
          disabled={sincronizando}
          onClick={async () => {
            setSincronizando(true);
            try {
              await sincronizar({ data: { limiteVoos: 10 } });
              await q.refetch();
              toast.success("Catálogo atualizado");
            } catch (e: any) {
              toast.error(e?.message || "Falha ao atualizar");
            } finally {
              setSincronizando(false);
            }
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:text-foreground disabled:opacity-60"
        >
          {sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
        <button
          type="button"
          onClick={() => {
            setPagina(0);
            setSel([]);
            setArquivados((v) => !v);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
        >
          <Archive className="h-3.5 w-3.5" />
          {arquivados ? "Ver disponíveis" : "Arquivados"}
        </button>
        {sel.length ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await arquivar({ data: { ids: sel, arquivar: !arquivados } });
                setSel([]);
                await q.refetch();
                toast.success(arquivados ? "Pacotes devolvidos à lista" : "Pacotes arquivados");
              } catch (e: any) {
                toast.error(e?.message || "Falha ao arquivar");
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
          >
            {arquivados ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            {arquivados ? "Desarquivar" : "Arquivar"} ({sel.length})
          </button>
        ) : null}
        <button
          type="button"
          disabled={!sel.length || importando}
          onClick={importar}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-orange px-4 text-xs font-bold uppercase tracking-wider text-white transition active:scale-95 disabled:opacity-50"
        >
          {importando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageSearch className="h-3.5 w-3.5" />}
          Importar {sel.length ? `(${sel.length})` : ""}
        </button>
      </div>

      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {arquivados
          ? `${total} pacote(s) arquivados (já importados)`
          : `${total} pacote(s) disponíveis no catálogo Cativa · esgotados e já importados saem da lista automaticamente`}
      </p>

      <div className="rounded-xl border border-border bg-card">
        {q.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo…
          </div>
        ) : !rows.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {arquivados ? "Nenhum pacote arquivado." : "Nenhum pacote disponível no momento."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => {
              const marcado = sel.includes(p.id);
              return (
                <li key={p.id} className="flex items-start gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => toggle(p.id)}
                    className="mt-1 h-4 w-4 accent-[#F26B1F]"
                  />
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-semibold">{p.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.origem_cidade ?? p.origem_iata ?? "—"} → {p.destino ?? "—"} · {dataBr(p.data_viagem)}
                      {p.data_fim ? ` a ${dataBr(p.data_fim)}` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider">
                      <span className="rounded-full bg-muted px-2 py-0.5">{p.fonte}</span>
                      {p.categoria ? <span className="rounded-full bg-muted px-2 py-0.5">{p.categoria}</span> : null}
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                        <Plane className="h-3 w-3" />
                        {p.voos_status === "ok" ? `${p.voos_opcoes ?? 0} opções` : p.voos_status}
                      </span>
                    </div>
                  </button>
                  <div className="text-right">
                    <div className="text-sm font-bold">{brl(p.aereo_por)}</div>
                    <div className="text-[10px] text-muted-foreground">taxas {brl(p.taxas)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Página {pagina + 1} de {Math.max(1, Math.ceil(total / 50))}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => p - 1)}
            className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={(pagina + 1) * 50 >= total}
            onClick={() => setPagina((p) => p + 1)}
            className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}

export default CativaTab;
