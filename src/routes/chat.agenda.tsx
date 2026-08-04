import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlignLeft,
  Bell,
  CalendarDays,
  Check,
  Clock,
  Copy,
  Link as LinkIcon,
  MapPin,
  UserRound,
  Users,
  Video,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Star,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirm } from "@/lib/confirm";
import {
  ajustarContaAgenda,
  atualizarCompromisso,
  conectarCalendario,
  conectarGoogleAgenda,
  criarCompromisso,
  desconectarCalendario,
  excluirCompromisso,
  listarCalendariosGoogleFn,
  listarCompromissos,
  listarContasAgenda,
  sincronizarCalendario,
  testarCalendario,
  verificarConflitos,
} from "@/lib/calendar.functions";
import { criarLinkAgenda, listarLinksAgenda, removerLinkAgenda } from "@/lib/calendar-app.functions";

export const Route = createFileRoute("/chat/agenda")({
  ssr: false,
  component: AgendaPage,
  head: () => ({
    meta: [
      { title: "Minha Agenda — VIA AIR Chat" },
      {
        name: "description",
        content: "Agenda unificada da VIA AIR com Google Agenda, Titan e iCloud em um só painel.",
      },
      { property: "og:title", content: "Minha Agenda — VIA AIR Chat" },
      { property: "og:description", content: "Compromissos do Google, Titan e iCloud reunidos com aviso de conflito." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Provedor = "titan" | "icloud" | "google";

type Conta = {
  id: string;
  provider: Provedor;
  nome: string;
  cor: string;
  email: string | null;
  calendarioNome: string | null;
  ativo: boolean;
  visivel: boolean;
  padrao: boolean;
  ultimaSync: string | null;
  ultimoErro: string | null;
};

type Participante = { nome?: string | null; email?: string | null; resposta?: string | null; organizador?: boolean };

type DetalhesEvento = {
  url?: string | null;
  conferencia?: string | null;
  organizador?: Participante | null;
  criador?: Participante | null;
  participantes?: Participante[];
  lembretes?: string[];
  recorrencia?: string | null;
  fusoHorario?: string | null;
  visibilidade?: string | null;
  disponibilidade?: string | null;
  calendario?: string | null;
  meuStatus?: string | null;
};

type Evento = {
  id: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  provider: string;
  account_id: string | null;
  origem: string;
  situacao?: string;
  detalhes?: DetalhesEvento | null;
};

const BRT = "America/Sao_Paulo";

const ROTULO: Record<Provedor, string> = {
  google: "Google Agenda",
  titan: "Titan (VIA AIR)",
  icloud: "iCloud",
};

function diaKey(v: string | Date): string {
  const d = typeof v === "string" ? new Date(v) : v;
  return new Intl.DateTimeFormat("en-CA", { timeZone: BRT, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function hora(v: string): string {
  return new Date(v).toLocaleTimeString("pt-BR", { timeZone: BRT, hour: "2-digit", minute: "2-digit" });
}

function inicioDoMes(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth(), 1);
}

/** Converte "2026-08-05T14:30" (horário de Brasília) para ISO UTC. */
function brtParaIso(local: string): string {
  return new Date(`${local}:00-03:00`).toISOString();
}

/** ISO → valor de <input type="datetime-local"> no fuso de Brasília. */
function isoParaInput(iso: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return `${p['year']}-${p['month']}-${p['day']}T${p['hour'] === "24" ? "00" : p['hour']}:${p['minute']}`;
}

function AgendaPage() {
  const carregarContas = useServerFn(listarContasAgenda);
  const carregarEventos = useServerFn(listarCompromissos);
  const sincronizar = useServerFn(sincronizarCalendario);
  const ajustar = useServerFn(ajustarContaAgenda);
  const remover = useServerFn(desconectarCalendario);
  const apagarEvento = useServerFn(excluirCompromisso);

  const [contas, setContas] = useState<Conta[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [detalhe, setDetalhe] = useState<Evento | null>(null);
  const [editar, setEditar] = useState<Evento | null>(null);

  const [mes, setMes] = useState(() => inicioDoMes(new Date()));
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [conectar, setConectar] = useState<Provedor | null>(null);
  const [novo, setNovo] = useState(false);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const de = new Date(mes.getFullYear(), mes.getMonth() - 1, 1).toISOString();
      const ate = new Date(mes.getFullYear(), mes.getMonth() + 2, 0, 23, 59).toISOString();
      const [c, e] = await Promise.all([carregarContas(), carregarEventos({ data: { de, ate } })]);
      setContas(c as Conta[]);
      setEventos(e as Evento[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui carregar a agenda.");
    } finally {
      setCarregando(false);
    }
  }, [carregarContas, carregarEventos, mes]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const contaPorId = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);
  const ocultas = useMemo(() => new Set(contas.filter((c) => !c.visivel).map((c) => c.id)), [contas]);
  const visiveis = useMemo(
    () => eventos.filter((e) => !e.account_id || !ocultas.has(e.account_id)),
    [eventos, ocultas],
  );

  const porDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>();
    for (const e of visiveis) {
      const k = diaKey(e.inicio);
      const lista = mapa.get(k) ?? [];
      lista.push(e);
      mapa.set(k, lista);
    }
    return mapa;
  }, [visiveis]);

  const dias = useMemo(() => {
    const primeiro = inicioDoMes(mes);
    const offset = primeiro.getDay();
    const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const celulas: Array<Date | null> = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= total; d += 1) celulas.push(new Date(mes.getFullYear(), mes.getMonth(), d));
    while (celulas.length % 7 !== 0) celulas.push(null);
    return celulas;
  }, [mes]);

  const hoje = diaKey(new Date());

  async function sincronizarTudo() {
    setSincronizando(true);
    try {
      const r = (await sincronizar()) as { total: number; erro?: string };
      if (r.erro) toast.warning(r.erro);
      else toast.success(`${r.total} compromisso(s) sincronizado(s).`);
      await recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao sincronizar.");
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <CalendarDays className="h-5 w-5 text-primary" />
        <div className="mr-auto">
          <h1 className="text-lg font-semibold text-foreground">Minha Agenda</h1>
          <p className="text-xs text-muted-foreground">Google, Titan e iCloud reunidos em um painel só.</p>
        </div>
        <Button variant="outline" size="sm" onClick={sincronizarTudo} disabled={sincronizando}>
          {sincronizando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Sincronizar
        </Button>
        <Button size="sm" onClick={() => setNovo(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo compromisso
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-5 lg:flex-row">
        {/* Coluna das agendas */}
        <aside className="w-full shrink-0 space-y-4 lg:w-72">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Agendas conectadas</h2>
            {contas.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma agenda conectada ainda.</p>
            )}
            <ul className="space-y-2">
              {contas.map((c) => (
                <li key={c.id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={c.visivel ? "Ocultar agenda" : "Mostrar agenda"}
                      onClick={async () => {
                        await ajustar({ data: { id: c.id, visivel: !c.visivel } });
                        void recarregar();
                      }}
                      className="flex h-4 w-4 items-center justify-center rounded-[4px] border"
                      style={{ borderColor: c.cor, background: c.visivel ? c.cor : "transparent" }}
                    >
                      {c.visivel && <Check className="h-3 w-3 text-white" />}
                    </button>
                    <span className="flex-1 truncate text-sm text-foreground">{c.nome}</span>
                    <button
                      type="button"
                      aria-label="Definir como agenda padrão"
                      onClick={async () => {
                        await ajustar({ data: { id: c.id, padrao: true } });
                        void recarregar();
                      }}
                    >
                      <Star
                        className={`h-4 w-4 ${c.padrao ? "fill-primary text-primary" : "text-muted-foreground"}`}
                      />
                    </button>
                    <button
                      type="button"
                      aria-label="Remover agenda"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Remover agenda?",
                          description: `Os compromissos de "${c.nome}" saem do painel. Nada é apagado no ${ROTULO[c.provider]}.`,
                        });
                        if (!ok) return;
                        await remover({ data: { id: c.id } });
                        toast.success("Agenda removida do painel.");
                        void recarregar();
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                  <p className="mt-1 pl-6 text-[11px] text-muted-foreground">
                    {ROTULO[c.provider]}
                    {c.email ? ` · ${c.email}` : ""}
                    {c.calendarioNome ? ` · ${c.calendarioNome}` : ""}
                  </p>
                  {c.ultimoErro && (
                    <p className="mt-1 pl-6 text-[11px] text-destructive">{c.ultimoErro}</p>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-2">
              <Button variant="outline" size="sm" className="w-full" onClick={() => setConectar("google")}>
                <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ background: "#2563EB" }} /> Conectar Google
              </Button>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setConectar("titan")}>
                <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ background: "#F26B1F" }} /> Conectar Titan
              </Button>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setConectar("icloud")}>
                <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ background: "#16A34A" }} /> Conectar iCloud
              </Button>
            </div>
          </section>

          <AppPrivado />
        </aside>


        {/* Calendário */}
        <main className="min-w-0 flex-1 space-y-4">
          {(() => {
            const doDia = (porDia.get(hoje) ?? []).slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
            const diaInteiro = doDia.filter((e) => e.dia_inteiro);
            const comHora = doDia.filter((e) => !e.dia_inteiro);
            if (doDia.length === 0) return null;
            return (
              <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <h2 className="mb-2 text-sm font-semibold text-foreground">Hoje</h2>
                {diaInteiro.length > 0 && (
                  <ul className="mb-2 flex flex-wrap gap-2">
                    {diaInteiro.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => setDetalhe(e)}
                          className="rounded-full border border-primary/40 bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-primary/10"
                        >
                          Dia inteiro · {e.titulo}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="space-y-1">
                  {comHora.map((e) => (
                    <li key={e.id} className="text-sm">
                      <button
                        type="button"
                        onClick={() => setDetalhe(e)}
                        className="text-left text-foreground hover:underline"
                      >
                        <span className="font-semibold text-primary">{hora(e.inicio)}</span> {e.titulo}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-40 text-center text-sm font-semibold capitalize text-foreground">
              {mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
              <div key={d} className="bg-muted px-2 py-1 text-center text-[11px] uppercase text-muted-foreground">
                {d}
              </div>
            ))}
            {dias.map((dia, i) => {
              const k = dia ? diaKey(dia) : `vazio-${i}`;
              const lista = dia ? (porDia.get(k) ?? []) : [];
              return (
                <div
                  key={k}
                  className={`min-h-24 bg-card p-1.5 ${dia && k === hoje ? "ring-1 ring-inset ring-primary" : ""}`}
                >
                  {dia && (
                    <>
                      <span className="text-[11px] text-muted-foreground">{dia.getDate()}</span>
                      <ul className="mt-1 space-y-1">
                        {lista.slice(0, 4).map((e) => {
                          const cor = e.account_id ? (contaPorId.get(e.account_id)?.cor ?? "#F26B1F") : "#F26B1F";
                          return (
                            <li key={e.id} className="flex items-start gap-1 text-[11px] leading-tight">
                              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
                              <button
                                type="button"
                                className="truncate text-left text-foreground hover:underline"
                                onClick={() => setDetalhe(e)}
                              >
                                {hora(e.inicio)} {e.titulo}
                              </button>
                            </li>
                          );
                        })}
                        {lista.length > 4 && (
                          <li className="text-[10px] text-muted-foreground">+{lista.length - 4}</li>
                        )}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {editar && (
        <NovoCompromissoDialog
          contas={contas}
          evento={editar}
          onClose={() => setEditar(null)}
          onPronto={() => {
            setEditar(null);
            void recarregar();
          }}
        />
      )}
      {detalhe && (
        <DetalhesDialog
          evento={detalhe}
          onEditar={() => {
            setEditar(detalhe);
            setDetalhe(null);
          }}
          conta={detalhe.account_id ? (contaPorId.get(detalhe.account_id) ?? null) : null}
          onClose={() => setDetalhe(null)}
          onExcluir={async () => {
            const ok = await confirm({
              title: detalhe.titulo,
              description: "Excluir este compromisso da agenda?",
              confirmText: "Excluir",
            });
            if (!ok) return;
            await apagarEvento({ data: { id: detalhe.id } });
            toast.success("Compromisso excluído.");
            setDetalhe(null);
            void recarregar();
          }}
        />
      )}
      {conectar && (
        <ConectarDialog
          provider={conectar}
          onClose={() => setConectar(null)}
          onPronto={() => {
            setConectar(null);
            void recarregar();
          }}
        />
      )}
      {novo && (
        <NovoCompromissoDialog
          contas={contas}
          onClose={() => setNovo(false)}
          onPronto={() => {
            setNovo(false);
            void recarregar();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ConectarDialog({
  provider,
  onClose,
  onPronto,
}: {
  provider: Provedor;
  onClose: () => void;
  onPronto: () => void;
}) {
  const testar = useServerFn(testarCalendario);
  const salvar = useServerFn(conectarCalendario);
  const listarGoogle = useServerFn(listarCalendariosGoogleFn);
  const salvarGoogle = useServerFn(conectarGoogleAgenda);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState(provider === "titan" ? "VIA AIR — Titan" : "Pessoal — iCloud");
  const [opcoes, setOpcoes] = useState<Array<{ url?: string; id?: string; nome: string }>>([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (provider !== "google") return;
    setOcupado(true);
    listarGoogle()
      .then((cals) => setOpcoes((cals as Array<{ id: string; nome: string }>).map((c) => ({ id: c.id, nome: c.nome }))))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Não consegui falar com o Google."))
      .finally(() => setOcupado(false));
  }, [provider, listarGoogle]);

  async function buscarCalendarios() {
    setOcupado(true);
    try {
      const cals = (await testar({ data: { provider, email, senha } })) as Array<{ url: string; nome: string }>;
      setOpcoes(cals.map((c) => ({ url: c.url, nome: c.nome })));
      toast.success("Login aceito. Escolha o calendário.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui conectar.");
    } finally {
      setOcupado(false);
    }
  }

  async function escolher(op: { url?: string; id?: string; nome: string }) {
    setOcupado(true);
    try {
      if (provider === "google") {
        await salvarGoogle({ data: { calendarId: op.id!, nome: op.nome } });
      } else {
        await salvar({ data: { provider, nome, email, senha, calendarUrl: op.url!, calendarNome: op.nome } });
      }
      toast.success("Agenda conectada.");
      onPronto();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar a agenda.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar {ROTULO[provider]}</DialogTitle>
        </DialogHeader>

        {provider !== "google" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {provider === "titan"
                ? "Use o e-mail e a senha do Titan (dav.titan.email). O e-mail continua hospedado normalmente."
                : "Use o Apple ID e uma senha de app gerada em appleid.apple.com (o iCloud não aceita a senha principal)."}
            </p>
            <label className="block text-xs font-medium text-foreground">
              Apelido da agenda
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                placeholder={provider === "titan" ? "Ex.: Titan VIA AIR" : "Ex.: iCloud pessoal"}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-foreground">
              E-mail
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                placeholder={provider === "titan" ? "contato@viaair.tur.br" : "seu@icloud.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-foreground">
              {provider === "titan" ? "Senha do Titan" : "Senha de app do iCloud"}
              <input
                type="password"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </label>
            <Button className="w-full" onClick={buscarCalendarios} disabled={ocupado || !email || !senha}>
              {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Buscar calendários
            </Button>
          </div>
        )}

        {opcoes.length > 0 && (
          <div className="mt-2">
            <p className="mb-2 text-xs text-muted-foreground">
              Escolha qual calendário vc quer trazer pra cá (dá pra conectar vários, um de cada vez):
            </p>
            <ul className="space-y-2">
              {opcoes.map((op) => (
                <li key={op.url ?? op.id}>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => escolher(op)}
                    className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                  >
                    {op.nome}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {provider === "google" && ocupado && opcoes.length === 0 && (
          <p className="text-xs text-muted-foreground">Buscando seus calendários do Google…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function NovoCompromissoDialog({
  contas,
  evento,
  onClose,
  onPronto,
}: {
  contas: Conta[];
  evento?: Evento | null;
  onClose: () => void;
  onPronto: () => void;
}) {
  const criar = useServerFn(criarCompromisso);
  const atualizar = useServerFn(atualizarCompromisso);
  const checar = useServerFn(verificarConflitos);
  const editando = !!evento;
  const det = (evento?.detalhes ?? {}) as { conferencia?: string; url?: unknown };

  const padrao = contas.find((c) => c.padrao) ?? contas[0];
  const [accountId, setAccountId] = useState(evento?.account_id ?? padrao?.id ?? "");
  const [titulo, setTitulo] = useState(evento?.titulo ?? "");
  const [local, setLocal] = useState(evento?.local ?? "");
  const [descricao, setDescricao] = useState(evento?.descricao ?? "");
  const [inicio, setInicio] = useState(evento ? isoParaInput(evento.inicio) : "");
  const [fim, setFim] = useState(evento ? isoParaInput(evento.fim) : "");
  const [diaInteiro, setDiaInteiro] = useState(evento?.dia_inteiro ?? false);
  const [linkReuniao, setLinkReuniao] = useState(det.conferencia ?? "");
  const [url, setUrl] = useState(det.url ? String(det.url) : "");
  const [convidados, setConvidados] = useState("");
  const [choques, setChoques] = useState<Evento[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!inicio || !fim) {
      setChoques([]);
      return;
    }
    let vivo = true;
    checar({ data: { inicio: brtParaIso(inicio), fim: brtParaIso(fim), ignorarId: evento?.id } })
      .then((r) => vivo && setChoques(r as Evento[]))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [inicio, fim, checar]);

  async function salvar() {
    setSalvando(true);
    try {
      if (editando && evento) {
        await atualizar({
          data: {
            id: evento.id,
            titulo,
            descricao: descricao || null,
            local: local || null,
            inicio: brtParaIso(inicio),
            fim: brtParaIso(fim),
          },
        });
        toast.success("Compromisso atualizado.");
        onPronto();
        return;
      }
      await criar({
        data: {
          titulo,
          descricao: descricao || null,
          local: local || null,
          inicio: brtParaIso(inicio),
          fim: brtParaIso(fim),
          accountId: accountId || null,
          diaInteiro,
          linkReuniao: linkReuniao.trim() || null,
          url: url.trim() || null,
          convidados: convidados
            .split(/[,;\s]+/)
            .map((e) => e.trim())
            .filter((e) => e.includes("@")),
        },
      });
      toast.success("Compromisso criado.");
      onPronto();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar o compromisso.");
    } finally {
      setSalvando(false);
    }
  }

  const campo =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
  const rotulo = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">{editando ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className={rotulo}>Título</label>
            <input
              className={campo}
              placeholder="Ex.: Reunião com cliente"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={diaInteiro}
              onChange={(e) => setDiaInteiro(e.target.checked)}
            />
            Dia inteiro
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={rotulo}>Início</label>
              <input
                type={diaInteiro ? "date" : "datetime-local"}
                className={campo}
                value={diaInteiro ? inicio.slice(0, 10) : inicio}
                onChange={(e) =>
                  setInicio(diaInteiro ? `${e.target.value}T00:00` : e.target.value)
                }
              />
            </div>
            <div>
              <label className={rotulo}>Fim</label>
              <input
                type={diaInteiro ? "date" : "datetime-local"}
                className={campo}
                value={diaInteiro ? fim.slice(0, 10) : fim}
                onChange={(e) => setFim(diaInteiro ? `${e.target.value}T23:59` : e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={rotulo}>Local</label>
            <input
              className={campo}
              placeholder="Endereço ou sala (opcional)"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
            />
          </div>

          <div>
            <label className={rotulo}>Link da reunião</label>
            <input
              className={campo}
              placeholder="https://meet.google.com/..."
              value={linkReuniao}
              onChange={(e) => setLinkReuniao(e.target.value)}
            />
          </div>

          <div>
            <label className={rotulo}>Link relacionado</label>
            <input
              className={campo}
              placeholder="Pedido, proposta, documento… (opcional)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div>
            <label className={rotulo}>Convidados</label>
            <input
              className={campo}
              placeholder="email1@dominio.com, email2@dominio.com"
              value={convidados}
              onChange={(e) => setConvidados(e.target.value)}
            />
          </div>

          <div>
            <label className={rotulo}>Observações</label>
            <textarea
              className={campo}
              rows={2}
              placeholder="Detalhes do compromisso (opcional)"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div>
            <p className={rotulo}>Salvar em</p>
            <div className="space-y-1">
              {contas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setAccountId(c.id)}
                  className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm text-foreground ${
                    accountId === c.id ? "border-primary bg-primary/10" : "border-border bg-background"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />
                  {c.nome}
                </button>
              ))}
              {contas.length === 0 && (
                <p className="text-xs text-muted-foreground">Conecte uma agenda para salvar compromissos.</p>
              )}
            </div>
          </div>

          {choques.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <p className="flex items-center gap-1 font-medium">
                <TriangleAlert className="h-3.5 w-3.5" /> Conflito de horário
              </p>
              <ul className="mt-1 space-y-0.5">
                {choques.map((c) => (
                  <li key={c.id}>
                    {hora(c.inicio)}–{hora(c.fim)} · {c.titulo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button className="w-full" onClick={salvar} disabled={salvando || !titulo || !inicio || !fim}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {editando ? "Salvar alterações" : "Salvar compromisso"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhes completos do compromisso                                   */
/* ------------------------------------------------------------------ */

const RESPOSTA_ROTULO: Record<string, string> = {
  accepted: "confirmado",
  declined: "recusou",
  tentative: "talvez",
  needsaction: "aguardando resposta",
  "needs-action": "aguardando resposta",
};

function dataLonga(v: string, diaInteiro: boolean): string {
  return new Date(v).toLocaleDateString("pt-BR", {
    timeZone: BRT,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(diaInteiro ? {} : {}),
  });
}

function comLinks(texto: string) {
  const partes = texto.split(/(https?:\/\/\S+)/g);
  return partes.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a
        key={i}
        href={p}
        target="_blank"
        rel="noreferrer"
        className="break-all text-primary underline underline-offset-2"
      >
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function Linha({
  icone: Icone,
  tom = "muted",
  children,
}: {
  icone: typeof Clock;
  tom?: "primary" | "accent" | "muted";
  children: React.ReactNode;
}) {
  const chip =
    tom === "primary"
      ? "bg-primary/10 text-primary"
      : tom === "accent"
        ? "bg-accent text-accent-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <div className="flex items-start gap-3.5 text-sm">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${chip}`}>
        <Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1 text-foreground">{children}</div>
    </div>
  );
}

function DetalhesDialog({
  evento,
  conta,
  onClose,
  onEditar,
  onExcluir,
}: {
  evento: Evento;
  conta: Conta | null;
  onClose: () => void;
  onEditar: () => void;
  onExcluir: () => void | Promise<void>;
}) {
  const d = evento.detalhes ?? {};
  const participantes = (d.participantes ?? []).filter((p) => p.email || p.nome);
  const cor = conta?.cor ?? "#F26B1F";
  const dataTexto = evento.dia_inteiro
    ? `${dataLonga(evento.inicio, true)} · dia inteiro`
    : dataLonga(evento.inicio, false);
  const horaTexto = evento.dia_inteiro ? null : `${hora(evento.inicio)} às ${hora(evento.fim)}`;
  const mapa = evento.local
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(evento.local)}`
    : null;
  const contaRotulo = conta ? ROTULO[conta.provider] : (evento.provider === "google" ? "Google Agenda" : evento.origem);
  const contaEmail = d.calendario ?? conta?.calendarioNome ?? conta?.email ?? conta?.nome ?? evento.origem;
  const inicial = (contaEmail ?? "?").trim().charAt(0).toUpperCase();

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden border-border bg-card p-0 sm:max-w-lg">
        <div className="flex max-h-[88vh] w-full min-w-0 max-w-full flex-col overflow-hidden sm:flex-row">
          <div className="h-1.5 w-full shrink-0 sm:h-auto sm:w-2" style={{ background: cor }} />

          <div className="flex w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden">
            <DialogHeader className="space-y-1.5 px-6 pb-4 pt-6 text-left">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor }} />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Compromisso
                </span>
              </div>
              <DialogTitle className="pr-8 text-2xl font-extrabold leading-tight text-foreground">
                <span className="break-words">{evento.titulo}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-0 w-full min-w-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-6 pb-6 [overflow-wrap:anywhere]">
              <Linha icone={Clock} tom="primary">
                <p className="font-bold capitalize text-foreground">{dataTexto}</p>
                {horaTexto && <p className="font-medium text-muted-foreground">{horaTexto}</p>}
                {(d.fusoHorario || d.recorrencia) && (
                  <p className="text-xs text-muted-foreground">
                    {[d.fusoHorario, d.recorrencia ? "compromisso que se repete" : null].filter(Boolean).join(" · ")}
                  </p>
                )}
              </Linha>

              {d.conferencia && (
                <Linha icone={Video} tom="accent">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Link da reunião</p>
                  <a
                    href={d.conferencia}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-sm font-semibold text-primary hover:underline"
                  >
                    {d.conferencia}
                  </a>
                </Linha>
              )}

              {evento.local && (
                <Linha icone={MapPin} tom="accent">
                  <p className="break-words text-sm font-bold text-foreground">{evento.local}</p>
                  {mapa && (
                    <a
                      href={mapa}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                    >
                      Ver no Google Maps
                      <LinkIcon className="h-3 w-3" />
                    </a>
                  )}
                </Linha>
              )}

              {(d.organizador?.email || d.organizador?.nome) && (
                <Linha icone={UserRound}>
                  <p className="font-semibold">
                    {d.organizador.nome ?? d.organizador.email}
                    <span className="text-xs font-normal text-muted-foreground"> · organizador</span>
                  </p>
                  {d.organizador.nome && d.organizador.email && (
                    <p className="text-xs text-muted-foreground">{d.organizador.email}</p>
                  )}
                </Linha>
              )}

              {participantes.length > 0 && (
                <Linha icone={Users}>
                  <p className="font-semibold">
                    {participantes.length} convidado{participantes.length > 1 ? "s" : ""}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {participantes.map((p, i) => (
                      <li key={`${p.email ?? p.nome}-${i}`} className="text-sm">
                        <span className="break-all">{p.nome ?? p.email}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.organizador ? " · organizador" : ""}
                          {p.resposta ? ` · ${RESPOSTA_ROTULO[p.resposta] ?? p.resposta}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Linha>
              )}

              {(d.lembretes?.length ?? 0) > 0 && (
                <Linha icone={Bell}>
                  <p>{d.lembretes!.join(" · ")}</p>
                </Linha>
              )}

              {evento.descricao && (
                <div className="w-full min-w-0 overflow-hidden rounded-xl border border-border bg-muted/50 p-4">
                  <div className="flex items-center gap-2 pb-2">
                    <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Detalhes</p>
                  </div>
                  <div className="max-w-full overflow-x-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere] [word-break:break-word] [&_a]:break-all [&_a]:font-semibold [&_a]:text-primary">
                    {comLinks(evento.descricao)}
                  </div>
                </div>
              )}

              {d.url && (
                <Linha icone={LinkIcon} tom="accent">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Link relacionado
                  </p>
                  {/^https?:\/\//i.test(String(d.url)) ? (
                    <a
                      href={String(d.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-sm font-semibold text-primary hover:underline"
                    >
                      {String(d.url)}
                    </a>
                  ) : (
                    <p className="break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
                      {comLinks(String(d.url))}
                    </p>
                  )}
                </Linha>
              )}


              <div className="flex items-center gap-3 border-t border-border pt-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-muted text-sm font-bold text-muted-foreground">
                  {inicial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{contaEmail}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      `Sincronizado via ${contaRotulo}`,
                      d.disponibilidade ? (d.disponibilidade === "livre" ? "marcado como livre" : "ocupado") : null,
                      d.visibilidade && d.visibilidade !== "default" ? d.visibilidade : null,
                      evento.situacao && evento.situacao !== "confirmed" ? evento.situacao : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-6 py-4">
              <button
                type="button"
                onClick={() => void onExcluir()}
                className="group inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 transition-transform group-hover:scale-110" />
                Excluir
              </button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onEditar} className="rounded-xl px-5 py-5 text-sm font-bold">
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              <Button onClick={onClose} className="rounded-xl px-7 py-5 text-sm font-bold shadow-lg shadow-primary/20">
                Fechar
              </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


/* ------------------------------------------------------------------ */
/* App privado (link secreto + PIN)                                    */
/* ------------------------------------------------------------------ */

function AppPrivado() {
  const carregar = useServerFn(listarLinksAgenda);
  const criar = useServerFn(criarLinkAgenda);
  const excluir = useServerFn(removerLinkAgenda);

  const [links, setLinks] = useState<Array<{ id: string; token: string; nome: string; ativo: boolean; temPin: boolean; last_seen_at: string | null }>>([]);
  const [aparelhos, setAparelhos] = useState(0);
  const [pin, setPin] = useState("");
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(async () => {
    const r = (await carregar()) as { links: typeof links; aparelhos: number };
    setLinks(r.links);
    setAparelhos(r.aparelhos);
  }, [carregar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const base = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-semibold text-foreground">App no celular</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Link secreto (sem login) para adicionar à tela de início. Protegido por PIN de 4 números.
      </p>

      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.id} className="rounded-lg border border-border/70 p-3">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm text-foreground">{l.nome}</span>
              <button
                type="button"
                aria-label="Copiar link"
                onClick={() => {
                  void navigator.clipboard.writeText(`${base}/agenda/${l.token}`);
                  toast.success("Link copiado.");
                }}
              >
                <Copy className="h-4 w-4 text-muted-foreground hover:text-primary" />
              </button>
              <button
                type="button"
                aria-label="Remover link"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Remover este link?",
                    description: "Quem já instalou o app perde o acesso na hora.",
                  });
                  if (!ok) return;
                  await excluir({ data: { id: l.id } });
                  toast.success("Link removido.");
                  void recarregar();
                }}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
            <p className="mt-1 break-all text-[11px] text-muted-foreground">{`${base}/agenda/${l.token}`}</p>
          </li>
        ))}
        {links.length === 0 && <p className="text-xs text-muted-foreground">Nenhum link criado ainda.</p>}
      </ul>

      <div className="mt-3 space-y-2">
        <Input placeholder="Nome (ex.: iPhone do Lucas)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Input
          placeholder="PIN de 4 números"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
        <Button
          size="sm"
          className="w-full"
          disabled={salvando || pin.length !== 4}
          onClick={async () => {
            setSalvando(true);
            try {
              const r = (await criar({ data: { nome, pin } })) as { token: string };
              await navigator.clipboard.writeText(`${base}/agenda/${r.token}`).catch(() => {});
              toast.success("Link criado e copiado.");
              setPin("");
              setNome("");
              void recarregar();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Falha ao criar o link.");
            } finally {
              setSalvando(false);
            }
          }}
        >
          {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Criar link do app
        </Button>
        <p className="text-[11px] text-muted-foreground">{aparelhos} aparelho(s) recebendo notificações.</p>
      </div>
    </section>
  );
}
