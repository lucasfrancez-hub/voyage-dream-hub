import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Plus, Megaphone, Trash2, Send, X, Users, Radio } from "lucide-react";
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
} from "@/lib/broadcast/broadcast.functions";
import { confirm } from "@/lib/confirm";

export const Route = createFileRoute("/admin/disparos")({
  ssr: false,
  component: DisparosPage,
  head: () => ({
    meta: [
      { title: "Disparos WhatsApp — VIA AIR" },
      { name: "description", content: "Central de disparos em massa para canais e grupos WhatsApp da VIA AIR." },
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
  const [tab, setTab] = useState<"campanhas" | "destinos">("campanhas");
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showEditor, setShowEditor] = useState<null | { id?: string }>(null);

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
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-brand-orange" />
            Disparos WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Campanhas para canais e grupos gerenciados. Envio automático entre 09h e 21h.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:border-brand-orange disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar destinos
          </button>
          <button
            onClick={() => setShowEditor({})}
            className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nova campanha
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border">
        {(["campanhas", "destinos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 ${
              tab === t
                ? "border-brand-orange text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "campanhas" ? "Campanhas" : "Destinos"}{" "}
            <span className="text-xs opacity-60">
              ({t === "campanhas" ? campanhas.length : destinos.length})
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
          destinos={destinos}
          onClose={() => setShowEditor(null)}
          onSaved={() => { setShowEditor(null); load(); }}
        />
      )}
    </div>
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

function DestinosList({ destinos, onChanged: _onChanged }: { destinos: Destino[]; onChanged: () => void }) {
  if (destinos.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
        Nenhum destino sincronizado ainda. Clique em "Sincronizar destinos".
      </div>
    );
  }
  const grupos = destinos.filter((d) => d.tipo === "group");
  const canais = destinos.filter((d) => d.tipo === "channel");
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <DestinoGroup title="Canais" icon={Radio} items={canais} />
      <DestinoGroup title="Grupos" icon={Users} items={grupos} />
    </div>
  );
}

function DestinoGroup({ title, icon: Icon, items }: { title: string; icon: typeof Users; items: Destino[] }) {
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
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== Editor ====================

function CampanhaEditor({
  id,
  destinos,
  onClose,
  onSaved,
}: {
  id?: string;
  destinos: Destino[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [scheduled, setScheduled] = useState("");
  const [obs, setObs] = useState("");
  const [blocos, setBlocos] = useState<Bloco[]>([{ tipo: "text", texto: "" }]);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(id));

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
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Mensagens ({blocos.length} blocos)</h3>
                <div className="flex items-center gap-1">
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
