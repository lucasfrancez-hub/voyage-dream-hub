import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Plus, Megaphone, Trash2, Send, X, Users, Radio, Package, Search, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import {
  listCampanhas,
  listDestinos,
  syncDestinos,
  salvarCampanha,
  cancelarCampanha,
  excluirCampanha,
  dispararAgora,
  getCampanha,
  adicionarDestinoPorLink,
  excluirDestino,
  listPacotesProntos,
} from "@/lib/broadcast/broadcast.functions";
import { confirm } from "@/lib/confirm";

export const Route = createFileRoute("/chat/broadcast")({
  ssr: false,
  component: DisparosPage,
  head: () => ({
    meta: [
      { title: "Broadcast — VIA AIR Chat" },
      { name: "description", content: "Central de campanhas WhatsApp com calendário e agenda de programação." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Destino = {
  id: string;
  jid: string;
  tipo: "channel" | "group";
  nome: string;
  foto_url: string | null;
  participantes: number | null;
  is_admin: boolean;
  pode_postar: boolean;
  tags: string[];
  ativo: boolean;
  ultima_sync: string | null;
};

type Campanha = {
  id: string;
  nome: string;
  status: "rascunho" | "agendada" | "enviando" | "concluida" | "falhou" | "cancelada";
  scheduled_at: string | null;
  sent_at: string | null;
  destino_ids: string[];
  observacoes_marketing: string | null;
  metrics: Record<string, number> | null;
  created_at: string;
};

type Bloco = {
  tipo: "text" | "image" | "video" | "document" | "buttons";
  texto?: string | null;
  midia_url?: string | null;
  midia_filename?: string | null;
  midia_caption?: string | null;
  botoes?: unknown;
};

const STATUS_LABEL: Record<Campanha["status"], string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  enviando: "Enviando…",
  concluida: "Concluída",
  falhou: "Falhou",
  cancelada: "Cancelada",
};

const STATUS_COLOR: Record<Campanha["status"], string> = {
  rascunho: "bg-muted text-muted-foreground",
  agendada: "bg-blue-500/15 text-blue-500",
  enviando: "bg-amber-500/15 text-amber-500",
  concluida: "bg-emerald-500/15 text-emerald-500",
  falhou: "bg-red-500/15 text-red-500",
  cancelada: "bg-muted text-muted-foreground line-through",
};

function DisparosPage() {
  const [tab, setTab] = useState<"calendario" | "campanhas" | "destinos">("calendario");
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showEditor, setShowEditor] = useState<null | { id?: string; presetDate?: string }>(null);

  const fetchCamp = useServerFn(listCampanhas);
  const fetchDest = useServerFn(listDestinos);
  const doSync = useServerFn(syncDestinos);
  const doCancelar = useServerFn(cancelarCampanha);
  const doExcluir = useServerFn(excluirCampanha);
  const doDisparar = useServerFn(dispararAgora);

  async function load() {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([fetchCamp(), fetchDest()]);
      setCampanhas((c.campanhas ?? []) as Campanha[]);
      setDestinos((d.destinos ?? []) as Destino[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function sync() {
    setSyncing(true);
    try {
      const r = await doSync();
      toast.success(`Sincronizado: ${r.groups} grupos, ${r.channels} canais`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na sincronização");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1.5 h-7 rounded-full bg-brand-orange" />
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-brand-orange" />
              Broadcast
            </h1>
          </div>
          <p className="text-sm text-muted-foreground ml-4">
            Agendamento de campanhas via WhatsApp — envio entre 09h e 21h (BRT).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm hover:border-brand-orange disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar
          </button>
          <button
            onClick={() => setShowEditor({})}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white hover:opacity-90 shadow-lg shadow-brand-orange/20"
          >
            <Plus className="h-4 w-4" /> Nova campanha
          </button>
        </div>
      </div>

      <div className="inline-flex bg-muted/50 p-1 rounded-lg self-start overflow-x-auto">
        {(["calendario", "campanhas", "destinos"] as const).map((t) => {
          const count =
            t === "calendario"
              ? campanhas.filter((c) => c.status === "agendada" && c.scheduled_at).length
              : t === "campanhas"
              ? campanhas.length
              : destinos.length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                tab === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "calendario" ? "Calendário" : t === "campanhas" ? "Campanhas" : "Destinos"}
              <span className="text-xs opacity-60 ml-1">({count})</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tab === "calendario" ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card/50 overflow-hidden flex flex-col lg:flex-row">
            <div className="flex-1 min-w-0">
              <CalendarioMes
                campanhas={campanhas}
                destinos={destinos}
                onPickDay={(iso) => setShowEditor({ presetDate: iso })}
                onPickCampanha={(id) => setShowEditor({ id })}
              />
            </div>
            <AgendaSidebar
              campanhas={campanhas}
              destinos={destinos}
              onPick={(id) => setShowEditor({ id })}
              onNew={() => setShowEditor({})}
            />
          </div>
          <AgendaProgramada
            campanhas={campanhas}
            destinos={destinos}
            onEdit={(id) => setShowEditor({ id })}
            onCancelar={async (id) => {
              if (!(await confirm({ title: "Cancelar campanha?", description: "Ela não será mais enviada." }))) return;
              await doCancelar({ data: { id } });
              toast.success("Campanha cancelada");
              load();
            }}
            onDisparar={async (id) => {
              if (!(await confirm({ title: "Disparar agora?", description: "Será enviada imediatamente para todos os destinos selecionados." }))) return;
              await doDisparar({ data: { id } });
              toast.success("Enviando…");
              load();
            }}
          />
        </div>
      ) : tab === "campanhas" ? (
        <CampanhasList
          campanhas={campanhas}
          destinos={destinos}
          onEdit={(id) => setShowEditor({ id })}
          onCancelar={async (id) => {
            if (!(await confirm({ title: "Cancelar campanha?", description: "Ela não será mais enviada." }))) return;
            await doCancelar({ data: { id } });
            toast.success("Campanha cancelada");
            load();
          }}
          onExcluir={async (id) => {
            if (!(await confirm({ title: "Excluir campanha?", description: "Essa ação não pode ser desfeita." }))) return;
            await doExcluir({ data: { id } });
            toast.success("Excluída");
            load();
          }}
          onDisparar={async (id) => {
            if (!(await confirm({ title: "Disparar agora?", description: "Será enviada imediatamente para todos os destinos selecionados." }))) return;
            await doDisparar({ data: { id } });
            toast.success("Enviando…");
            load();
          }}
        />
      ) : (
        <DestinosList destinos={destinos} onChanged={load} />
      )}

      {showEditor && (
        <CampanhaEditor
          id={showEditor.id}
          presetDate={showEditor.presetDate}
          destinos={destinos}
          onClose={() => setShowEditor(null)}
          onSaved={() => { setShowEditor(null); load(); }}
        />
      )}
      </div>
    </div>
  );
}

// ==================== Calendário estilo macOS ====================

function CalendarioMes({
  campanhas,
  onPickDay,
  onPickCampanha,
}: {
  campanhas: Campanha[];
  onPickDay: (iso: string) => void;
  onPickCampanha: (id: string) => void;
}) {
  const hoje = new Date();
  const [cursor, setCursor] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));

  const eventos = useMemo(() => {
    const map = new Map<string, Campanha[]>();
    for (const c of campanhas) {
      if (!c.scheduled_at) continue;
      if (c.status !== "agendada" && c.status !== "enviando" && c.status !== "concluida") continue;
      const d = new Date(c.scheduled_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());
    }
    return map;
  }, [campanhas]);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startWeekday = first.getDay(); // 0=dom
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: Date | null; iso: string | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(cursor.getFullYear(), cursor.getMonth(), d);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    cells.push({ date: dt, iso });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, iso: null });

  const mesLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function openDay(iso: string) {
    // Abre editor pré-agendado às 10:00 daquele dia
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d, 10, 0, 0);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    onPickDay(local);
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="p-1.5 rounded-full hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-lg font-semibold capitalize">{mesLabel}</h2>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="p-1.5 rounded-full hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => setCursor(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}
          className="text-xs rounded-full border border-border px-3 py-1.5 hover:border-brand-orange"
        >
          Hoje
        </button>
      </header>
      <div className="grid grid-cols-7 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
        {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
          <div key={d} className="px-2 py-1.5 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const evs = cell.iso ? eventos.get(cell.iso) ?? [] : [];
          const isToday = cell.date && isSameDay(cell.date, hoje);
          return (
            <div
              key={i}
              className={`min-h-[92px] border-t border-l border-border p-1.5 text-xs ${
                (i + 1) % 7 === 0 ? "border-r" : ""
              } ${cell.date ? "cursor-pointer hover:bg-muted/40" : "bg-muted/10"}`}
              onClick={() => cell.iso && openDay(cell.iso)}
            >
              {cell.date && (
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                      isToday ? "bg-brand-orange text-white font-semibold" : "text-foreground"
                    }`}
                  >
                    {cell.date.getDate()}
                  </span>
                  {evs.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{evs.length}</span>
                  )}
                </div>
              )}
              <div className="space-y-0.5">
                {evs.slice(0, 3).map((c) => {
                  const hora = new Date(c.scheduled_at!).toLocaleTimeString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPickCampanha(c.id);
                      }}
                      className="w-full text-left truncate rounded px-1.5 py-0.5 text-[10px] bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25"
                    >
                      <span className="font-medium">{hora}</span> {c.nome}
                    </button>
                  );
                })}
                {evs.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">
                    +{evs.length - 3} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}



function AgendaProgramada({
  campanhas,
  destinos,
  onEdit,
  onCancelar,
  onDisparar,
}: {
  campanhas: Campanha[];
  destinos: Destino[];
  onEdit: (id: string) => void;
  onCancelar: (id: string) => void;
  onDisparar: (id: string) => void;
}) {
  const destMap = useMemo(() => new Map(destinos.map((d) => [d.id, d])), [destinos]);
  const agora = Date.now();
  const programadas = useMemo(
    () =>
      campanhas
        .filter((c) => c.status === "agendada" && c.scheduled_at)
        .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime()),
    [campanhas],
  );

  const grupos = useMemo(() => {
    const map = new Map<string, Campanha[]>();
    for (const c of programadas) {
      const dia = new Date(c.scheduled_at!).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        weekday: "short",
        day: "2-digit",
        month: "long",
      });
      const arr = map.get(dia) ?? [];
      arr.push(c);
      map.set(dia, arr);
    }
    return Array.from(map.entries());
  }, [programadas]);

  if (programadas.length === 0) return null;

  return (
    <section className="rounded-xl border border-brand-orange/30 bg-brand-orange/5 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-brand-orange" />
        <h2 className="font-semibold">Agenda de programação</h2>
        <span className="text-xs text-muted-foreground">
          ({programadas.length} {programadas.length === 1 ? "campanha agendada" : "campanhas agendadas"})
        </span>
      </div>

      <div className="space-y-4">
        {grupos.map(([dia, lista]) => (
          <div key={dia}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{dia}</p>
            <div className="space-y-2">
              {lista.map((c) => {
                const when = new Date(c.scheduled_at!);
                const hora = when.toLocaleTimeString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const atrasada = when.getTime() < agora;
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border border-border bg-card p-3 flex items-center gap-3"
                  >
                    <div className="w-16 shrink-0 text-center">
                      <div className={`text-lg font-semibold ${atrasada ? "text-amber-500" : "text-brand-orange"}`}>
                        {hora}
                      </div>
                      {atrasada && <div className="text-[10px] text-amber-500 uppercase">atrasada</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.nome}</p>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                        <span>{c.destino_ids.length} destinos</span>
                        {c.destino_ids.slice(0, 3).map((id) => {
                          const d = destMap.get(id);
                          if (!d) return null;
                          return (
                            <span key={id}>
                              {d.tipo === "channel" ? "📢" : "👥"} {d.nome}
                            </span>
                          );
                        })}
                        {c.destino_ids.length > 3 && <span>+{c.destino_ids.length - 3}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onEdit(c.id)}
                        className="text-xs rounded-full border border-border px-3 py-1.5 hover:border-brand-orange"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onDisparar(c.id)}
                        className="inline-flex items-center gap-1 text-xs rounded-full bg-emerald-500/15 text-emerald-500 px-3 py-1.5 hover:bg-emerald-500/25"
                      >
                        <Send className="h-3 w-3" /> Enviar agora
                      </button>
                      <button
                        onClick={() => onCancelar(c.id)}
                        className="text-xs rounded-full border border-border px-3 py-1.5 hover:border-red-500 hover:text-red-500"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CampanhasList({
  campanhas,
  destinos,
  onEdit,
  onCancelar,
  onExcluir,
  onDisparar,
}: {
  campanhas: Campanha[];
  destinos: Destino[];
  onEdit: (id: string) => void;
  onCancelar: (id: string) => void;
  onExcluir: (id: string) => void;
  onDisparar: (id: string) => void;
}) {
  const destMap = useMemo(() => new Map(destinos.map((d) => [d.id, d])), [destinos]);
  if (campanhas.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
        Nenhuma campanha ainda. Crie a primeira em "Nova campanha".
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {campanhas.map((c) => (
        <div key={c.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{c.nome}</h3>
              <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${STATUS_COLOR[c.status]}`}>
                {STATUS_LABEL[c.status]}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span>{c.destino_ids.length} destinos</span>
              {c.scheduled_at && (
                <span>Agendada: {new Date(c.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
              )}
              {c.metrics && Object.keys(c.metrics).length > 0 && (
                <span>
                  ✓ {c.metrics.enviados ?? 0} · ✗ {c.metrics.falhas ?? 0}
                </span>
              )}
            </div>
            {c.destino_ids.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {c.destino_ids.slice(0, 5).map((id) => {
                  const d = destMap.get(id);
                  if (!d) return null;
                  return (
                    <span key={id} className="text-[10px] rounded bg-muted px-1.5 py-0.5">
                      {d.tipo === "channel" ? "📢" : "👥"} {d.nome}
                    </span>
                  );
                })}
                {c.destino_ids.length > 5 && (
                  <span className="text-[10px] text-muted-foreground">+{c.destino_ids.length - 5}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(c.status === "rascunho" || c.status === "agendada") && (
              <>
                <button onClick={() => onEdit(c.id)} className="text-xs rounded-full border border-border px-3 py-1.5 hover:border-brand-orange">
                  Editar
                </button>
                <button
                  onClick={() => onDisparar(c.id)}
                  className="inline-flex items-center gap-1 text-xs rounded-full bg-emerald-500/15 text-emerald-500 px-3 py-1.5 hover:bg-emerald-500/25"
                >
                  <Send className="h-3 w-3" /> Enviar agora
                </button>
              </>
            )}
            {(c.status === "rascunho" || c.status === "agendada") && (
              <button
                onClick={() => onCancelar(c.id)}
                className="text-xs rounded-full border border-border px-3 py-1.5 hover:border-red-500 hover:text-red-500"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={() => onExcluir(c.id)}
              className="rounded-full p-2 text-muted-foreground hover:text-red-500"
              title="Excluir"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DestinosList({ destinos, onChanged }: { destinos: Destino[]; onChanged: () => void }) {
  const [link, setLink] = useState("");
  const [adding, setAdding] = useState(false);
  const doAdd = useServerFn(adicionarDestinoPorLink);
  const doDel = useServerFn(excluirDestino);

  async function handleAdd() {
    const l = link.trim();
    if (!l) return;
    setAdding(true);
    try {
      const r = await doAdd({ data: { link: l } });
      toast.success(`Adicionado: ${r.destino.nome}`);
      setLink("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(d: Destino) {
    const ok = await confirm({
      title: "Remover destino?",
      description: `"${d.nome}" será removido da lista de disparos.`,
      confirmText: "Remover",
    });
    if (!ok) return;
    try {
      await doDel({ data: { id: d.id } });
      toast.success("Destino removido");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  }

  const grupos = destinos.filter((d) => d.tipo === "group");
  const canais = destinos.filter((d) => d.tipo === "channel");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <label className="text-sm font-medium mb-2 block">Adicionar por link</label>
        <p className="text-xs text-muted-foreground mb-3">
          Cole um convite de grupo (<code>chat.whatsapp.com/…</code>) ou canal (<code>whatsapp.com/channel/…</code>).
          O número conectado vai entrar/seguir automaticamente.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://chat.whatsapp.com/... ou https://whatsapp.com/channel/..."
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={adding}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !link.trim()}
            className="rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white disabled:opacity-50 flex items-center gap-2"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </button>
        </div>
      </div>

      {destinos.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          Nenhum destino ainda. Adicione por link acima ou clique em "Sincronizar destinos".
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <DestinoGroup title="Canais" icon={Radio} items={canais} onDelete={handleDelete} />
          <DestinoGroup title="Grupos" icon={Users} items={grupos} onDelete={handleDelete} />
        </div>
      )}
    </div>
  );
}

function DestinoGroup({ title, icon: Icon, items, onDelete }: { title: string; icon: typeof Users; items: Destino[]; onDelete: (d: Destino) => void }) {
  return (
    <div>
      <h3 className="font-medium flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-brand-orange" /> {title} <span className="text-xs text-muted-foreground">({items.length})</span>
      </h3>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-xs text-muted-foreground">Nenhum {title.toLowerCase()} sincronizado.</p>}
        {items.map((d) => (
          <div key={d.id} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{d.nome}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {d.participantes ? <span>{d.participantes} membros</span> : null}
                {d.is_admin && <span className="text-emerald-500">admin</span>}
                {!d.pode_postar && <span className="text-amber-500">só leitura</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDelete(d)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Remover"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== Editor ====================

function CampanhaEditor({
  id,
  presetDate,
  destinos,
  onClose,
  onSaved,
}: {
  id?: string;
  presetDate?: string;
  destinos: Destino[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [scheduled, setScheduled] = useState(presetDate ?? "");
  const [obs, setObs] = useState("");
  const [blocos, setBlocos] = useState<Bloco[]>([{ tipo: "text", texto: "" }]);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(id));
  const [showPicker, setShowPicker] = useState(false);

  const fetchOne = useServerFn(getCampanha);
  const doSalvar = useServerFn(salvarCampanha);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await fetchOne({ data: { id } });
        const c = r.campanha as Campanha | null;
        if (c) {
          setNome(c.nome);
          setSelecionados(new Set(c.destino_ids));
          if (c.scheduled_at) {
            const dt = new Date(c.scheduled_at);
            const iso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            setScheduled(iso);
          }
          setObs(c.observacoes_marketing ?? "");
        }
        const msgs = (r.mensagens ?? []) as Bloco[];
        if (msgs.length > 0) setBlocos(msgs);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar campanha");
      } finally {
        setLoadingEdit(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggleDest(destId: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(destId)) n.delete(destId);
      else n.add(destId);
      return n;
    });
  }

  function addBloco(tipo: Bloco["tipo"]) {
    setBlocos((b) => [...b, { tipo, texto: "" }]);
  }
  function removeBloco(i: number) {
    setBlocos((b) => b.filter((_, idx) => idx !== i));
  }
  function updateBloco(i: number, patch: Partial<Bloco>) {
    setBlocos((b) => b.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function salvar(status: "rascunho" | "agendada") {
    if (!nome.trim()) return toast.error("Dê um nome à campanha");
    if (selecionados.size === 0) return toast.error("Selecione ao menos um destino");
    if (blocos.length === 0) return toast.error("Adicione ao menos uma mensagem");
    if (status === "agendada" && !scheduled) return toast.error("Escolha data e horário");
    setSaving(true);
    try {
      const scheduled_at = scheduled ? new Date(scheduled).toISOString() : null;
      await doSalvar({
        data: {
          id,
          nome: nome.trim(),
          destino_ids: Array.from(selecionados),
          scheduled_at,
          observacoes_marketing: obs.trim() || null,
          status,
          mensagens: blocos,
        },
      });
      toast.success(status === "agendada" ? "Campanha agendada" : "Rascunho salvo");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const canais = destinos.filter((d) => d.tipo === "channel");
  const grupos = destinos.filter((d) => d.tipo === "group");

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-4xl bg-background border border-border rounded-2xl my-4">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-brand-orange" />
            {id ? "Editar campanha" : "Nova campanha"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadingEdit ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4 space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm">
                <span className="text-xs uppercase text-muted-foreground">Nome da campanha</span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Ex: Promoção Orlando Novembro"
                />
              </label>
              <label className="text-sm">
                <span className="text-xs uppercase text-muted-foreground">Agendar para (opcional, 09h-21h BRT)</span>
                <input
                  type="datetime-local"
                  value={scheduled}
                  onChange={(e) => setScheduled(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="text-sm block">
              <span className="text-xs uppercase text-muted-foreground">Observações internas (marketing)</span>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>

            {/* Destinos */}
            <div>
              <h3 className="text-sm font-medium mb-2">Destinos ({selecionados.size} selecionados)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <DestSelector title="Canais" icon={Radio} items={canais} sel={selecionados} onToggle={toggleDest} />
                <DestSelector title="Grupos" icon={Users} items={grupos} sel={selecionados} onToggle={toggleDest} />
              </div>
            </div>

            {/* Blocos */}
            <div>
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <h3 className="text-sm font-medium">Mensagens ({blocos.length} blocos)</h3>
                <div className="flex items-center gap-1 flex-wrap">
                  <button onClick={() => setShowPicker(true)} className="text-xs rounded-full bg-brand-orange/10 text-brand-orange px-3 py-1 hover:bg-brand-orange/20 inline-flex items-center gap-1 font-medium">
                    <Package className="h-3 w-3" /> Pacote pronto
                  </button>
                  <span className="text-xs text-muted-foreground px-1">·</span>
                  <button onClick={() => addBloco("text")} className="text-xs rounded-full border border-border px-3 py-1 hover:border-brand-orange">+ Texto</button>
                  <button onClick={() => addBloco("image")} className="text-xs rounded-full border border-border px-3 py-1 hover:border-brand-orange">+ Imagem</button>
                  <button onClick={() => addBloco("document")} className="text-xs rounded-full border border-border px-3 py-1 hover:border-brand-orange">+ PDF</button>
                  <button onClick={() => addBloco("video")} className="text-xs rounded-full border border-border px-3 py-1 hover:border-brand-orange">+ Vídeo</button>
                </div>
              </div>
              <div className="space-y-2">
                {blocos.map((b, i) => (
                  <BlocoEditor key={i} idx={i} bloco={b} onChange={(p) => updateBloco(i, p)} onRemove={() => removeBloco(i)} />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
              <button onClick={onClose} className="text-sm rounded-full border border-border px-4 py-2 hover:border-brand-orange">
                Fechar
              </button>
              <button
                onClick={() => salvar("rascunho")}
                disabled={saving}
                className="text-sm rounded-full border border-border px-4 py-2 hover:border-brand-orange disabled:opacity-50"
              >
                Salvar rascunho
              </button>
              <button
                onClick={() => salvar("agendada")}
                disabled={saving || !scheduled}
                className="text-sm rounded-full bg-brand-orange px-4 py-2 text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Agendar envio"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    {showPicker && (
      <PackagePicker
        onClose={() => setShowPicker(false)}
        onPick={(bloco) => {
          setBlocos((b) => [...b, bloco]);
          setShowPicker(false);
        }}
      />
    )}
    </>
  );
}

function PackagePicker({ onClose, onPick }: { onClose: () => void; onPick: (b: Bloco) => void }) {
  const [pacotes, setPacotes] = useState<{ id: string; slug: string; title: string; destination: string | null; origin: string | null; image_url: string | null; caption: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [search, setSearch] = useState("");
  const fetchPkgs = useServerFn(listPacotesProntos);

  async function load() {
    setLoading(true);
    try {
      const r = await fetchPkgs({ data: { origin: origin.trim() || undefined, destination: destination.trim() || undefined, search: search.trim() || undefined } });
      setPacotes(r.pacotes ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar pacotes");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-3xl bg-background border border-border rounded-2xl my-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="h-5 w-5 text-brand-orange" /> Selecionar pacote pronto
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 border-b border-border grid sm:grid-cols-3 gap-2">
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Origem (ex: Curitiba)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destino (ex: Orlando)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
          <div className="flex gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Título…" className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
            <button onClick={load} disabled={loading} className="rounded-md bg-brand-orange px-3 py-2 text-white text-sm disabled:opacity-50 inline-flex items-center gap-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && pacotes.length === 0 ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : pacotes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhum pacote encontrado com esses filtros.</p>
          ) : (
            pacotes.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick({ tipo: "image", midia_url: p.image_url ?? "", midia_caption: p.caption, texto: null, midia_filename: null })}
                className="w-full text-left rounded-lg border border-border bg-card p-3 hover:border-brand-orange flex gap-3 items-start"
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="h-16 w-16 rounded-md object-cover shrink-0" loading="lazy" />
                ) : (
                  <div className="h-16 w-16 rounded-md bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.origin ? `De ${p.origin} · ` : ""}{p.destination ?? ""}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1 whitespace-pre-line">
                    {p.caption.split("\n").slice(0, 3).join(" · ")}
                  </p>
                </div>
                <span className="text-xs text-brand-orange shrink-0 self-center">Inserir</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DestSelector({
  title,
  icon: Icon,
  items,
  sel,
  onToggle,
}: {
  title: string;
  icon: typeof Users;
  items: Destino[];
  sel: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="border border-border rounded-xl p-3 max-h-64 overflow-y-auto">
      <h4 className="text-xs uppercase text-muted-foreground flex items-center gap-1 mb-2">
        <Icon className="h-3 w-3" /> {title} ({items.length})
      </h4>
      {items.length === 0 && <p className="text-xs text-muted-foreground">Nenhum. Sincronize antes.</p>}
      <div className="space-y-1">
        {items.map((d) => (
          <label key={d.id} className="flex items-center gap-2 text-sm rounded-md p-1.5 hover:bg-muted cursor-pointer">
            <input
              type="checkbox"
              checked={sel.has(d.id)}
              onChange={() => onToggle(d.id)}
              disabled={!d.pode_postar}
            />
            <span className="flex-1 truncate">{d.nome}</span>
            {d.participantes ? <span className="text-[10px] text-muted-foreground">{d.participantes}</span> : null}
          </label>
        ))}
      </div>
    </div>
  );
}

function BlocoEditor({
  idx,
  bloco,
  onChange,
  onRemove,
}: {
  idx: number;
  bloco: Bloco;
  onChange: (p: Partial<Bloco>) => void;
  onRemove: () => void;
}) {
  const isMedia = bloco.tipo !== "text" && bloco.tipo !== "buttons";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase text-muted-foreground">
          #{idx + 1} · {bloco.tipo}
        </span>
        <button onClick={onRemove} className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {isMedia && (
        <input
          type="url"
          value={bloco.midia_url ?? ""}
          onChange={(e) => onChange({ midia_url: e.target.value })}
          placeholder="URL do arquivo (https://…)"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm mb-2"
        />
      )}
      {bloco.tipo === "document" && (
        <input
          value={bloco.midia_filename ?? ""}
          onChange={(e) => onChange({ midia_filename: e.target.value })}
          placeholder="Nome do arquivo (ex: promocao.pdf)"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm mb-2"
        />
      )}
      <textarea
        value={bloco.tipo === "text" ? (bloco.texto ?? "") : (bloco.midia_caption ?? bloco.texto ?? "")}
        onChange={(e) =>
          bloco.tipo === "text"
            ? onChange({ texto: e.target.value })
            : onChange({ midia_caption: e.target.value })
        }
        rows={bloco.tipo === "text" ? 4 : 2}
        placeholder={bloco.tipo === "text" ? "Escreva a mensagem…" : "Legenda (opcional)"}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      />
    </div>
  );
}
