import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Instagram, Send, MessageSquare, Image as ImageIcon, ExternalLink, CheckCircle2, XCircle, Loader2, Copy, Activity, RefreshCw, ShieldCheck, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listInstagramAccounts,
  listInstagramComments,
  listInstagramMedia,
  upsertInstagramAccount,
  triggerAutoReplyComment,
  publishToInstagram,
  getInstagramDiagnostics,
  testInstagramConnection,
} from "@/lib/instagram/queries.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/instagram")({
  component: InstagramAdminPage,
  head: () => ({
    meta: [
      { title: "Instagram — VIA AIR" },
      { name: "description", content: "Central Instagram: DMs, comentários e publicações da VIA AIR." },
      { property: "og:title", content: "Instagram — VIA AIR" },
      { property: "og:description", content: "Central Instagram VIA AIR" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function InstagramAdminPage() {
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-gradient-to-br from-pink-500 to-orange-500 p-2 text-white">
          <Instagram className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Instagram</h1>
          <p className="text-xs text-slate-500">Configure a conta, responda comentários e publique story/feed.</p>
        </div>
      </header>

      <Tabs defaultValue="setup">
        <TabsList>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="comments">
            <MessageSquare className="mr-1 h-3.5 w-3.5" /> Comentários
          </TabsTrigger>
          <TabsTrigger value="publish">
            <ImageIcon className="mr-1 h-3.5 w-3.5" /> Publicar
          </TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="diagnostics"><Activity className="mr-1 h-3.5 w-3.5" /> Diagnóstico</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="mt-4">
          <SetupTab />
        </TabsContent>
        <TabsContent value="comments" className="mt-4">
          <CommentsTab />
        </TabsContent>
        <TabsContent value="publish" className="mt-4">
          <PublishTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="diagnostics" className="mt-4">
          <DiagnosticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ Setup ============

function SetupTab() {
  const listFn = useServerFn(listInstagramAccounts);
  const upsertFn = useServerFn(upsertInstagramAccount);
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ["ig-accounts"], queryFn: () => listFn() });

  const [form, setForm] = useState({ ig_user_id: "", page_id: "", username: "", display_name: "", access_token: "", is_default: true });
  const mut = useMutation({
    mutationFn: () => upsertFn({ data: form }),
    onSuccess: () => {
      toast.success("Conta salva");
      qc.invalidateQueries({ queryKey: ["ig-accounts"] });
      setForm((f) => ({ ...f, access_token: "" }));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/instagram-webhook` : "";

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold">Passo a passo</h2>
        <ol className="space-y-3 text-xs text-slate-700">
          <li>
            <b>1.</b> Converta seu perfil Instagram em <b>Business</b> e vincule à Página do Facebook da VIA AIR.
          </li>
          <li>
            <b>2.</b> Em <a className="text-[#F26B1F] underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> crie/abra o app Meta e adicione o produto <b>Instagram Graph API</b>.
          </li>
          <li>
            <b>3.</b> Solicite as permissões: <code className="rounded bg-slate-100 px-1">instagram_business_basic</code>, <code className="rounded bg-slate-100 px-1">instagram_business_manage_messages</code>, <code className="rounded bg-slate-100 px-1">instagram_business_manage_comments</code>, <code className="rounded bg-slate-100 px-1">instagram_business_content_publish</code>.
          </li>
          <li>
            <b>4.</b> Configure o webhook do Instagram com:
            <div className="mt-1 flex items-center gap-2 rounded bg-slate-50 p-2 font-mono text-[10px]">
              <span className="flex-1 break-all">{webhookUrl}</span>
              <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copiado"); }}>
                <Copy className="h-3 w-3" />
              </button>
            </div>
            e o <b>Verify Token</b> configurado no secret <code className="rounded bg-slate-100 px-1">META_IG_VERIFY_TOKEN</code>.
          </li>
          <li>
            <b>5.</b> Assine os campos: <code>messages</code>, <code>messaging_postbacks</code>, <code>comments</code>, <code>mentions</code>.
          </li>
          <li>
            <b>6.</b> Gere um <b>Long-lived Access Token</b> do IG Business e cole abaixo junto com o IG User ID e Page ID.
          </li>
          <li>
            <b>7.</b> Envie o vídeo de demonstração (baixe em <code>/mnt/documents/meta-app-review-instagram.mp4</code>) no App Review da Meta.
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold">Adicionar conta</h2>
        <div className="space-y-3">
          <Field label="Instagram User ID" value={form.ig_user_id} onChange={(v) => setForm({ ...form, ig_user_id: v })} placeholder="17841400000000000" />
          <Field label="Facebook Page ID" value={form.page_id} onChange={(v) => setForm({ ...form, page_id: v })} placeholder="12345678901234" />
          <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} placeholder="viaair" />
          <Field label="Nome exibido" value={form.display_name} onChange={(v) => setForm({ ...form, display_name: v })} placeholder="VIA AIR" />
          <Field label="Access Token (long-lived)" value={form.access_token} onChange={(v) => setForm({ ...form, access_token: v })} placeholder="EAA..." type="password" />
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.ig_user_id || !form.page_id || !form.username}
            className="w-full rounded-md bg-[#F26B1F] py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {mut.isPending ? "Salvando..." : "Salvar conta"}
          </button>
        </div>

        <h3 className="mt-6 mb-2 text-xs font-semibold text-slate-500">Contas configuradas</h3>
        <div className="space-y-2">
          {accounts.length === 0 && <p className="text-xs text-slate-400">Nenhuma conta ainda.</p>}
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-slate-200 p-2 text-xs">
              <div>
                <b>@{a.username}</b> {a.is_default && <span className="ml-1 rounded bg-orange-100 px-1 text-[9px] text-[#F26B1F]">padrão</span>}
                <div className="text-[10px] text-slate-500">IG {a.ig_user_id}</div>
              </div>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px]", a.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                {a.active ? "ativa" : "inativa"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-600">{label}</span>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-[#F26B1F] focus:outline-none"
      />
    </label>
  );
}

// ============ Comments ============

function CommentsTab() {
  const listFn = useServerFn(listInstagramComments);
  const replyFn = useServerFn(triggerAutoReplyComment);
  const qc = useQueryClient();
  const { data: comments = [] } = useQuery({ queryKey: ["ig-comments"], queryFn: () => listFn(), refetchInterval: 30_000 });

  const [drafts, setDrafts] = useState<Record<string, { pub: string; dm: string }>>({});

  const mut = useMutation({
    mutationFn: (v: { id: string; pub: string; dm: string }) => replyFn({ data: { id: v.id, public_reply: v.pub, private_dm: v.dm || undefined } }),
    onSuccess: () => {
      toast.success("Resposta enviada");
      qc.invalidateQueries({ queryKey: ["ig-comments"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3">
      {comments.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          Nenhum comentário ainda. Quando alguém comentar num post, aparece aqui.
        </div>
      )}
      {comments.map((c) => {
        const draft = drafts[c.id] ?? { pub: "Obrigado pelo interesse! 💛 Já te chamei no direct.", dm: "Oi! Vi seu comentário 😊 Posso te enviar as opções disponíveis?" };
        return (
          <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <b className="text-sm">@{c.from_username ?? "anon"}</b>
                  {c.media_permalink && (
                    <a href={c.media_permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-[#F26B1F]">
                      <ExternalLink className="h-3 w-3" /> post
                    </a>
                  )}
                  <span className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleString("pt-BR")}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{c.text}</p>
              </div>
              <StatusPill status={c.auto_reply_status} />
            </div>

            {c.auto_reply_status !== "sent" ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <textarea
                  className="rounded-md border border-slate-200 p-2 text-xs"
                  rows={2}
                  placeholder="Resposta pública"
                  value={draft.pub}
                  onChange={(e) => setDrafts({ ...drafts, [c.id]: { ...draft, pub: e.target.value } })}
                />
                <textarea
                  className="rounded-md border border-slate-200 p-2 text-xs"
                  rows={2}
                  placeholder="DM privada ao autor (opcional)"
                  value={draft.dm}
                  onChange={(e) => setDrafts({ ...drafts, [c.id]: { ...draft, dm: e.target.value } })}
                />
                <div className="md:col-span-2 flex justify-end">
                  <button
                    onClick={() => mut.mutate({ id: c.id, pub: draft.pub, dm: draft.dm })}
                    disabled={mut.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-[#F26B1F] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" /> Responder + DM
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded bg-emerald-50 p-2 text-xs text-emerald-700">
                Respondido em {c.auto_replied_at && new Date(c.auto_replied_at).toLocaleString("pt-BR")}
                {c.auto_dm_sent_at && " · DM enviada"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "sent") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700"><CheckCircle2 className="h-3 w-3" /> respondido</span>;
  if (status === "failed") return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700"><XCircle className="h-3 w-3" /> falhou</span>;
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">pendente</span>;
}

// ============ Publish ============

function PublishTab() {
  const accFn = useServerFn(listInstagramAccounts);
  const pubFn = useServerFn(publishToInstagram);
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ["ig-accounts"], queryFn: () => accFn() });

  const [accountId, setAccountId] = useState("");
  const [mediaType, setMediaType] = useState<"story_image" | "feed_image" | "carousel">("feed_image");
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");

  const mut = useMutation({
    mutationFn: () => pubFn({ data: { account_id: accountId, media_type: mediaType, image_urls: [imageUrl], caption } }),
    onSuccess: (r) => {
      toast.success(`Publicado! ${r.permalink ?? ""}`);
      qc.invalidateQueries({ queryKey: ["ig-media"] });
      setImageUrl(""); setCaption("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const disabled = !accountId || !imageUrl || accounts.length === 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold">Publicar no Instagram</h2>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Conta</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-md border border-slate-200 p-2 text-xs">
            <option value="">Selecione...</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Tipo</span>
          <select value={mediaType} onChange={(e) => setMediaType(e.target.value as typeof mediaType)} className="w-full rounded-md border border-slate-200 p-2 text-xs">
            <option value="story_image">Story (imagem)</option>
            <option value="feed_image">Feed (foto única)</option>
            <option value="carousel">Feed carrossel</option>
          </select>
        </label>
        <Field label="URL da imagem" value={imageUrl} onChange={setImageUrl} placeholder="https://..." />
        {mediaType !== "story_image" && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium">Legenda</span>
            <textarea rows={4} className="w-full rounded-md border border-slate-200 p-2 text-xs" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="✈️ Pacote Orlando..." />
          </label>
        )}
        <button
          onClick={() => mut.mutate()}
          disabled={disabled || mut.isPending}
          className="w-full rounded-md bg-gradient-to-r from-pink-500 to-orange-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {mut.isPending ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Publicando...</span> : "Publicar"}
        </button>
      </div>
    </div>
  );
}

function HistoryTab() {
  const listFn = useServerFn(listInstagramMedia);
  const { data: media = [] } = useQuery({ queryKey: ["ig-media"], queryFn: () => listFn(), refetchInterval: 20_000 });

  if (media.length === 0) return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">Nenhuma publicação ainda.</div>;

  return (
    <div className="space-y-2">
      {media.map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
          {m.image_urls?.[0] && <img src={m.image_urls[0]} alt="" className="h-12 w-12 rounded object-cover" />}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">{m.media_type}</div>
            {m.caption && <div className="truncate text-[10px] text-slate-500">{m.caption}</div>}
            <div className="text-[10px] text-slate-400">
              {m.status} {m.published_at && `· ${new Date(m.published_at).toLocaleString("pt-BR")}`}
            </div>
          </div>
          {m.permalink && (
            <a href={m.permalink} target="_blank" rel="noreferrer" className="text-[10px] text-[#F26B1F] hover:underline">ver</a>
          )}
        </div>
      ))}
    </div>
  );
}

function DiagnosticsTab() {
  const diagnosticsFn = useServerFn(getInstagramDiagnostics);
  const testFn = useServerFn(testInstagramConnection);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["ig-diagnostics"], queryFn: () => diagnosticsFn(), refetchInterval: 60_000 });
  const test = useMutation({
    mutationFn: () => testFn({ data: {} }),
    onSuccess: () => { toast.success("Teste concluído"); qc.invalidateQueries({ queryKey: ["ig-diagnostics"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no teste"),
  });
  if (isLoading) return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="animate-spin" /> Carregando diagnóstico…</div>;
  if (error || !data) return <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar o diagnóstico"}</div>;
  const latest = data.checks[0];
  const healthy = latest?.overall_status === "healthy";
  const account = data.accounts[0];
  const accountMetadata = account?.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata) ? account.metadata : null;
  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("grid h-10 w-10 place-items-center rounded-md", healthy ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive")}><Activity /></div>
          <div><h2 className="font-semibold text-foreground">Saúde da integração</h2><p className="text-xs text-muted-foreground">{latest ? (healthy ? "Todos os testes passaram" : latest.last_error ?? "Falha detectada") : "Nenhum teste executado"}</p></div>
        </div>
        <Button onClick={() => test.mutate()} disabled={test.isPending}>{test.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Testar Instagram</Button>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DiagnosticCard label="Conexão" value={latest?.account_connected ? "Conectada" : "Não confirmada"} ok={latest?.account_connected} icon={<Instagram />} />
        <DiagnosticCard label="Token / API" value={latest?.token_valid ? `HTTP ${latest.http_status ?? 200}` : `Falha HTTP ${latest?.http_status ?? "—"}`} ok={latest?.token_valid} icon={<ShieldCheck />} />
        <DiagnosticCard label="Webhook" value={latest?.webhook_reachable ? "Callback acessível" : "Callback indisponível"} ok={latest?.webhook_reachable} icon={<Webhook />} />
        <DiagnosticCard label="Campo messages" value={latest?.messages_subscribed ? "Assinado" : "Não assinado"} ok={latest?.messages_subscribed} icon={<MessageSquare />} />
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Configuração observada</h3>
        <dl className="grid gap-x-6 gap-y-3 text-xs md:grid-cols-2">
          <Detail label="App ID" value={latest?.app_id ?? String(accountMetadata?.app_id ?? "Não identificado")} />
          <Detail label="IG User ID" value={latest?.ig_user_id ?? account?.ig_user_id ?? "—"} />
          <Detail label="Conta conectada" value={latest?.connected_username ? `@${latest.connected_username}` : account?.username ? `@${account.username}` : "—"} />
          <Detail label="Callback" value={data.callbackUrl} />
          <Detail label="Último webhook" value={latest?.last_webhook_at ? new Date(latest.last_webhook_at).toLocaleString("pt-BR") : "Nenhum registrado"} />
          <Detail label="Campos assinados" value={latest?.subscribed_fields?.join(", ") || "Nenhum confirmado"} />
          <Detail label="Último erro Meta" value={latest?.last_error ?? "Sem erro"} />
          <Detail label="fbtrace_id" value={latest?.fbtrace_id ?? "—"} />
        </dl>
      </section>

      <LogTable title="Webhooks recebidos" empty="Nenhuma requisição chegou ao callback" rows={data.webhookLogs.map((log) => ({ id: log.id, at: log.received_at, main: `${log.method} · ${log.event_type ?? "evento desconhecido"}`, status: `${log.response_status ?? "—"} · ${log.processing_status}`, detail: log.rejection_reason ?? log.processing_error ?? `message_id: ${log.message_external_id ?? "—"}` }))} />
      <LogTable title="Chamadas à Meta" empty="Nenhuma chamada registrada" rows={data.apiLogs.map((log) => ({ id: log.id, at: log.created_at, main: `${log.method} · ${log.operation}`, status: `HTTP ${log.http_status ?? "—"} · ${log.success ? "OK" : "falha"}`, detail: log.error_message ?? `fbtrace_id: ${log.fbtrace_id ?? "—"}` }))} />
      <LogTable title="Mensagens recebidas" empty="Nenhuma DM recebida" rows={data.receivedMessages.map((message) => { const relation = Array.isArray(message.instagram_conversations) ? message.instagram_conversations[0] : message.instagram_conversations; return { id: message.id, at: message.created_at, main: `${message.message_type} · usuário ${relation?.contact_ig_id ?? "—"}`, status: `message_id: ${message.ig_message_id ?? "—"}`, detail: `conversation_id: ${message.conversation_id}` }; })} />
    </div>
  );
}

function DiagnosticCard({ label, value, ok, icon }: { label: string; value: string; ok?: boolean | null; icon: React.ReactNode }) {
  return <div className="rounded-lg border bg-card p-4"><div className={cn("mb-3 [&_svg]:h-4 [&_svg]:w-4", ok ? "text-emerald-600" : "text-destructive")}>{icon}</div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium text-foreground">{value}</div></div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 break-all font-mono text-foreground">{value}</dd></div>; }

function LogTable({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; at: string; main: string; status: string; detail: string }> }) {
  return <section className="overflow-hidden rounded-lg border bg-card"><div className="border-b px-4 py-3 text-sm font-semibold text-foreground">{title}</div>{rows.length === 0 ? <p className="p-5 text-xs text-muted-foreground">{empty}</p> : <div className="divide-y">{rows.slice(0, 30).map((row) => <div key={row.id} className="grid gap-1 p-3 text-xs md:grid-cols-[160px_1fr_180px] md:items-center"><time className="text-muted-foreground">{new Date(row.at).toLocaleString("pt-BR")}</time><div className="min-w-0"><div className="font-medium text-foreground">{row.main}</div><div className="break-all text-muted-foreground">{row.detail}</div></div><div className="font-mono text-muted-foreground md:text-right">{row.status}</div></div>)}</div>}</section>;
}
