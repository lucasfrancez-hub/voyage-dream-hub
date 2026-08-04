import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Bell, BellOff, CalendarClock, Check, Loader2, Send, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  agendaNesteAparelho,
  lerPrefsAgenda,
  salvarPrefsAgenda,
  testarLembreteAgenda,
} from "@/lib/calendar/notify.functions";
import { chaveVapidChat, salvarPushChat } from "@/lib/chat/push.functions";
import { b64urlParaUint8, ehIOS, ehStandalone, nomeDoAparelho, SW_URL, suportaPush } from "@/lib/chat/push-client";

export const Route = createFileRoute("/chat/agenda-notificacoes")({
  ssr: false,
  component: AgendaNotificacoes,
  head: () => ({
    meta: [
      { title: "Notificações da Agenda — VIA AIR" },
      { name: "description", content: "Configure os lembretes push dos compromissos da agenda VIA AIR." },
      { property: "og:title", content: "Notificações da Agenda — VIA AIR" },
      { property: "og:description", content: "Lembretes push dos compromissos da agenda VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Prefs = {
  ativo: boolean;
  lembretes: number[];
  hora_dia_inteiro: number;
  aviso_vespera: boolean;
  hora_vespera: number;
  som: boolean;
  timezone?: string;
};

type Aparelho = {
  id: string;
  endpoint: string;
  device_name: string | null;
  ativo: boolean;
  pref_agenda: boolean;
  pref_novas: boolean;
  last_success_at: string | null;
};

const OPCOES = [
  { m: 0, rotulo: "No horário" },
  { m: 5, rotulo: "5 min antes" },
  { m: 15, rotulo: "15 min antes" },
  { m: 30, rotulo: "30 min antes" },
  { m: 60, rotulo: "1 hora antes" },
  { m: 1440, rotulo: "1 dia antes" },
];

function AgendaNotificacoes() {
  const carregar = useServerFn(lerPrefsAgenda);
  const salvar = useServerFn(salvarPrefsAgenda);
  const alternarAparelho = useServerFn(agendaNesteAparelho);
  const testar = useServerFn(testarLembreteAgenda);
  const pegarVapid = useServerFn(chaveVapidChat);
  const salvarSub = useServerFn(salvarPushChat);

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([]);
  const [proximos, setProximos] = useState<Array<{ id: string; scheduled_for: string; reminder_type: string }>>([]);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [permissao, setPermissao] = useState<string>("default");
  const [personalizado, setPersonalizado] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const atualizar = useCallback(async () => {
    try {
      const r = (await carregar({})) as { prefs: Prefs; aparelhos: Aparelho[]; proximos: typeof proximos };
      setPrefs(r.prefs);
      setAparelhos(r.aparelhos);
      setProximos(r.proximos);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui carregar as preferências.");
    }
    if (typeof window !== "undefined" && "Notification" in window) setPermissao(Notification.permission);
    if (suportaPush()) {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL).catch(() => null);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      setEndpoint(sub?.endpoint ?? null);
    }
  }, [carregar]);

  useEffect(() => {
    void atualizar();
  }, [atualizar]);

  const esteAparelho = aparelhos.find((a) => a.endpoint === endpoint) ?? null;

  async function gravar(patch: Partial<Prefs>) {
    if (!prefs) return;
    const novo = { ...prefs, ...patch };
    setPrefs(novo);
    try {
      await salvar({
        data: {
          ativo: novo.ativo,
          lembretes: novo.lembretes,
          hora_dia_inteiro: novo.hora_dia_inteiro,
          aviso_vespera: novo.aviso_vespera,
          hora_vespera: novo.hora_vespera,
          som: novo.som,
          timezone: novo.timezone ?? "America/Sao_Paulo",
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar.");
    }
  }

  async function ativarNesteAparelho() {
    setOcupado(true);
    try {
      if (!suportaPush()) return toast.error("Este navegador não suporta notificações push.");
      if (ehIOS() && !ehStandalone())
        return toast.error("No iPhone, abra pelo ícone da Tela de Início para ativar as notificações.");
      const perm = await Notification.requestPermission();
      setPermissao(perm);
      if (perm !== "granted") return toast.error("Permissão negada. Libere em Ajustes > Notificações.");
      const { vapid } = await pegarVapid({});
      if (!vapid) return toast.error("Notificações não configuradas no servidor.");
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64urlParaUint8(vapid) as BufferSource,
        }));
      const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
      await salvarSub({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent.slice(0, 400),
          deviceName: nomeDoAparelho(),
        },
      });
      toast.success("Aparelho registrado para os lembretes da agenda.");
      await atualizar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui ativar.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligarAqui() {
    if (!endpoint) return;
    setOcupado(true);
    try {
      await alternarAparelho({ data: { endpoint, ativo: false } });
      toast.success("Lembretes da agenda desligados neste aparelho. As mensagens continuam chegando.");
      await atualizar();
    } finally {
      setOcupado(false);
    }
  }

  async function ligarAqui() {
    if (!endpoint) return;
    setOcupado(true);
    try {
      await alternarAparelho({ data: { endpoint, ativo: true } });
      await atualizar();
    } finally {
      setOcupado(false);
    }
  }

  async function testarAgora() {
    setOcupado(true);
    try {
      await testar({});
      toast.success("Teste criado: o lembrete real chega em cerca de 1 minuto. Pode fechar o app.");
      await atualizar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui criar o teste.");
    } finally {
      setOcupado(false);
    }
  }

  const cartao = "rounded-2xl border border-border bg-card p-5 shadow-sm";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-16">
      <div className="flex items-center gap-3">
        <Link to="/chat/agenda" className="rounded-lg p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Notificações da Agenda</h1>
          <p className="text-sm text-muted-foreground">Lembretes reais dos compromissos, mesmo com o app fechado.</p>
        </div>
      </div>

      {!prefs ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className={cartao}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">Lembretes da agenda</p>
                <p className="text-xs text-muted-foreground">
                  Independente das notificações de mensagens do chat.
                </p>
              </div>
              <Switch checked={prefs.ativo} onCheckedChange={(v) => void gravar({ ativo: v })} />
            </div>
          </div>

          <div className={cartao}>
            <p className="mb-3 font-semibold text-foreground">Compromissos com horário</p>
            <div className="flex flex-wrap gap-2">
              {OPCOES.map((o) => {
                const ativo = prefs.lembretes.includes(o.m);
                return (
                  <button
                    key={o.m}
                    onClick={() =>
                      void gravar({
                        lembretes: ativo
                          ? prefs.lembretes.filter((m) => m !== o.m)
                          : [...prefs.lembretes, o.m].sort((a, b) => a - b),
                      })
                    }
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      ativo
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {o.rotulo}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={personalizado}
                onChange={(e) => setPersonalizado(e.target.value.replace(/\D/g, ""))}
                placeholder="Personalizado (minutos)"
                inputMode="numeric"
                className="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const m = Number(personalizado);
                  if (!m) return;
                  setPersonalizado("");
                  void gravar({ lembretes: [...new Set([...prefs.lembretes, m])].sort((a, b) => a - b) });
                }}
              >
                Adicionar
              </Button>
            </div>
          </div>

          <div className={cartao}>
            <p className="mb-3 font-semibold text-foreground">Eventos de dia inteiro</p>
            <label className="mb-3 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Aviso no dia, às</span>
              <select
                value={prefs.hora_dia_inteiro}
                onChange={(e) => void gravar({ hora_dia_inteiro: Number(e.target.value) })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{`${String(h).padStart(2, "0")}h`}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Avisar também na véspera</span>
              <Switch checked={prefs.aviso_vespera} onCheckedChange={(v) => void gravar({ aviso_vespera: v })} />
            </div>
            {prefs.aviso_vespera && (
              <label className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Horário da véspera</span>
                <select
                  value={prefs.hora_vespera}
                  onChange={(e) => void gravar({ hora_vespera: Number(e.target.value) })}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{`${String(h).padStart(2, "0")}h`}</option>
                  ))}
                </select>
              </label>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Eventos de dia inteiro nunca são avisados à meia-noite.
            </p>
          </div>

          <div className={cartao}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-semibold text-foreground">Som e alerta</p>
              <Switch checked={prefs.som} onCheckedChange={(v) => void gravar({ som: v })} />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Smartphone className="h-4 w-4" /> Aparelhos cadastrados
              </span>
              <span className="font-semibold text-foreground">{aparelhos.filter((a) => a.ativo).length}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Permissão neste aparelho</span>
              <span className="flex items-center gap-1.5 font-medium">
                {permissao === "granted" ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <X className="h-4 w-4 text-rose-600" />
                )}
                {permissao === "granted" ? "Concedida" : permissao === "denied" ? "Bloqueada" : "Não pedida"}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {!esteAparelho || !esteAparelho.ativo ? (
                <Button onClick={() => void ativarNesteAparelho()} disabled={ocupado}>
                  {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                  Ativar neste aparelho
                </Button>
              ) : esteAparelho.pref_agenda ? (
                <Button variant="outline" onClick={() => void desligarAqui()} disabled={ocupado}>
                  <BellOff className="mr-2 h-4 w-4" />
                  Desativar a agenda neste aparelho
                </Button>
              ) : (
                <Button variant="outline" onClick={() => void ligarAqui()} disabled={ocupado}>
                  <Bell className="mr-2 h-4 w-4" />
                  Reativar a agenda neste aparelho
                </Button>
              )}
              <Button variant="secondary" onClick={() => void testarAgora()} disabled={ocupado}>
                <Send className="mr-2 h-4 w-4" />
                Testar lembrete da agenda
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              O teste cria um compromisso real e o aviso chega em cerca de 1 minuto, pelo servidor — pode fechar o app.
            </p>
          </div>

          {proximos.length > 0 && (
            <div className={cartao}>
              <p className="mb-2 flex items-center gap-2 font-semibold text-foreground">
                <CalendarClock className="h-4 w-4" /> Próximos lembretes na fila
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {proximos.map((j) => (
                  <li key={j.id}>
                    {new Intl.DateTimeFormat("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(j.scheduled_for))}{" "}
                    · {j.reminder_type}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={cartao}>
            <p className="mb-2 font-semibold text-foreground">Para ver os lembretes na tela bloqueada do iPhone</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Abra Ajustes do iPhone.</li>
              <li>Entre em Notificações.</li>
              <li>Selecione este aplicativo.</li>
              <li>Ative “Permitir Notificações”.</li>
              <li>Marque “Tela Bloqueada”, “Central de Notificações” e “Banners”.</li>
              <li>Ative “Sons”.</li>
              <li>Em “Estilo de Banner”, escolha “Persistente”, se a opção existir.</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              Conseguimos confirmar apenas que a permissão foi concedida; a forma de exibição é controlada pelo iOS.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
