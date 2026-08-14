import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BedDouble,
  Link2Off,
  Loader2,
  LogIn,
  MousePointerClick,
  RefreshCw,
  Save,
  Radar,
  Search,
  X,
} from "lucide-react";
import {
  closeExpediaLoginFn,
  deleteExpediaSessionFn,
  listExpediaLogsFn,
  listExpediaSessionsFn,
  openExpediaLoginFn,
  saveExpediaLoginFn,
  shotExpediaLoginFn,
  stepExpediaLoginFn,
  testExpediaSearchFn,
  expediaPropertyRoomsFn,
  expediaDiscoverEndpointsFn,
} from "@/lib/expedia/expedia.functions";
import { confirm } from "@/lib/confirm";

export const Route = createFileRoute("/admin/expedia")({
  component: ExpediaPage,
  head: () => ({
    meta: [
      { title: "Expedia TAAP — Conexão e busca de hospedagem | VIA AIR" },
      {
        name: "description",
        content:
          "Conecte a conta Expedia TAAP, acompanhe o status da sessão e teste buscas de hospedagem no painel VIA AIR.",
      },
      { property: "og:title", content: "Expedia TAAP — VIA AIR" },
      { property: "og:description", content: "Conexão e testes de busca de hospedagem Expedia TAAP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Shot = { sessionId?: string; screenshot: string; currentUrl: string; title: string };

const money = (v: number | null, currency: string | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });

function ExpediaPage() {
  const qc = useQueryClient();

  const listSessions = useServerFn(listExpediaSessionsFn);
  const listLogs = useServerFn(listExpediaLogsFn);
  const removeSession = useServerFn(deleteExpediaSessionFn);
  const openLogin = useServerFn(openExpediaLoginFn);
  const stepLogin = useServerFn(stepExpediaLoginFn);
  const shotLogin = useServerFn(shotExpediaLoginFn);
  const saveLogin = useServerFn(saveExpediaLoginFn);
  const closeLogin = useServerFn(closeExpediaLoginFn);
  const testSearch = useServerFn(testExpediaSearchFn);
  const fetchRooms = useServerFn(expediaPropertyRoomsFn);
  const discover = useServerFn(expediaDiscoverEndpointsFn);

  const sessions = useQuery({ queryKey: ["expedia-sessions"], queryFn: () => listSessions() });
  const logs = useQuery({ queryKey: ["expedia-logs"], queryFn: () => listLogs() });

  const [live, setLive] = useState<Shot | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [typeText, setTypeText] = useState("");
  const [label, setLabel] = useState("Expedia TAAP");
  const [email, setEmail] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);

  const connected = (sessions.data ?? []).find((s) => s.status === "CONNECTED");

  const openMut = useMutation({
    mutationFn: () => openLogin({ data: {} as never }),
    onSuccess: (res) => {
      setSessionId(res.sessionId);
      setLive(res as unknown as Shot);
      toast.success("Navegador aberto. Faça o login na tela da Expedia.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stepMut = useMutation({
    mutationFn: (step: Record<string, unknown>) =>
      stepLogin({ data: { sessionId: sessionId!, step } as never }),
    onSuccess: (res) => setLive(res as unknown as Shot),
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMut = useMutation({
    mutationFn: () => shotLogin({ data: { sessionId: sessionId! } }),
    onSuccess: (res) => setLive(res as unknown as Shot),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      saveLogin({ data: { sessionId: sessionId!, label, accountEmail: email || null } }),
    onSuccess: (res) => {
      toast.success(`Sessão salva com ${res.cookieCount} cookies protegidos.`);
      setLive(null);
      setSessionId(null);
      qc.invalidateQueries({ queryKey: ["expedia-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMut = useMutation({
    mutationFn: () => closeLogin({ data: { sessionId: sessionId! } }),
    onSettled: () => {
      setLive(null);
      setSessionId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => removeSession({ data: { id } }),
    onSuccess: () => {
      toast.success("Sessão removida");
      qc.invalidateQueries({ queryKey: ["expedia-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ------------------------------------------------------------ teste busca
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [form, setForm] = useState({
    destination: "Rio de Janeiro",
    startDate: iso(new Date(today.getTime() + 30 * 864e5)),
    endDate: iso(new Date(today.getTime() + 33 * 864e5)),
    rooms: 1,
    adults: 2,
    children: 0,
  });

  const searchMut = useMutation({
    mutationFn: () => testSearch({ data: { ...form, type: "HOTEL_STANDALONE", refresh: true } as never }),
    onSuccess: (res) => {
      if (res.status !== "SUCCESS") toast.warning(res.message);
      qc.invalidateQueries({ queryKey: ["expedia-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // -------------------------------------------------- quartos da propriedade
  const [openProperty, setOpenProperty] = useState<string | null>(null);
  const roomsMut = useMutation({
    mutationFn: (h: { property_id: string | null; detail_url: string | null; name: string }) =>
      fetchRooms({
        data: {
          propertyId: h.property_id ?? "",
          detailUrl: h.detail_url,
          startDate: form.startDate,
          endDate: form.endDate,
          rooms: form.rooms,
          adults: form.adults,
          destination: form.destination,
        } as never,
      }),
    onSuccess: (res) => {
      if (res.status !== "SUCCESS") toast.warning(res.message);
      qc.invalidateQueries({ queryKey: ["expedia-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ------------------------------------------------ investigação do fluxo
  const [discoverUrl, setDiscoverUrl] = useState("https://www.expediataap.com.br/Hotel-Search");
  const discoverMut = useMutation({
    mutationFn: () => discover({ data: { url: discoverUrl } }),
    onSuccess: (res) => {
      if (res.status !== "SUCCESS") toast.warning(res.message);
      else toast.success(`${res.endpoints.length} respostas JSON observadas.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function clickOnShot(e: React.MouseEvent<HTMLImageElement>) {
    if (!imgRef.current || !sessionId) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 800);
    stepMut.mutate({ action: "click", x, y });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <BedDouble className="h-6 w-6 text-primary" /> Expedia TAAP
        </h1>
        <p className="text-sm text-muted-foreground">
          Integração provisória por navegador automatizado. A reserva é sempre finalizada manualmente
          na página da operadora — aqui só consultamos disponibilidade e tarifas.
        </p>
      </header>

      {/* ---------------------------------------------------- status */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium text-foreground">Conexão da conta</h2>
            <p className="text-sm text-muted-foreground">
              {connected
                ? `Conectada${connected.account_email ? ` — ${connected.account_email}` : ""} desde ${new Date(connected.created_at).toLocaleString("pt-BR")}`
                : "Nenhuma sessão conectada. Faça o login manual para autorizar as buscas."}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => sessions.refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
            <button
              onClick={() => openMut.mutate()}
              disabled={openMut.isPending || !!sessionId}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {openMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Conectar conta
            </button>
          </div>
        </div>

        {(sessions.data ?? []).length > 0 && (
          <ul className="mt-4 divide-y divide-border text-sm">
            {sessions.data!.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate">
                  <span className="font-medium text-foreground">{s.label}</span>{" "}
                  <span className="text-muted-foreground">{s.account_email ?? ""}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      s.status === "CONNECTED"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.status === "CONNECTED"
                      ? "Conectada"
                      : s.status === "AUTH_REQUIRED"
                        ? "Precisa reconectar"
                        : "Substituída"}
                  </span>
                  <button
                    onClick={() =>
                      confirm({
                        title: "Remover sessão",
                        description: "A conexão salva será apagada. Deseja continuar?",
                      }).then((ok) => ok && deleteMut.mutate(s.id))
                    }
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover sessão"
                  >
                    <Link2Off className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------- acesso automático */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-medium text-foreground">
              <KeyRound className="h-4 w-4 text-primary" /> Acesso automático
            </h2>
            <p className="text-sm text-muted-foreground">
              Guarde o acesso da conta (senha criptografada, nunca exibida) para o sistema renovar a
              sessão sozinho sempre que ela expirar — sem login manual toda vez.
            </p>
          </div>
          <button
            onClick={() => autoLoginMut.mutate()}
            disabled={autoLoginMut.isPending || !activeCredential}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            {autoLoginMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Conectar agora
          </button>
        </div>

        {activeCredential ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm">
            <span>
              <span className="font-medium text-foreground">{activeCredential.account_email}</span>
              <span className="ml-2 text-muted-foreground">
                {activeCredential.last_login_at
                  ? `último login automático em ${new Date(activeCredential.last_login_at).toLocaleString("pt-BR")}`
                  : "ainda sem login automático"}
              </span>
              {activeCredential.last_error && (
                <span className="mt-1 block text-xs text-destructive">{activeCredential.last_error}</span>
              )}
            </span>
            <button
              onClick={() =>
                confirm({
                  title: "Remover acesso salvo",
                  description: "O sistema deixará de renovar a sessão sozinho. Deseja continuar?",
                }).then((ok) => ok && deleteCredMut.mutate(activeCredential.id))
              }
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remover acesso salvo"
            >
              <Link2Off className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <input
              type="email"
              value={credEmail}
              onChange={(e) => setCredEmail(e.target.value)}
              placeholder="E-mail da conta Expedia TAAP"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={credPassword}
              onChange={(e) => setCredPassword(e.target.value)}
              placeholder="Senha"
              autoComplete="new-password"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => saveCredMut.mutate()}
              disabled={saveCredMut.isPending || !credEmail || !credPassword}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {saveCredMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar e conectar
            </button>
          </div>
        )}
      </section>


      {/* ---------------------------------------------------- login vivo */}
      {live && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-foreground">Login manual</h2>
            <span className="truncate text-xs text-muted-foreground">{live.currentUrl}</span>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <MousePointerClick className="h-3.5 w-3.5" /> Clique na imagem para clicar na página. Digite
            no campo abaixo para preencher o item selecionado.
          </p>
          <img
            ref={imgRef}
            src={`data:image/jpeg;base64,${live.screenshot}`}
            alt="Tela da Expedia no navegador remoto"
            onClick={clickOnShot}
            className="w-full cursor-crosshair rounded-lg border border-border"
          />
          <div className="flex flex-wrap gap-2">
            <input
              value={typeText}
              onChange={(e) => setTypeText(e.target.value)}
              placeholder="Texto para digitar no campo focado"
              className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => stepMut.mutate({ action: "type", x: 0, y: 0, text: typeText })}
              disabled={!typeText || stepMut.isPending}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
            >
              Digitar
            </button>
            <button
              onClick={() => stepMut.mutate({ action: "press", key: "Enter" })}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Enter
            </button>
            <button
              onClick={() => stepMut.mutate({ action: "scroll", dy: 400 })}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Rolar
            </button>
            <button
              onClick={() => refreshMut.mutate()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              {refreshMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar tela
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Apelido da conexão"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail da conta (opcional)"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar sessão
            </button>
            <button
              onClick={() => closeMut.mutate()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <X className="h-4 w-4" /> Fechar
            </button>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- teste de busca */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="font-medium text-foreground">Teste de busca — hospedagem</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
            placeholder="Destino"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm lg:col-span-2"
          />
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            max={6}
            value={form.rooms}
            onChange={(e) => setForm({ ...form, rooms: Number(e.target.value) })}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            aria-label="Quartos"
          />
          <input
            type="number"
            min={1}
            max={8}
            value={form.adults}
            onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            aria-label="Adultos"
          />
        </div>
        <button
          onClick={() => searchMut.mutate()}
          disabled={searchMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {searchMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Pesquisar
        </button>

        {searchMut.data && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {searchMut.data.message} — {searchMut.data.results.length} hospedagens
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {searchMut.data.results.map((h, i) => (
                <article key={`${h.property_id ?? h.name}-${i}`} className="overflow-hidden rounded-lg border border-border">
                  {h.image && (
                    <img src={h.image} alt={h.name} loading="lazy" className="h-32 w-full object-cover" />
                  )}
                  <div className="space-y-1 p-3">
                    <h3 className="line-clamp-2 text-sm font-medium text-foreground">{h.name}</h3>
                    <p className="text-xs text-muted-foreground">{h.destination ?? "—"}</p>
                    <p className="text-sm font-semibold text-primary">
                      {money(h.price.nightly ?? h.price.total, h.price.currency)}
                    </p>
                    <button
                      onClick={() => {
                        setOpenProperty(h.property_id ?? h.name);
                        roomsMut.mutate(h);
                      }}
                      disabled={roomsMut.isPending}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                    >
                      {roomsMut.isPending && openProperty === (h.property_id ?? h.name) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <BedDouble className="h-3.5 w-3.5" />
                      )}
                      Ver quartos
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------- quartos da propriedade */}
      {roomsMut.data?.data && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5">
          <h2 className="font-medium text-foreground">Quartos e tarifas</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {roomsMut.data.data.rooms.map((r, i) => (
              <article key={`${r.room_type_id ?? r.name}-${i}`} className="rounded-lg border border-border p-3">
                <h3 className="text-sm font-medium text-foreground">{r.name}</h3>
                <p className="text-xs text-muted-foreground">{r.beds ?? "—"} · {r.meal ?? "sem refeição informada"}</p>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {money(r.price.total ?? r.price.nightly, r.price.currency)}
                </p>
                {r.cancellation_text && <p className="mt-1 text-xs text-muted-foreground">{r.cancellation_text}</p>}
                {r.installments?.max_installments && (
                  <p className="text-xs text-muted-foreground">Até {r.installments.max_installments}x informado pela operadora</p>
                )}
                {r.select_action && (
                  <a
                    href={r.select_action}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-primary underline"
                  >
                    Abrir na Expedia para reservar
                  </a>
                )}
              </article>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            O checkout continua manual na página da operadora — o sistema não cria URLs de reserva.
          </p>
        </section>
      )}

      {/* ------------------------------------------------- investigação */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="font-medium text-foreground">Investigar fluxo do TAAP</h2>
        <p className="text-xs text-muted-foreground">
          Abre uma URL real do expediataap.com.br na sessão conectada e lista as respostas JSON que o próprio site
          consome. Serve só para mapear o fluxo — nenhuma dessas chamadas é tratada como API pública.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={discoverUrl}
            onChange={(e) => setDiscoverUrl(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="https://www.expediataap.com.br/..."
          />
          <button
            onClick={() => discoverMut.mutate()}
            disabled={discoverMut.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {discoverMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            Investigar
          </button>
        </div>
        {discoverMut.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Endpoint</th>
                  <th>Hotéis</th>
                  <th>Quartos</th>
                  <th>Chaves</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {discoverMut.data.endpoints.map((e, i) => (
                  <tr key={`${e.url}-${i}`}>
                    <td className="max-w-[380px] truncate py-2" title={e.url}>{e.url}</td>
                    <td>{e.hasProperties ? "sim" : "—"}</td>
                    <td>{e.hasRooms ? "sim" : "—"}</td>
                    <td className="max-w-[280px] truncate" title={e.topKeys.join(", ")}>{e.topKeys.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- logs */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="mb-3 font-medium text-foreground">Últimas consultas</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Quando</th>
                <th>Status</th>
                <th>Origem</th>
                <th>Resultados</th>
                <th>Tempo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(logs.data ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="py-2">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                  <td>{l.status}</td>
                  <td>{l.source_level ?? "—"}</td>
                  <td>{l.results_count ?? 0}</td>
                  <td>{l.duration_ms ? `${(l.duration_ms / 1000).toFixed(1)}s` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
