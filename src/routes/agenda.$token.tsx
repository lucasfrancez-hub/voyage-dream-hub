import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";

import {
  abrirAgendaApp,
  criarEventoAgendaApp,
  eventosAgendaApp,
  removerPushAgenda,
  salvarPushAgenda,
  testarPushAgenda,
} from "@/lib/calendar-app.functions";

export const Route = createFileRoute("/agenda/$token")({
  component: AgendaApp,
  head: ({ params }) => ({
    meta: [
      { title: "Agenda VIA AIR" },
      { name: "description", content: "Agenda unificada da VIA AIR: Google, Titan e iCloud num app só." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: "#080d1a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Agenda" },
      { property: "og:title", content: "Agenda VIA AIR" },
      { property: "og:description", content: "Agenda unificada da VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "manifest", href: `/api/public/agenda-manifest/${params.token}` },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/agenda-icon-192.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon-agenda.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon-agenda.png" },
    ],
  }),

});

/* ------------------------------------------------------------------ */
/* Tipos e utilidades                                                  */
/* ------------------------------------------------------------------ */

type Evento = {
  id: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  origem: string;
  provider: string;
  account_id: string | null;
  detalhes: Record<string, unknown> | null;
};

type Conta = { id: string; nome: string; cor: string; provider: string; email: string | null; calendarioNome: string | null };

type Modo = "dia" | "semana" | "mes" | "lista";

