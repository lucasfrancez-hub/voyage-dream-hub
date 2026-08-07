import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Plus, Megaphone, Trash2, Send, X, Users, Radio, Package, Search, CalendarClock, ChevronLeft, ChevronRight, Instagram, Sparkles, Check, MapPin, Clock, FileDown, ChevronUp, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
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
  uploadBroadcastMedia,

} from "@/lib/broadcast/broadcast.functions";
import { aprovarSuggestion, descartarSuggestion, listSuggestions } from "@/lib/broadcast/suggestions.functions";
import { confirm } from "@/lib/confirm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

const BRT = "America/Sao_Paulo";
/** Chave de dia (YYYY-MM-DD) sempre no fuso de Brasília, independente do fuso do navegador. */
function brtDayKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BRT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
/** Rótulo do dia a partir de uma chave YYYY-MM-DD (sem reinterpretar fuso). */
function dayKeyLabel(key: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", opts);
}


type Destino = {
  id: string;
  jid: string;
  tipo: "channel" | "group" | "instagram_story" | "instagram_feed" | "instagram_reels";
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

type BroadcastSuggestion = {
  id: string;
  origin: string;
  destination: string;
  suggested_channels: string[];
  suggested_time: string | null;
  suggested_day: string | null;
  reasoning: string | null;
  status: "pending" | "approved" | "dismissed";
  packages: {
    id: string;
    title: string;
    image_url: string | null;
    price_per_person: number;
    going_date: string | null;
    nights: number | null;
  } | null;
};

type Bloco = {
  tipo: "text" | "image" | "video" | "document" | "buttons";
  texto?: string | null;
  midia_url?: string | null;
  midia_filename?: string | null;
  midia_caption?: string | null;
  botoes?: unknown;
  scheduled_at?: string | null;
  destino_ids?: string[] | null;
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
  const [tab, setTab] = useState<"calendario" | "sugestoes" | "campanhas" | "destinos">("calendario");
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [suggestions, setSuggestions] = useState<BroadcastSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showEditor, setShowEditor] = useState<null | { id?: string; presetDate?: string }>(null);

  const fetchCamp = useServerFn(listCampanhas);
  const fetchDest = useServerFn(listDestinos);
  const doSync = useServerFn(syncDestinos);
  const doCancelar = useServerFn(cancelarCampanha);
  const doExcluir = useServerFn(excluirCampanha);
  const doDisparar = useServerFn(dispararAgora);
  const fetchSuggestions = useServerFn(listSuggestions);
  const approveSuggestion = useServerFn(aprovarSuggestion);
  const dismissSuggestion = useServerFn(descartarSuggestion);
  const fetchCampanhaPdf = useServerFn(getCampanha);

  async function exportarPdf(id: string) {
    try {
      const r = await fetchCampanhaPdf({ data: { id } });
      const c = r.campanha as Campanha | null;
      if (!c) return toast.error("Campanha não encontrada");
      const { exportCampanhaPdf } = await import("@/lib/broadcast/campaign-pdf");
      const destMap = new Map(destinos.map((d) => [d.id, d]));
      await exportCampanhaPdf(
        {
          nome: c.nome,
          status: STATUS_LABEL[c.status] ?? c.status,
          scheduled_at: c.scheduled_at,
          sent_at: c.sent_at,
          observacoes_marketing: c.observacoes_marketing,
          metrics: c.metrics,
        },
        (r.mensagens ?? []) as Bloco[],
        c.destino_ids.map((did) => destMap.get(did)).filter(Boolean).map((d) => ({ nome: d!.nome, tipo: d!.tipo })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    }
  }


  async function load() {
    setLoading(true);
    try {
      const [c, d, s] = await Promise.all([fetchCamp(), fetchDest(), fetchSuggestions()]);
      setCampanhas((c.campanhas ?? []) as Campanha[]);
      setDestinos((d.destinos ?? []) as Destino[]);
      setSuggestions((s.suggestions ?? []) as unknown as BroadcastSuggestion[]);
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
      toast.success(`Sincronizado: ${r.groups} grupos, ${r.channels} canais, ${r.instagram} destinos Instagram`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na sincronização");
    } finally {
      setSyncing(false);
    }
  }

  async function approve(id: string, overrides?: { date?: string; time?: string; channel?: string }) {
    const ok = await confirm({
      title: "Aprovar sugestão?",
      description: "A campanha será criada como rascunho na data, horário e canal escolhidos. Você poderá revisar os destinos antes do envio.",
      confirmText: "Aprovar e criar campanha",
    });
    if (!ok) return;
    try {
      await approveSuggestion({ data: { id, ...overrides } });
      toast.success("Campanha criada");
      await load();
      setTab("campanhas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível aprovar");
    }
  }


  async function dismiss(id: string) {
    const ok = await confirm({
      title: "Descartar sugestão?",
      description: "Ela será removida das sugestões pendentes.",
      confirmText: "Descartar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await dismissSuggestion({ data: { id } });
      toast.success("Sugestão descartada");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível descartar");
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
        {(["calendario", "sugestoes", "campanhas", "destinos"] as const).map((t) => {
          const count =
            t === "calendario"
              ? campanhas.filter((c) => c.status === "agendada" && c.scheduled_at).length
              : t === "sugestoes"
              ? suggestions.filter((suggestion) => suggestion.status === "pending").length
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
              {t === "calendario" ? "Calendário" : t === "sugestoes" ? "Sugestões" : t === "campanhas" ? "Campanhas" : "Destinos"}
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
          <KanbanBoard
            campanhas={campanhas}
            destinos={destinos}
            onEditCampanha={(id) => setShowEditor({ id })}
            onGoDestinos={() => setTab("destinos")}
            onSync={sync}
            syncing={syncing}
          />
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
      ) : tab === "sugestoes" ? (
        <BroadcastSuggestions
          suggestions={suggestions.filter((suggestion) => suggestion.status === "pending")}
          onApprove={approve}
          onDismiss={dismiss}
        />
      ) : tab === "campanhas" ? (
        <CampanhasList
          campanhas={campanhas}
          destinos={destinos}
          onEdit={(id) => setShowEditor({ id })}
          onExportPdf={exportarPdf}

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

function resolveSuggestionDate(dayText: string | null, timeText: string | null) {
  const time = timeText || "10:00";
  const [hours = 10, minutes = 0] = time.split(":").map(Number);
  if (dayText && /^\d{4}-\d{2}-\d{2}$/.test(dayText)) {
    return new Date(`${dayText}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00-03:00`);
  }

  const normalized = (dayText || "").toLowerCase();
  const allowedDays = normalized.includes("terça") ? [2, 4] : normalized.includes("quarta") ? [3, 5] : [1, 2, 3, 4, 5];
  const now = new Date();
  for (let offset = 0; offset <= 14; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);
    if (allowedDays.includes(candidate.getDay()) && candidate.getTime() >= now.getTime() + 30 * 60 * 1000) return candidate;
  }
  return null;
}

function BroadcastSuggestions({
  suggestions,
  onApprove,
  onDismiss,
}: {
  suggestions: BroadcastSuggestion[];
  onApprove: (id: string, overrides?: { date?: string; time?: string; channel?: string }) => void;
  onDismiss: (id: string) => void;
}) {
  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-6 py-14 text-center">
        <Sparkles className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
        <p className="font-medium">Nenhuma sugestão pendente</p>
        <p className="mt-1 text-sm text-muted-foreground">As próximas recomendações aparecerão aqui com data e horário de envio.</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <h2 className="text-xl font-bold text-foreground">Sugestões</h2>
        <span className="px-2 py-0.5 bg-orange-100 text-brand-orange text-[10px] font-bold rounded-full uppercase tracking-tight">Recomendado</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {suggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} onApprove={onApprove} onDismiss={onDismiss} />
        ))}
      </div>
    </section>
  );
}

function SuggestionCard({
  suggestion,
  onApprove,
  onDismiss,
}: {
  suggestion: BroadcastSuggestion;
  onApprove: (id: string, overrides?: { date?: string; time?: string; channel?: string }) => void;
  onDismiss: (id: string) => void;
}) {
  const pkg = suggestion.packages;
  const recommendedAt = resolveSuggestionDate(suggestion.suggested_day, suggestion.suggested_time);
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(suggestion.suggested_day || "")
    ? (suggestion.suggested_day as string)
    : recommendedAt
      ? `${recommendedAt.getFullYear()}-${String(recommendedAt.getMonth() + 1).padStart(2, "0")}-${String(recommendedAt.getDate()).padStart(2, "0")}`
      : "";
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(suggestion.suggested_time || "10:00");
  const [channel, setChannel] = useState<string>(suggestion.suggested_channels[0] || "channel");

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {pkg?.image_url && (
        <img src={pkg.image_url} alt={pkg.title} className="h-32 w-full object-cover" loading="lazy" />
      )}
      <div className="border-b border-border/60 p-4">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span>{suggestion.origin}</span>
          <svg className="h-3 w-3 text-muted-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>{suggestion.destination}</span>
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-base font-bold text-foreground">{pkg?.title || suggestion.destination}</h3>
        {pkg && (
          <p className="mt-0.5 text-lg font-black text-brand-orange">
            R$ {Number(pkg.price_per_person).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
          </p>
        )}
      </div>
      <div className="flex-1 space-y-3 p-4">
        {suggestion.reasoning && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{suggestion.reasoning}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Data</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium outline-none transition-all focus:border-brand-orange focus:ring-2 focus:ring-orange-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Horário</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium outline-none transition-all focus:border-brand-orange focus:ring-2 focus:ring-orange-100" />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Canal</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium outline-none transition-all focus:border-brand-orange focus:ring-2 focus:ring-orange-100">
            <option value="channel">Canal de WhatsApp</option>
            <option value="group">Grupo de WhatsApp</option>
            <option value="instagram_story">Story do Instagram</option>
          </select>

        </label>
      </div>
      <div className="flex gap-2 border-t border-border/60 bg-muted/40 p-4">
        <button
          type="button"
          onClick={() => onDismiss(suggestion.id)}
          className="flex-1 rounded-xl border border-border bg-background py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={() => onApprove(suggestion.id, { date: date || undefined, time: time || undefined, channel })}
          className="flex-[2] rounded-xl bg-brand-orange py-2 text-xs font-bold text-white shadow-sm shadow-orange-200 transition-all hover:opacity-90 active:scale-95"
        >
          Aprovar
        </button>
      </div>
    </article>
  );
}




// ==================== Calendário estilo macOS ====================

function CalendarioMes({
  campanhas,
  destinos,
  onPickDay,
  onPickCampanha,
}: {
  campanhas: Campanha[];
  destinos: Destino[];
  onPickDay: (iso: string) => void;
  onPickCampanha: (id: string) => void;
}) {
  const hoje = new Date();
  const [cursor, setCursor] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [popoverIso, setPopoverIso] = useState<string | null>(null);


  const eventos = useMemo(() => {
    const map = new Map<string, Campanha[]>();
    for (const c of campanhas) {
      if (!c.scheduled_at) continue;
      if (c.status !== "agendada" && c.status !== "enviando" && c.status !== "concluida") continue;
      const key = brtDayKey(c.scheduled_at);
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

  const destMap = useMemo(() => new Map(destinos.map((d) => [d.id, d])), [destinos]);
  function campanhaTipo(c: Campanha): "channel" | "group" | "mixed" {
    let ch = 0, gr = 0;
    for (const id of c.destino_ids) {
      const d = destMap.get(id);
      if (d?.tipo === "channel") ch++;
      else if (d?.tipo === "group") gr++;
    }
    if (ch > 0 && gr === 0) return "channel";
    if (gr > 0 && ch === 0) return "group";
    return "mixed";
  }
  const chipCls: Record<"channel" | "group" | "mixed", string> = {
    channel: "bg-indigo-500/15 border-l-2 border-indigo-500 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/25",
    group: "bg-emerald-500/15 border-l-2 border-emerald-500 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25",
    mixed: "bg-brand-orange/15 border-l-2 border-brand-orange text-orange-700 dark:text-orange-300 hover:bg-brand-orange/25",
  };
  const modalItemCls: Record<"channel" | "group" | "mixed", string> = {
    channel: "bg-violet-50/60 border-l-4 border-violet-500 hover:bg-violet-50 text-violet-900",
    group: "bg-emerald-50/60 border-l-4 border-emerald-500 hover:bg-emerald-50 text-emerald-900",
    mixed: "bg-orange-50/60 border-l-4 border-brand-orange hover:bg-orange-50 text-orange-900",
  };
  const modalBadgeCls: Record<"channel" | "group" | "mixed", string> = {
    channel: "bg-violet-100 text-violet-700",
    group: "bg-emerald-100 text-emerald-700",
    mixed: "bg-orange-100 text-orange-700",
  };



  return (
    <section className="overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold capitalize">{mesLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}
            className="text-xs rounded-md border border-border px-3 py-1.5 hover:border-brand-orange"
          >
            Hoje
          </button>
          <div className="flex gap-1">
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="p-2 rounded-md border border-border hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="p-2 rounded-md border border-border hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <div className="px-5 py-4">
        <div className="grid grid-cols-7 gap-px bg-border border border-border rounded-lg overflow-hidden">
          {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
            <div key={d} className="bg-card p-2 text-center text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {d}
            </div>
          ))}
          {cells.map((cell, i) => {
            const evs = cell.iso ? eventos.get(cell.iso) ?? [] : [];
            const isToday = cell.date && isSameDay(cell.date, hoje);
            return (
              <div
                key={i}
                className={`relative min-h-[110px] p-1.5 text-xs transition-colors ${
                  cell.date
                    ? `bg-card cursor-pointer hover:bg-muted/40 ${isToday ? "ring-1 ring-inset ring-brand-orange/40" : ""}`
                    : "bg-muted/20"
                }`}
                onClick={() => cell.iso && setPopoverIso(cell.iso)}
              >
                {cell.date && (
                  <div className="flex items-center justify-between mb-1 px-0.5">
                    <span
                      className={`text-sm font-medium ${
                        isToday ? "text-brand-orange font-bold" : "text-foreground"
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {evs.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{evs.length}</span>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  {evs.slice(0, 3).map((c) => {
                    const tipo = campanhaTipo(c);
                    const hora = new Date(c.scheduled_at!).toLocaleTimeString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <div
                        key={c.id}
                        className={`rounded px-1.5 py-0.5 truncate ${chipCls[tipo]}`}
                        title={`${c.nome} — ${hora}`}
                      >
                        <p className="text-[10px] font-semibold truncate leading-tight">{c.nome}</p>
                        <p className="text-[9px] opacity-70 leading-tight">{hora} • {tipo === "channel" ? "CANAL" : tipo === "group" ? "GRUPO" : "MISTO"}</p>
                      </div>
                    );
                  })}
                  {evs.length > 3 && (
                    <p className="text-[9px] text-muted-foreground px-1">+{evs.length - 3} mais</p>
                  )}
                </div>
              </div>
            );
          })}

        </div>
      </div>

      <Dialog open={!!popoverIso} onOpenChange={(o) => { if (!o) setPopoverIso(null); }}>
        <DialogContent className="max-w-md !bg-card !backdrop-blur-none border-border shadow-2xl p-0 overflow-hidden">
          {popoverIso && (() => {
            const [y, m, d] = popoverIso.split("-").map(Number);
            const dt = new Date(y, m - 1, d);
            const evs = eventos.get(popoverIso) ?? [];
            const weekday = dt.toLocaleDateString("pt-BR", { weekday: "long" });
            const dayLabel = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
            return (
              <>
                <DialogHeader className="p-6 pb-4 border-b border-border">
                  <DialogTitle className="text-lg font-bold text-foreground capitalize">
                    {weekday}, {dayLabel}
                  </DialogTitle>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mt-1">
                    Cronograma de disparos
                  </p>
                </DialogHeader>
                <div className="p-4 max-h-[55vh] overflow-y-auto space-y-2">
                  {evs.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhuma campanha agendada para esse dia.
                    </p>
                  )}
                  {evs.map((c) => {
                    const hora = new Date(c.scheduled_at!).toLocaleTimeString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const tipo = campanhaTipo(c);
                    const tipoLabel = tipo === "channel" ? "Canal" : tipo === "group" ? "Grupo" : "Misto";
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setPopoverIso(null);
                          onPickCampanha(c.id);
                        }}
                        className={`w-full text-left rounded-xl p-3 transition-colors ${modalItemCls[tipo]}`}
                      >
                        <h3 className="text-sm font-semibold truncate">{c.nome}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${modalBadgeCls[tipo]}`}>{hora}</span>
                          <span className="text-[10px] font-medium opacity-80 uppercase tracking-wider">
                            {tipoLabel} • {c.destino_ids.length} destino{c.destino_ids.length > 1 ? "s" : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="p-4 bg-muted/40 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      const iso = popoverIso!;
                      setPopoverIso(null);
                      openDay(iso);
                    }}
                    className="w-full py-2.5 rounded-xl bg-brand-orange text-white text-sm font-bold hover:opacity-90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Nova campanha nesse dia
                  </button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </section>
  );
}



// ==================== Sidebar de próximos disparos (dentro do card do calendário) ====================

function AgendaSidebar({
  campanhas,
  destinos,
  onPick,
  onNew,
}: {
  campanhas: Campanha[];
  destinos: Destino[];
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  const destMap = useMemo(() => new Map(destinos.map((d) => [d.id, d])), [destinos]);
  const proximos = useMemo(
    () =>
      campanhas
        .filter((c) => c.status === "agendada" && c.scheduled_at)
        .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())
        .slice(0, 6),
    [campanhas],
  );

  function tipoDe(c: Campanha): "channel" | "group" | "mixed" {
    let ch = 0, gr = 0;
    for (const id of c.destino_ids) {
      const d = destMap.get(id);
      if (d?.tipo === "channel") ch++;
      else if (d?.tipo === "group") gr++;
    }
    if (ch > 0 && gr === 0) return "channel";
    if (gr > 0 && ch === 0) return "group";
    return "mixed";
  }

  const tagCls: Record<"channel" | "group" | "mixed", string> = {
    channel: "bg-indigo-500/10 text-indigo-400",
    group: "bg-emerald-500/10 text-emerald-400",
    mixed: "bg-brand-orange/10 text-brand-orange",
  };

  const hoje = new Date();
  const hojeKey = brtDayKey(hoje);
  const amanhaKey = brtDayKey(new Date(hoje.getTime() + 24 * 60 * 60 * 1000));
  function labelDia(dt: Date): string {
    const key = brtDayKey(dt);
    if (key === hojeKey) return "HOJE";
    if (key === amanhaKey) return "AMANHÃ";
    return dayKeyLabel(key, { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  }

  // Stats
  const stats = useMemo(() => {
    const agora = Date.now();
    const semana = 7 * 24 * 60 * 60 * 1000;
    let agendadas = 0, rascunhos = 0, enviadas7d = 0, falhas7d = 0;
    for (const c of campanhas) {
      if (c.status === "agendada") agendadas++;
      else if (c.status === "rascunho") rascunhos++;
      else if (c.status === "concluida" && c.sent_at && agora - new Date(c.sent_at).getTime() < semana) enviadas7d++;
      else if (c.status === "falhou" && c.sent_at && agora - new Date(c.sent_at).getTime() < semana) falhas7d++;
    }
    return { agendadas, rascunhos, enviadas7d, falhas7d };
  }, [campanhas]);

  // Coisas a fazer
  const tarefas = useMemo(() => {
    const t: Array<{ icon: typeof CalendarClock; label: string; count: number; tone: string }> = [];
    if (stats.rascunhos > 0) {
      t.push({ icon: CalendarClock, label: "Rascunhos sem agenda", count: stats.rascunhos, tone: "text-amber-400 bg-amber-500/10" });
    }
    const semSync = destinos.filter((d) => !d.ultima_sync || Date.now() - new Date(d.ultima_sync).getTime() > 7 * 24 * 60 * 60 * 1000).length;
    if (semSync > 0) {
      t.push({ icon: RefreshCw, label: "Destinos sem sync 7d+", count: semSync, tone: "text-sky-400 bg-sky-500/10" });
    }
    const semPermissao = destinos.filter((d) => d.ativo && !d.pode_postar).length;
    if (semPermissao > 0) {
      t.push({ icon: X, label: "Sem permissão de post", count: semPermissao, tone: "text-red-400 bg-red-500/10" });
    }
    if (stats.falhas7d > 0) {
      t.push({ icon: X, label: "Falhas nos últimos 7d", count: stats.falhas7d, tone: "text-red-400 bg-red-500/10" });
    }
    return t;
  }, [stats, destinos]);

  return (
    <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-muted/20 flex flex-col">
      {/* Stats */}
      <div className="p-5 border-b border-border">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Resumo
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Agendadas" value={stats.agendadas} tone="text-brand-orange" />
          <StatCard label="Rascunhos" value={stats.rascunhos} tone="text-amber-400" />
          <StatCard label="Enviadas 7d" value={stats.enviadas7d} tone="text-emerald-400" />
          <StatCard label="Falhas 7d" value={stats.falhas7d} tone="text-red-400" />
        </div>
      </div>

      {/* Próximos disparos */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Próximos disparos
          </h3>
          {proximos.length > 0 && (
            <span className="px-2 py-0.5 bg-brand-orange/10 text-brand-orange text-[10px] font-bold rounded">
              {proximos.length}
            </span>
          )}
        </div>

        <div className="space-y-3">
          {proximos.length === 0 ? (
            <div className="p-5 border border-dashed border-border rounded-xl text-center">
              <div className="w-9 h-9 bg-muted/60 rounded-full flex items-center justify-center mx-auto mb-2">
                <CalendarClock className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">Nada agendado</p>
              <button
                onClick={onNew}
                className="mt-2 text-[10px] font-bold text-brand-orange uppercase hover:underline"
              >
                Agendar novo
              </button>
            </div>
          ) : (
            proximos.map((c, idx) => {
              const dt = new Date(c.scheduled_at!);
              const hora = dt.toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
              });
              const tipo = tipoDe(c);
              return (
                <div key={c.id}>
                  <button
                    type="button"
                    onClick={() => onPick(c.id)}
                    className="group w-full text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {labelDia(dt)} • {hora}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase ${tagCls[tipo]}`}>
                        {tipo === "channel" ? "Canal" : tipo === "group" ? "Grupo" : "Misto"}
                      </span>
                    </div>
                    <h4 className="text-sm font-medium text-foreground group-hover:text-brand-orange transition-colors truncate">
                      {c.nome}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.destino_ids.length}{" "}
                      {c.destino_ids.length === 1 ? "destino" : "destinos"}
                    </p>
                  </button>
                  {idx < proximos.length - 1 && <div className="h-px bg-border mt-3" />}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Coisas a fazer */}
      <div className="p-5 flex-1">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Coisas a fazer
        </h3>
        {tarefas.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Tudo em dia ✨</div>
        ) : (
          <div className="space-y-2">
            {tarefas.map((t, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card/50">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center ${t.tone}`}>
                  <t.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{t.label}</p>
                </div>
                <span className="text-sm font-bold tabular-nums">{t.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-5 pt-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Janela de envio 09h — 21h (BRT)</span>
        </div>
      </div>
    </aside>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2.5">
      <div className={`text-xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}



// ==================== Kanban Board (dashboard de coisas a fazer) ====================

type KanbanCard = {
  key: string;
  title: string;
  subtitle?: string;
  meta?: string;
  onClick?: () => void;
};
type KanbanColumn = {
  key: string;
  title: string;
  hint: string;
  tone: string; // tailwind classes p/ acento
  cards: KanbanCard[];
  emptyLabel: string;
  action?: { label: string; onClick: () => void };
};

function KanbanBoard({
  campanhas,
  destinos,
  onEditCampanha,
  onGoDestinos,
  onSync,
  syncing,
}: {
  campanhas: Campanha[];
  destinos: Destino[];
  onEditCampanha: (id: string) => void;
  onGoDestinos: () => void;
  onSync: () => void;
  syncing: boolean;
}) {
  const columns = useMemo<KanbanColumn[]>(() => {
    const semana = 7 * 24 * 60 * 60 * 1000;
    const agora = Date.now();

    const rascunhos: KanbanCard[] = campanhas
      .filter((c) => c.status === "rascunho")
      .slice(0, 12)
      .map((c) => ({
        key: c.id,
        title: c.nome || "Sem nome",
        subtitle: `${c.destino_ids.length} destino${c.destino_ids.length === 1 ? "" : "s"}`,
        meta: new Date(c.created_at).toLocaleDateString("pt-BR"),
        onClick: () => onEditCampanha(c.id),
      }));

    const semSync: KanbanCard[] = destinos
      .filter((d) => !d.ultima_sync || agora - new Date(d.ultima_sync).getTime() > semana)
      .slice(0, 12)
      .map((d) => ({
        key: d.id,
        title: d.nome,
        subtitle: d.tipo === "channel" ? "Canal" : "Grupo",
        meta: d.ultima_sync
          ? `sync ${new Date(d.ultima_sync).toLocaleDateString("pt-BR")}`
          : "nunca sincronizado",
      }));

    const semPermissao: KanbanCard[] = destinos
      .filter((d) => d.ativo && !d.pode_postar)
      .slice(0, 12)
      .map((d) => ({
        key: d.id,
        title: d.nome,
        subtitle: d.tipo === "channel" ? "Canal" : "Grupo",
        meta: "sem permissão de postar",
      }));

    const falhas: KanbanCard[] = campanhas
      .filter((c) => c.status === "falhou" && c.sent_at && agora - new Date(c.sent_at).getTime() < semana)
      .slice(0, 12)
      .map((c) => ({
        key: c.id,
        title: c.nome || "Sem nome",
        subtitle: `${c.destino_ids.length} destino${c.destino_ids.length === 1 ? "" : "s"}`,
        meta: c.sent_at ? new Date(c.sent_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "",
        onClick: () => onEditCampanha(c.id),
      }));

    return [
      {
        key: "rascunhos",
        title: "Rascunhos",
        hint: "Sem agenda definida",
        tone: "border-amber-500/50 bg-amber-500/5 text-amber-400",
        cards: rascunhos,
        emptyLabel: "Sem rascunhos abertos",
      },
      {
        key: "sem-sync",
        title: "Sem sync 7d+",
        hint: "Destinos desatualizados",
        tone: "border-sky-500/50 bg-sky-500/5 text-sky-400",
        cards: semSync,
        emptyLabel: "Todos sincronizados",
        action: { label: syncing ? "Sincronizando…" : "Sincronizar agora", onClick: onSync },
      },
      {
        key: "sem-permissao",
        title: "Sem permissão",
        hint: "Bot não pode postar",
        tone: "border-red-500/50 bg-red-500/5 text-red-400",
        cards: semPermissao,
        emptyLabel: "Todos os destinos com permissão",
        action: semPermissao.length ? { label: "Abrir destinos", onClick: onGoDestinos } : undefined,
      },
      {
        key: "falhas",
        title: "Falhas 7d",
        hint: "Campanhas com erro",
        tone: "border-rose-500/50 bg-rose-500/5 text-rose-400",
        cards: falhas,
        emptyLabel: "Nenhuma falha recente",
      },
    ];
  }, [campanhas, destinos, onEditCampanha, onGoDestinos, onSync, syncing]);

  return (
    <section className="rounded-2xl border border-border bg-card/50 overflow-hidden">
      <header className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Coisas a fazer</h2>
          <p className="text-xs text-muted-foreground">Painel operacional — cada coluna é um problema a resolver.</p>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {columns.reduce((a, c) => a + c.cards.length, 0)} pendências
        </span>
      </header>
      <div className="p-4 overflow-x-auto">
        <div className="flex gap-3 min-w-max lg:grid lg:grid-cols-4 lg:min-w-0">
          {columns.map((col) => (
            <div
              key={col.key}
              className="w-72 lg:w-auto flex-shrink-0 rounded-xl border border-border bg-background/40 flex flex-col"
            >
              <div className={`px-3 py-2.5 border-b border-border flex items-center justify-between rounded-t-xl ${col.tone}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide truncate">{col.title}</h3>
                    <span className="text-[10px] font-bold rounded-full bg-background/60 px-1.5 py-0.5 tabular-nums">
                      {col.cards.length}
                    </span>
                  </div>
                  <p className="text-[10px] opacity-70 truncate">{col.hint}</p>
                </div>
              </div>
              <div className="p-2 space-y-2 flex-1 min-h-[80px]">
                {col.cards.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-muted-foreground italic">
                    {col.emptyLabel}
                  </div>
                ) : (
                  col.cards.map((card) => (
                    <button
                      key={card.key}
                      type="button"
                      onClick={card.onClick}
                      disabled={!card.onClick}
                      className="w-full text-left rounded-lg bg-card border border-border px-3 py-2 hover:border-brand-orange transition-colors disabled:cursor-default disabled:hover:border-border"
                    >
                      <p className="text-xs font-semibold truncate">{card.title}</p>
                      {card.subtitle && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{card.subtitle}</p>
                      )}
                      {card.meta && (
                        <p className="text-[10px] text-muted-foreground/70 mt-1 tabular-nums">{card.meta}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
              {col.action && (
                <div className="p-2 border-t border-border">
                  <button
                    onClick={col.action.onClick}
                    className="w-full text-[11px] font-semibold text-brand-orange hover:bg-brand-orange/10 py-1.5 rounded-md"
                  >
                    {col.action.label}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
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
      const key = brtDayKey(c.scheduled_at!);
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([key, lista]) => [
      dayKeyLabel(key, { weekday: "short", day: "2-digit", month: "long", year: "numeric" }),
      lista,
    ] as [string, Campanha[]]);
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
  onExportPdf,
  onCancelar,
  onExcluir,
  onDisparar,
}: {
  campanhas: Campanha[];
  destinos: Destino[];
  onEdit: (id: string) => void;
  onExportPdf: (id: string) => void;
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
            <button
              onClick={() => onExportPdf(c.id)}
              className="inline-flex items-center gap-1 text-xs rounded-full border border-border px-3 py-1.5 hover:border-brand-orange"
              title="Exportar relatório em PDF"
            >
              <FileDown className="h-3 w-3" /> PDF
            </button>

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
  const igTodos = destinos.filter((d) => d.tipo.startsWith("instagram_"));

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
        <div className="grid md:grid-cols-3 gap-6">
          <DestinoGroup title="Canais" icon={Radio} items={canais} onDelete={handleDelete} />
          <DestinoGroup title="Grupos" icon={Users} items={grupos} onDelete={handleDelete} />
          <DestinoGroup title="Instagram" icon={Instagram} items={igTodos} onDelete={handleDelete} />
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
  function moveBloco(i: number, dir: -1 | 1) {
    setBlocos((b) => {
      const j = i + dir;
      if (j < 0 || j >= b.length) return b;
      const copy = [...b];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  async function salvar(status: "rascunho" | "agendada") {
    if (!nome.trim()) return toast.error("Dê um nome à campanha");
    if (selecionados.size === 0) return toast.error("Selecione ao menos um destino");
    if (blocos.length === 0) return toast.error("Adicione ao menos uma mensagem");
    if (status === "agendada" && !scheduled) return toast.error("Escolha data e horário");
    if (status === "agendada" && scheduled) {
      const alvo = new Date(scheduled).getTime();
      if (alvo > Date.now() + 180 * 24 * 60 * 60 * 1000) {
        return toast.error(
          `Data muito distante (${new Date(scheduled).toLocaleDateString("pt-BR")}). Confira o ano antes de agendar.`,
        );
      }
    }
    setSaving(true);
    try {
      // Se algum bloco tem horário próprio anterior ao geral, a campanha começa nele.
      const horariosBlocos = blocos.map((b) => b.scheduled_at).filter(Boolean) as string[];
      const base = scheduled ? new Date(scheduled).toISOString() : null;
      const scheduled_at = [base, ...horariosBlocos].filter(Boolean).sort()[0] ?? null;

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
  const igStories = destinos.filter((d) => d.tipo === "instagram_story");
  const igFeeds = destinos.filter((d) => d.tipo === "instagram_feed");
  const igReels = destinos.filter((d) => d.tipo === "instagram_reels");
  const destinosSelecionados = destinos.filter((d) => selecionados.has(d.id));
  const somenteCanais = destinosSelecionados.length > 0 && destinosSelecionados.every((d) => d.tipo === "channel");

  useEffect(() => {
    if (!somenteCanais) return;
    setBlocos((atuais) => atuais.filter((bloco) => bloco.tipo !== "image" && bloco.tipo !== "video"));
  }, [somenteCanais]);

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="w-full max-w-4xl bg-background border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-background rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 rounded-full bg-brand-orange" />
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-brand-orange" />
                {id ? "Editar campanha" : "Nova campanha"}
              </h2>
              <p className="text-xs text-muted-foreground">{id ? "Ajuste os blocos e destinos." : "Monte a mensagem e escolha para onde disparar."}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const { exportCampanhaPdf } = await import("@/lib/broadcast/campaign-pdf");
              const t = toast.loading("Gerando PDF…");
              try {
              await exportCampanhaPdf(
                {
                  nome: nome.trim() || "Campanha sem nome",
                  status: id ? "Em edição" : "Rascunho (não salvo)",
                  scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
                  observacoes_marketing: obs.trim() || null,
                },
                blocos,
                destinos.filter((d) => selecionados.has(d.id)).map((d) => ({ nome: d.nome, tipo: d.tipo })),
              );
                toast.dismiss(t);
              } catch (e) {
                toast.dismiss(t);
                toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
              }
            }}
            className="inline-flex items-center gap-1 text-xs rounded-full border border-border px-3 py-1.5 hover:border-brand-orange"
            title="Exportar relatório em PDF"
          >
            <FileDown className="h-3.5 w-3.5" /> PDF
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted">

            <X className="h-4 w-4" />
          </button>
          </div>
        </div>


        {loadingEdit ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-5 space-y-5 overflow-y-auto flex-1">
            {/* Secão 1: identificação */}
            <section className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <span className="inline-flex w-5 h-5 rounded-full bg-brand-orange/15 text-brand-orange items-center justify-center text-[10px] font-black">1</span>
                Identificação
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="text-[11px] uppercase text-muted-foreground font-medium">Nome da campanha</span>
                  <input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand-orange focus:outline-none"
                    placeholder="Ex: Promoção Orlando Novembro"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-[11px] uppercase text-muted-foreground font-medium">Agendar para (09h-21h BRT)</span>
                  <input
                    type="datetime-local"
                    value={scheduled}
                    onChange={(e) => setScheduled(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand-orange focus:outline-none"
                  />
                </label>
              </div>
              <label className="text-sm block">
                <span className="text-[11px] uppercase text-muted-foreground font-medium">Observações internas (marketing)</span>
                <textarea
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand-orange focus:outline-none"
                  placeholder="Contexto interno, referências, campanha-mãe…"
                />
              </label>
            </section>

            {/* Secão 2: destinos */}
            <section className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <span className="inline-flex w-5 h-5 rounded-full bg-brand-orange/15 text-brand-orange items-center justify-center text-[10px] font-black">2</span>
                  Onde publicar
                </div>
                <span className="text-[11px] font-semibold text-brand-orange">{selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"}</span>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Selecione todos os canais da campanha — WhatsApp e Instagram juntos. Depois, se quiser, cada mensagem pode ir só para alguns deles.
              </p>

              <div className="grid md:grid-cols-2 gap-3">
                <DestSelector title="Canais WhatsApp" icon={Radio} items={canais} sel={selecionados} onToggle={toggleDest} />
                <DestSelector title="Grupos WhatsApp" icon={Users} items={grupos} sel={selecionados} onToggle={toggleDest} />
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <DestSelector title="IG Publicação" icon={Instagram} items={igFeeds} sel={selecionados} onToggle={toggleDest} />
                <DestSelector title="IG Reels" icon={Instagram} items={igReels} sel={selecionados} onToggle={toggleDest} />
                <DestSelector title="IG Story" icon={Instagram} items={igStories} sel={selecionados} onToggle={toggleDest} />
              </div>
              <p className="text-[11px] text-pink-500">
                📸 Instagram publica só blocos de mídia: <b>imagem</b> no feed/story e <b>vídeo</b> no Reels/story. Texto e PDF são ignorados por lá.
              </p>
            </section>



            {/* Secão 3: mensagens */}
            <section className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <span className="inline-flex w-5 h-5 rounded-full bg-brand-orange/15 text-brand-orange items-center justify-center text-[10px] font-black">3</span>
                  Mensagens
                  <span className="text-muted-foreground font-normal normal-case tracking-normal">({blocos.length} bloco{blocos.length === 1 ? "" : "s"})</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <button onClick={() => setShowPicker(true)} className="text-xs rounded-full bg-brand-orange text-white px-3 py-1.5 hover:opacity-90 inline-flex items-center gap-1 font-semibold shadow-sm shadow-brand-orange/30">
                    <Package className="h-3 w-3" /> Pacote pronto
                  </button>
                  <span className="text-muted-foreground/40 px-1">·</span>
                  <button onClick={() => addBloco("text")} className="text-xs rounded-full border border-border px-3 py-1.5 hover:border-brand-orange">+ Texto</button>
                  {!somenteCanais && <button onClick={() => addBloco("image")} className="text-xs rounded-full border border-border px-3 py-1.5 hover:border-brand-orange">+ Imagem</button>}
                  <button onClick={() => addBloco("document")} className="text-xs rounded-full border border-border px-3 py-1.5 hover:border-brand-orange">+ PDF</button>
                  {!somenteCanais && <button onClick={() => addBloco("video")} className="text-xs rounded-full border border-border px-3 py-1.5 hover:border-brand-orange">+ Vídeo</button>}
                </div>
              </div>
              {blocos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-8 text-center">
                  <Package className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Adicione um <button onClick={() => setShowPicker(true)} className="text-brand-orange font-semibold hover:underline">pacote pronto</button> ou blocos manuais.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blocos.map((b, i) => (
                    <BlocoEditor
                      key={i}
                      idx={i}
                      total={blocos.length}
                      bloco={b}
                      onChange={(p) => updateBloco(i, p)}
                      onRemove={() => removeBloco(i)}
                      onMove={(dir) => moveBloco(i, dir)}
                    />
                  ))}
                </div>
              )}
            </section>

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
                className="text-sm rounded-full bg-brand-orange px-5 py-2 text-white font-semibold hover:opacity-90 disabled:opacity-50 shadow-lg shadow-brand-orange/25 inline-flex items-center gap-1"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5" /> Agendar disparo</>}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
    {showPicker && (
      <PackagePicker
        includeImage={!somenteCanais}
        onClose={() => setShowPicker(false)}
        onPick={(blocosNovos) => {
          setBlocos((b) => [...b, ...blocosNovos]);
          setShowPicker(false);
        }}
      />
    )}
    </>
  );
}

function PackagePicker({ includeImage, onClose, onPick }: { includeImage: boolean; onClose: () => void; onPick: (b: Bloco[]) => void }) {
  const [pacotes, setPacotes] = useState<{ id: string; slug: string; title: string; destination: string | null; origin: string | null; image_url: string | null; caption: string; price_per_person: number | null; going_date: string | null; return_date: string | null; nights: number | null }[]>([]);
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

  function insert(p: typeof pacotes[number]) {
    const blocos: Bloco[] = [];
    if (includeImage && p.image_url) {
      // Imagem + legenda no MESMO bloco — WhatsApp envia como uma única mensagem
      blocos.push({ tipo: "image", midia_url: p.image_url, midia_caption: p.caption, texto: null, midia_filename: null });
    } else {
      blocos.push({ tipo: "text", texto: p.caption, midia_url: null, midia_caption: null, midia_filename: null });
    }
    onPick(blocos);
  }


  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-4xl bg-background border border-border rounded-2xl my-4 flex flex-col max-h-[90vh] shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-brand-orange/10 to-transparent">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Package className="h-5 w-5 text-brand-orange" /> Selecionar pacote pronto
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {includeImage ? "Insere imagem + legenda formatada (editável)." : "Para canais, insere somente o texto com preview do link."}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 border-b border-border grid sm:grid-cols-3 gap-2">
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Origem (ex: Curitiba)" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destino (ex: Orlando)" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
          <div className="flex gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Título ou slug…" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
            <button onClick={load} disabled={loading} className="rounded-lg bg-brand-orange px-3 py-2 text-white text-sm disabled:opacity-50 inline-flex items-center gap-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid content-start items-start auto-rows-max sm:grid-cols-2 gap-3">
          {loading && pacotes.length === 0 ? (
            <div className="col-span-full py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : pacotes.length === 0 ? (
            <p className="col-span-full text-sm text-muted-foreground text-center py-12">Nenhum pacote encontrado com esses filtros.</p>
          ) : (
            pacotes.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => insert(p)}
                className="flex min-h-[246px] flex-col w-full text-left rounded-xl border border-border bg-card overflow-hidden hover:border-brand-orange hover:shadow-lg transition-all group"
              >
                <div className="relative w-full h-40 bg-muted flex-shrink-0">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><Package className="h-8 w-8" /></div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-xs font-mono text-white/80 truncate">/{p.slug}</p>
                  </div>
                </div>
                <div className="p-3 flex-1 flex flex-col gap-1">
                  <p className="text-sm font-semibold truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.origin ? `De ${p.origin} · ` : ""}{p.destination ?? ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {(() => {
                      const dd = (s: string | null) => {
                        if (!s) return null;
                        try {
                          const d = new Date(s + "T12:00:00");
                          return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
                        } catch { return null; }
                      };
                      const d1 = dd(p.going_date);
                      const d2 = dd(p.return_date);
                      return d1 && d2 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                          🗓️ {d1} a {d2}{p.nights ? ` · ${p.nights}n` : ""}
                        </span>
                      ) : null;
                    })()}
                    {p.price_per_person ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 text-[11px] font-semibold">
                        R$ {p.price_per_person.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/pp
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-auto pt-2 flex items-center justify-end">
                    <span className="text-[11px] font-bold text-brand-orange uppercase tracking-wide inline-flex items-center gap-1">
                      Inserir <Plus className="h-3 w-3" />
                    </span>
                  </div>
                </div>
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

function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function BlocoEditor({
  idx,
  total,
  bloco,
  onChange,
  onRemove,
  onMove,
}: {
  idx: number;
  total: number;
  bloco: Bloco;
  onChange: (p: Partial<Bloco>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const isMedia = bloco.tipo !== "text" && bloco.tipo !== "buttons";
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const doUpload = useServerFn(uploadBroadcastMedia);

  const accept =
    bloco.tipo === "image" ? "image/*" : bloco.tipo === "video" ? "video/*" : "application/pdf";

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) {
        bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      }
      const r = await doUpload({
        data: { filename: file.name, contentType: file.type || "application/octet-stream", dataBase64: btoa(bin) },
      });
      onChange({ midia_url: r.url, midia_filename: bloco.tipo === "document" ? r.filename : bloco.midia_filename });
      toast.success("Arquivo enviado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  const caption = bloco.tipo === "text" ? (bloco.texto ?? "") : (bloco.midia_caption ?? bloco.texto ?? "");
  const setCaption = (v: string) =>
    bloco.tipo === "text" ? onChange({ texto: v }) : onChange({ midia_caption: v });

  return (
    <div className="group rounded-xl border border-border bg-card transition-colors hover:border-brand-orange/40">
      {/* barra do bloco */}
      <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <button
              onClick={() => onMove(-1)}
              disabled={idx === 0}
              title="Mover para cima"
              className="p-0.5 text-muted-foreground hover:text-brand-orange disabled:opacity-25"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onMove(1)}
              disabled={idx === total - 1}
              title="Mover para baixo"
              className="p-0.5 text-muted-foreground hover:text-brand-orange disabled:opacity-25"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            #{idx + 1} · {bloco.tipo}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <input
              type="datetime-local"
              value={toLocalInput(bloco.scheduled_at)}
              onChange={(e) =>
                onChange({ scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
              title="Horário específico deste bloco (opcional)"
              className="bg-transparent text-[11px] outline-none"
            />
          </label>
          <button onClick={onRemove} title="Excluir bloco" className="rounded-full p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* corpo */}
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {isMedia && (
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-32">
            {bloco.tipo === "image" && bloco.midia_url ? (
              <img
                src={bloco.midia_url}
                alt="Prévia da mídia da campanha"
                className="aspect-[3/4] w-full rounded-lg border border-border object-cover"
              />
            ) : (
              <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                sem mídia
              </div>
            )}
            <label className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-brand-orange px-2 py-1.5 text-[10px] font-bold uppercase tracking-tight text-brand-orange hover:bg-brand-orange/5 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {uploading ? "Enviando…" : "Enviar arquivo"}
              <input
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void handleFile(f);
                }}
              />
            </label>
            {bloco.midia_url && (
              <a href={bloco.midia_url} target="_blank" rel="noreferrer" className="text-center text-[9px] font-medium text-muted-foreground hover:text-brand-orange">
                arquivo anexado
              </a>
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {isMedia && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-tight text-muted-foreground">URL da mídia</label>
              <input
                type="url"
                value={bloco.midia_url ?? ""}
                onChange={(e) => onChange({ midia_url: e.target.value })}
                placeholder="ou cole a URL do arquivo (https://…)"
                className="w-full truncate rounded-md border border-border bg-muted/40 px-3 py-1.5 text-[11px]"
              />
            </div>
          )}
          {bloco.tipo === "document" && (
            <input
              value={bloco.midia_filename ?? ""}
              onChange={(e) => onChange({ midia_filename: e.target.value })}
              placeholder="Nome do arquivo (ex: promocao.pdf)"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          )}

          <div className="flex flex-1 flex-col">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
                {bloco.tipo === "text" ? "Mensagem" : "Legenda da mensagem"}
              </label>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-orange hover:underline"
              >
                {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                {expanded ? "Reduzir" : "Expandir"}
              </button>
            </div>
            <div className="rounded-xl border border-border bg-[#DCF8C6]/15 p-3 shadow-sm focus-within:border-brand-orange/50">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={bloco.tipo === "text" ? "Escreva a mensagem…" : "Legenda (opcional)"}
                className={`w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 ${expanded ? "min-h-[420px]" : "min-h-[140px]"}`}
              />
              <div className="mt-2 flex items-center justify-between border-t border-black/5 pt-2">
                <span className="text-[10px] text-muted-foreground">*negrito* · _itálico_</span>
                <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {caption.length} / 1024
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