const ROTULO_PROVIDER: Record<string, string> = {
  google: "Google Agenda",
  titan: "Titan",
  icloud: "iCloud",
  local: "VIA AIR",
};

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function inicioDoDia(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function somarDias(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function inicioDaSemana(d: Date) {
  return somarDias(inicioDoDia(d), -d.getDay());
}
function mesmoDia(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function porExtenso(d: Date) {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

function b64urlParaUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------------ */
/* Tela                                                                */
/* ------------------------------------------------------------------ */

function AgendaApp() {
  const { token } = Route.useParams();
  const chavePin = `viaair-agenda-pin:${token}`;

  const [pin, setPin] = useState<string | null>(null);
  const [liberado, setLiberado] = useState(false);
  const [precisaPin, setPrecisaPin] = useState(false);
  const [invalido, setInvalido] = useState(false);
  const [nome, setNome] = useState("Agenda VIA AIR");
  const [vapid, setVapid] = useState("");
  const [erroPin, setErroPin] = useState("");

  const abrir = useServerFn(abrirAgendaApp);

  const tentar = useCallback(
    async (valorPin: string | null) => {
      const r = await abrir({ data: { token, pin: valorPin } });
      if (!r.valido) {
        setInvalido(true);
        return false;
      }
      setNome(r.nome);
      if (r.precisaPin) {
        setPrecisaPin(true);
        setLiberado(false);
        return false;
      }
      setVapid(r.vapid);
      setPin(valorPin);
      setPrecisaPin(false);
      setLiberado(true);
      return true;
    },
    [abrir, token],
  );

  useEffect(() => {
    const salvo = typeof window === "undefined" ? null : window.localStorage.getItem(chavePin);
    void tentar(salvo);
  }, [chavePin, tentar]);

  if (invalido) {
    return (
      <Fundo>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
          <CalendarDays className="h-10 w-10 opacity-40" />
          <p className="text-lg font-semibold">Link inválido</p>
          <p className="text-sm opacity-60">Esse endereço não existe mais ou foi desativado.</p>
        </div>
      </Fundo>
    );
  }

  if (!liberado) {
    return (
      <Fundo>
        <TelaPin
          nome={nome}
          erro={erroPin}
          carregando={!precisaPin}
          onEnviar={async (valor) => {
            setErroPin("");
            const ok = await tentar(valor);
            if (ok) window.localStorage.setItem(chavePin, valor);
            else setErroPin("PIN incorreto. Tente de novo.");
          }}
        />
      </Fundo>
    );
  }

  return (
    <Fundo>
      <Painel token={token} pin={pin} nome={nome} vapid={vapid} />
    </Fundo>
  );
}

function Fundo({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-dvh text-white"
      style={{
        background: "radial-gradient(1200px 600px at 50% -10%, #14213f 0%, #080d1a 55%, #05070f 100%)",
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PIN                                                                 */
/* ------------------------------------------------------------------ */

function TelaPin({
  nome,
  erro,
  carregando,
  onEnviar,
}: {
  nome: string;
  erro: string;
  carregando: boolean;
  onEnviar: (pin: string) => void | Promise<void>;
}) {
  const [valor, setValor] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    if (valor.length === 4) void onEnviar(valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  useEffect(() => {
    if (erro) setValor("");
  }, [erro]);

  if (carregando) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8">
      <img src="/agenda-icon-192.png" alt="Agenda VIA AIR" width={72} height={72} className="rounded-2xl" />
      <div className="text-center">
        <p className="text-xl font-semibold">{nome}</p>
        <p className="mt-1 text-sm opacity-60">Digite o PIN de 4 números</p>
      </div>

      <div className="flex gap-3" onClick={() => ref.current?.focus()}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex h-14 w-12 items-center justify-center rounded-2xl border text-2xl font-semibold"
            style={{
              borderColor: valor.length === i ? "#F26B1F" : "rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            {valor[i] ? "•" : ""}
          </div>
        ))}
      </div>

      <input
        ref={ref}
        value={valor}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={4}
        onChange={(e) => setValor(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="absolute h-px w-px opacity-0"
        aria-label="PIN"
      />

      {erro ? <p className="text-sm" style={{ color: "#ff8a8a" }}>{erro}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Painel principal                                                    */
/* ------------------------------------------------------------------ */

function Painel({ token, pin, nome, vapid }: { token: string; pin: string | null; nome: string; vapid: string }) {
  const [modo, setModo] = useState<Modo>("dia");
  const [ancora, setAncora] = useState(() => inicioDoDia(new Date()));
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState<Evento | null>(null);
  const [config, setConfig] = useState(false);
  const [novo, setNovo] = useState(false);

  const buscar = useServerFn(eventosAgendaApp);

  const periodo = useMemo(() => {
    if (modo === "dia") return { de: somarDias(ancora, -1), ate: somarDias(ancora, 2) };
    if (modo === "semana") {
      const ini = inicioDaSemana(ancora);
      return { de: ini, ate: somarDias(ini, 7) };
    }
    if (modo === "mes") {
      const ini = new Date(ancora.getFullYear(), ancora.getMonth(), 1);
      return { de: somarDias(ini, -7), ate: somarDias(new Date(ancora.getFullYear(), ancora.getMonth() + 1, 1), 7) };
    }
    return { de: inicioDoDia(new Date()), ate: somarDias(inicioDoDia(new Date()), 60) };
  }, [modo, ancora]);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await buscar({
        data: { token, pin, de: periodo.de.toISOString(), ate: periodo.ate.toISOString() },
      });
      setEventos(r.eventos as unknown as Evento[]);
      setContas(r.contas as Conta[]);
    } finally {
      setCarregando(false);
    }
  }, [buscar, token, pin, periodo.de, periodo.ate]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const corDa = useCallback(
    (e: Evento) => contas.find((c) => c.id === e.account_id)?.cor ?? "#F26B1F",
    [contas],
  );
  const origemDe = useCallback(
    (e: Evento) => {
      const c = contas.find((x) => x.id === e.account_id);
      return c?.calendarioNome || c?.nome || ROTULO_PROVIDER[e.provider] || e.origem;
    },
    [contas],
  );

  const titulo =
    modo === "mes"
      ? ancora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : modo === "lista"
        ? "Próximos"
        : modo === "semana"
          ? `${inicioDaSemana(ancora).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${somarDias(inicioDaSemana(ancora), 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
          : porExtenso(ancora);

  function navegar(dir: number) {
    if (modo === "dia") setAncora(somarDias(ancora, dir));
    else if (modo === "semana") setAncora(somarDias(ancora, dir * 7));
    else if (modo === "mes") setAncora(new Date(ancora.getFullYear(), ancora.getMonth() + dir, 1));
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col pb-24">
      {/* topo */}
      <header className="sticky top-0 z-20 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl" style={{ background: "rgba(8,13,26,0.72)" }}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-widest opacity-50">{nome}</p>
            <h1 className="truncate text-xl font-semibold capitalize">{titulo}</h1>
          </div>
          <BotaoIcone onClick={() => void recarregar()} rotulo="Sincronizar">
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </BotaoIcone>
          <BotaoIcone onClick={() => setConfig(true)} rotulo="Notificações">
            <Bell className="h-4 w-4" />
          </BotaoIcone>
        </div>

        {modo !== "lista" ? (
          <div className="mt-2 flex items-center gap-2">
            <BotaoIcone onClick={() => navegar(-1)} rotulo="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </BotaoIcone>
            <button
              onClick={() => setAncora(inicioDoDia(new Date()))}
              className="rounded-full border px-3 py-1 text-xs"
              style={{ borderColor: "rgba(242,107,31,0.5)", color: "#F26B1F" }}
            >
              hoje
            </button>
            <BotaoIcone onClick={() => navegar(1)} rotulo="Próximo">
              <ChevronRight className="h-4 w-4" />
            </BotaoIcone>
          </div>
        ) : null}
      </header>

      <main className="flex-1 px-4">
        {modo === "dia" ? (
          <VistaDia dia={ancora} eventos={eventos} cor={corDa} origem={origemDe} onAbrir={setDetalhe} />
        ) : modo === "semana" ? (
          <VistaSemana
            ancora={ancora}
            eventos={eventos}
            cor={corDa}
            onDia={(d) => {
              setAncora(d);
              setModo("dia");
            }}
            onAbrir={setDetalhe}
          />
        ) : modo === "mes" ? (
          <VistaMes
            ancora={ancora}
            eventos={eventos}
            cor={corDa}
            origem={origemDe}
            onAbrir={setDetalhe}
            onMudarDia={setAncora}
          />
        ) : (
          <VistaLista eventos={eventos} cor={corDa} origem={origemDe} onAbrir={setDetalhe} />
        )}

        {carregando && eventos.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin opacity-40" />
          </div>
        ) : null}
      </main>

      {/* abas */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-xl justify-around border-t px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
        style={{ background: "rgba(8,13,26,0.85)", borderColor: "rgba(255,255,255,0.08)" }}
      >
        {(["dia", "semana", "mes", "lista"] as Modo[]).map((m) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className="flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] capitalize"
            style={{ color: modo === m ? "#F26B1F" : "rgba(255,255,255,0.55)" }}
          >
            <span className="text-[15px] font-semibold">{m === "mes" ? "Mês" : m[0]!.toUpperCase() + m.slice(1)}</span>
            <span className="h-0.5 w-6 rounded-full" style={{ background: modo === m ? "#F26B1F" : "transparent" }} />
          </button>
        ))}
      </nav>

      {detalhe ? (
        <Detalhes evento={detalhe} cor={corDa(detalhe)} origem={origemDe(detalhe)} onFechar={() => setDetalhe(null)} />
      ) : null}
      {config ? <Notificacoes token={token} pin={pin} vapid={vapid} onFechar={() => setConfig(false)} /> : null}
    </div>
  );
}

function BotaoIcone({ children, onClick, rotulo }: { children: React.ReactNode; onClick: () => void; rotulo: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      className="flex h-9 w-9 items-center justify-center rounded-xl border"
      style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)" }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Vistas                                                              */
/* ------------------------------------------------------------------ */

type VistaProps = {
  eventos: Evento[];
  cor: (e: Evento) => string;
  origem: (e: Evento) => string;
  onAbrir: (e: Evento) => void;
};

function doDia(eventos: Evento[], dia: Date) {
  return eventos.filter((e) => {
    const ini = new Date(e.inicio);
    const fim = new Date(e.fim);
    return ini < somarDias(inicioDoDia(dia), 1) && fim > inicioDoDia(dia);
  });
}

function CardEvento({
  e,
  cor,
  origem,
  onAbrir,
  compacto,
}: { e: Evento; cor: string; origem: string; onAbrir: (e: Evento) => void; compacto?: boolean }) {
  return (
    <button
      onClick={() => onAbrir(e)}
      className="w-full overflow-hidden rounded-2xl border p-3 text-left backdrop-blur-md"
      style={{
        borderColor: `${cor}55`,
        background: `linear-gradient(135deg, ${cor}22, rgba(255,255,255,0.03))`,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 h-full min-h-[2.2rem] w-1 shrink-0 rounded-full" style={{ background: cor }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{e.titulo}</p>
          <p className="mt-0.5 text-xs opacity-70">
            {e.dia_inteiro ? "dia inteiro" : `${hora(e.inicio)} – ${hora(e.fim)}`}
            {e.local ? ` · ${e.local}` : ""}
          </p>
          {!compacto ? (
            <span
              className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
              style={{ background: `${cor}22`, color: cor }}
            >
              <CalendarDays className="h-3 w-3" />
              {origem}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function VistaDia({ dia, eventos, cor, origem, onAbrir }: VistaProps & { dia: Date }) {
  const lista = doDia(eventos, dia).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const agora = new Date();
  const ehHoje = mesmoDia(dia, agora);
  const horas = Array.from({ length: 18 }, (_, i) => i + 6); // 06h às 23h

  const posicao = (d: Date) => (d.getHours() + d.getMinutes() / 60 - 6) * 64;

  return (
    <div className="pt-2">
      {lista.filter((e) => e.dia_inteiro).length > 0 ? (
        <div className="mb-3 space-y-2">
          {lista
            .filter((e) => e.dia_inteiro)
            .map((e) => (
              <CardEvento key={e.id} e={e} cor={cor(e)} origem={origem(e)} onAbrir={onAbrir} />
            ))}
        </div>
      ) : null}

      <div className="relative" style={{ height: 18 * 64 }}>
        {horas.map((h, i) => (
          <div key={h} className="absolute left-0 right-0 flex items-start gap-2" style={{ top: i * 64 }}>
            <span className="w-11 shrink-0 pt-[2px] text-[11px] tabular-nums opacity-40">
              {String(h).padStart(2, "0")}:00
            </span>
            <span className="mt-2 h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
          </div>
        ))}

        {ehHoje && agora.getHours() >= 6 ? (
          <div className="absolute left-11 right-0 z-10 flex items-center" style={{ top: posicao(agora) }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "#F26B1F" }} />
            <span className="h-px flex-1" style={{ background: "#F26B1F" }} />
          </div>
        ) : null}

        {lista
          .filter((e) => !e.dia_inteiro)
          .map((e) => {
            const ini = new Date(e.inicio);
            const fim = new Date(e.fim);
            const topo = Math.max(0, posicao(ini));
            const altura = Math.max(52, Math.min(posicao(fim) - topo, 18 * 64 - topo));
            return (
              <div key={e.id} className="absolute" style={{ top: topo, left: 56, right: 0, height: altura }}>
                <div className="h-full">
                  <CardEvento e={e} cor={cor(e)} origem={origem(e)} onAbrir={onAbrir} compacto={altura < 80} />
                </div>
              </div>
            );
          })}
      </div>

      {lista.length === 0 ? <Vazio texto="Nenhum compromisso nesse dia" /> : null}
    </div>
  );
}

function VistaSemana({
  ancora,
  eventos,
  cor,
  onDia,
  onAbrir,
}: {
  ancora: Date;
  eventos: Evento[];
  cor: (e: Evento) => string;
  onDia: (d: Date) => void;
  onAbrir: (e: Evento) => void;
}) {
  const ini = inicioDaSemana(ancora);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(ini, i));
  return (
    <div className="space-y-3 pt-2">
      {dias.map((d) => {
        const lista = doDia(eventos, d).sort((a, b) => a.inicio.localeCompare(b.inicio));
        const hoje = mesmoDia(d, new Date());
        return (
          <div
            key={d.toISOString()}
            className="rounded-2xl border p-3"
            style={{
              borderColor: hoje ? "rgba(242,107,31,0.45)" : "rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <button onClick={() => onDia(d)} className="mb-2 flex w-full items-center gap-2 text-left">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-xl text-sm font-semibold"
                style={{ background: hoje ? "#F26B1F" : "rgba(255,255,255,0.08)" }}
              >
                {d.getDate()}
              </span>
              <span className="text-sm capitalize opacity-70">{DIAS_CURTOS[d.getDay()]}</span>
              <span className="ml-auto text-[11px] opacity-40">{lista.length} compromisso(s)</span>
            </button>
            <div className="space-y-1.5">
              {lista.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onAbrir(e)}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left"
                  style={{ background: `${cor(e)}18` }}
                >
                  <span className="h-3 w-1 rounded-full" style={{ background: cor(e) }} />
                  <span className="w-11 shrink-0 text-[11px] tabular-nums opacity-70">
                    {e.dia_inteiro ? "dia" : hora(e.inicio)}
                  </span>
                  <span className="truncate text-[13px]">{e.titulo}</span>
                </button>
              ))}
              {lista.length === 0 ? <p className="px-2 py-1 text-[12px] opacity-30">livre</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VistaMes({
  ancora,
  eventos,
  cor,
  origem,
  onAbrir,
  onMudarDia,
}: VistaProps & { ancora: Date; onMudarDia: (d: Date) => void }) {
  const primeiro = new Date(ancora.getFullYear(), ancora.getMonth(), 1);
  const inicio = somarDias(inicioDoDia(primeiro), -primeiro.getDay());
  const celulas = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
  const doMes = (d: Date) => d.getMonth() === ancora.getMonth();
  const selecionados = doDia(eventos, ancora).sort((a, b) => a.inicio.localeCompare(b.inicio));

  return (
    <div className="pt-2">
      <div className="rounded-2xl border p-2" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
        <div className="grid grid-cols-7 pb-1">
          {DIAS_CURTOS.map((d) => (
            <span key={d} className="text-center text-[10px] uppercase tracking-wider opacity-40">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {celulas.map((d) => {
            const lista = doDia(eventos, d);
            const sel = mesmoDia(d, ancora);
            const hoje = mesmoDia(d, new Date());
            const cores = Array.from(new Set(lista.map((e) => cor(e)))).slice(0, 3);
            return (
              <button
                key={d.toISOString()}
                onClick={() => onMudarDia(inicioDoDia(d))}
                className="flex flex-col items-center gap-1 py-1.5"
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] tabular-nums"
                  style={{
                    background: sel ? "#F26B1F" : hoje ? "rgba(242,107,31,0.18)" : "transparent",
                    color: sel ? "#fff" : doMes(d) ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
                    fontWeight: sel || hoje ? 700 : 400,
                  }}
                >
                  {d.getDate()}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {cores.map((c, i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-2 mt-4 text-sm capitalize opacity-60">{porExtenso(ancora)}</p>
      <div className="space-y-2">
        {selecionados.map((e) => (
          <CardEvento key={e.id} e={e} cor={cor(e)} origem={origem(e)} onAbrir={onAbrir} />
        ))}
        {selecionados.length === 0 ? <Vazio texto="Nenhum compromisso nesse dia" /> : null}
      </div>
    </div>
  );
}

function VistaLista({ eventos, cor, origem, onAbrir }: VistaProps) {
  const grupos = useMemo(() => {
    const mapa = new Map<string, Evento[]>();
    for (const e of [...eventos].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
      const chave = inicioDoDia(new Date(e.inicio)).toISOString();
      mapa.set(chave, [...(mapa.get(chave) ?? []), e]);
    }
    return [...mapa.entries()];
  }, [eventos]);

  return (
    <div className="space-y-5 pt-2">
      {grupos.map(([chave, lista]) => (
        <div key={chave}>
          <p className="mb-2 text-xs uppercase tracking-widest opacity-45">
            {mesmoDia(new Date(chave), new Date()) ? "hoje · " : ""}
            {new Date(chave).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
          </p>
          <div className="space-y-2">
            {lista.map((e) => (
              <CardEvento key={e.id} e={e} cor={cor(e)} origem={origem(e)} onAbrir={onAbrir} />
            ))}
          </div>
        </div>
      ))}
      {grupos.length === 0 ? <Vazio texto="Nada nos próximos 60 dias" /> : null}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 opacity-35">
      <CalendarDays className="h-7 w-7" />
      <p className="text-sm">{texto}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhes                                                            */
/* ------------------------------------------------------------------ */

function Detalhes({ evento, cor, origem, onFechar }: { evento: Evento; cor: string; origem: string; onFechar: () => void }) {
  const d = (evento.detalhes ?? {}) as {
    link_reuniao?: string;
    organizador?: { nome?: string; email?: string };
    participantes?: Array<{ nome?: string; email?: string; status?: string }>;
    url?: string;
  };
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onClick={onFechar}>
      <div
        className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border-t p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        style={{ background: "#0b1122", borderColor: `${cor}55` }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: cor }} />
          <h2 className="flex-1 text-lg font-semibold leading-snug">{evento.titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="opacity-60">
            <X className="h-5 w-5" />
          </button>
        </div>

        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
          style={{ borderColor: cor, color: cor }}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {origem}
        </span>

        <div className="mt-4 space-y-3 text-sm">
          <Linha icone={<Clock className="h-4 w-4" />}>
            <span className="capitalize">{porExtenso(new Date(evento.inicio))}</span>
            {!evento.dia_inteiro ? ` · ${hora(evento.inicio)} – ${hora(evento.fim)}` : " · dia inteiro"}
          </Linha>

          {evento.local ? (
            <Linha icone={<MapPin className="h-4 w-4" />}>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(evento.local)}`}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {evento.local}
              </a>
            </Linha>
          ) : null}

          {d.link_reuniao ? (
            <Linha icone={<Link2 className="h-4 w-4" />}>
              <a href={d.link_reuniao} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: cor }}>
                Entrar na reunião
              </a>
            </Linha>
          ) : null}

          {d.participantes?.length ? (
            <Linha icone={<Users className="h-4 w-4" />}>
              <div className="flex flex-wrap gap-1.5">
                {d.participantes.map((p, i) => (
                  <span key={i} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "rgba(255,255,255,0.07)" }}>
                    {p.nome || p.email}
                  </span>
                ))}
              </div>
            </Linha>
          ) : null}

          {evento.descricao ? (
            <p className="whitespace-pre-wrap rounded-2xl p-3 text-[13px] leading-relaxed opacity-80" style={{ background: "rgba(255,255,255,0.04)" }}>
              {evento.descricao}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Linha({ icone, children }: { icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 opacity-50">{icone}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notificações                                                        */
/* ------------------------------------------------------------------ */

function Notificacoes({ token, pin, vapid, onFechar }: { token: string; pin: string | null; vapid: string; onFechar: () => void }) {
  const [ligado, setLigado] = useState(false);
  const [prefs, setPrefs] = useState({ lembrete: true, resumo: true, novo: true, minutosAntes: 30 });
  const [mensagem, setMensagem] = useState("");

  const salvar = useServerFn(salvarPushAgenda);
  const remover = useServerFn(removerPushAgenda);
  const testar = useServerFn(testarPushAgenda);

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator)) return;
      const reg = await navigator.serviceWorker.getRegistration("/agenda-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setLigado(!!sub);
    })();
  }, []);

  const ativar = useMutation({
    mutationFn: async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Esse aparelho não suporta notificações. No iPhone, adicione o app à tela de início primeiro.");
      }
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") throw new Error("Você precisa permitir as notificações.");
      const reg = await navigator.serviceWorker.register("/agenda-sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64urlParaUint8(vapid) as BufferSource,
        }));
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await salvar({
        data: {
          token,
          pin,
          endpoint: j.endpoint!,
          p256dh: j.keys!.p256dh!,
          auth: j.keys!.auth!,
          userAgent: navigator.userAgent,
          prefs,
        },
      });
      await testar({ data: { token, pin, endpoint: j.endpoint! } });
      return true;
    },
    onSuccess: () => {
      setLigado(true);
      setMensagem("Pronto! Mandei uma notificação de teste.");
    },
    onError: (e: Error) => setMensagem(e.message),
  });

  const desativar = useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.getRegistration("/agenda-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await remover({ data: { token, pin, endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
    },
    onSuccess: () => {
      setLigado(false);
      setMensagem("Notificações desligadas neste aparelho.");
    },
  });

  const atualizarPrefs = async (novo: typeof prefs) => {
    setPrefs(novo);
    if (!ligado) return;
    const reg = await navigator.serviceWorker.getRegistration("/agenda-sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    await salvar({
      data: { token, pin, endpoint: j.endpoint!, p256dh: j.keys!.p256dh!, auth: j.keys!.auth!, userAgent: navigator.userAgent, prefs: novo },
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onClick={onFechar}>
      <div
        className="w-full max-w-xl rounded-t-3xl border-t p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        style={{ background: "#0b1122", borderColor: "rgba(255,255,255,0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5" style={{ color: "#F26B1F" }} />
          <h2 className="flex-1 text-lg font-semibold">Notificações</h2>
          <button onClick={onFechar} aria-label="Fechar" className="opacity-60">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          <Opcao
            titulo="Lembrete antes do compromisso"
            ligado={prefs.lembrete}
            onToggle={() => void atualizarPrefs({ ...prefs, lembrete: !prefs.lembrete })}
          />
          {prefs.lembrete ? (
            <div className="flex gap-2 pl-1">
              {[10, 30, 60, 1440].map((m) => (
                <button
                  key={m}
                  onClick={() => void atualizarPrefs({ ...prefs, minutosAntes: m })}
                  className="rounded-full border px-3 py-1 text-xs"
                  style={{
                    borderColor: prefs.minutosAntes === m ? "#F26B1F" : "rgba(255,255,255,0.15)",
                    color: prefs.minutosAntes === m ? "#F26B1F" : "rgba(255,255,255,0.7)",
                  }}
                >
                  {m === 1440 ? "1 dia" : `${m} min`}
                </button>
              ))}
            </div>
          ) : null}
          <Opcao
            titulo="Resumo do dia às 7h"
            ligado={prefs.resumo}
            onToggle={() => void atualizarPrefs({ ...prefs, resumo: !prefs.resumo })}
          />
          <Opcao
            titulo="Novo compromisso sincronizado"
            ligado={prefs.novo}
            onToggle={() => void atualizarPrefs({ ...prefs, novo: !prefs.novo })}
          />
        </div>

        <button
          onClick={() => (ligado ? desativar.mutate() : ativar.mutate())}
          disabled={ativar.isPending || desativar.isPending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold"
          style={{ background: ligado ? "rgba(255,255,255,0.08)" : "#F26B1F" }}
        >
          {ativar.isPending || desativar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : ligado ? (
            <BellOff className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {ligado ? "Desligar neste aparelho" : "Ativar notificações"}
        </button>

        {mensagem ? <p className="mt-3 text-center text-xs opacity-70">{mensagem}</p> : null}

        <p className="mt-4 text-center text-[11px] leading-relaxed opacity-45">
          No iPhone: toque em Compartilhar → “Adicionar à Tela de Início” e abra pelo ícone antes de ativar.
        </p>
      </div>
    </div>
  );
}

function Opcao({ titulo, ligado, onToggle }: { titulo: string; ligado: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left"
      style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
    >
      <span className="flex-1 text-sm">{titulo}</span>
      <span
        className="relative h-6 w-10 rounded-full transition-colors"
        style={{ background: ligado ? "#F26B1F" : "rgba(255,255,255,0.15)" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: ligado ? 18 : 2 }}
        />
      </span>
    </button>
  );
}
