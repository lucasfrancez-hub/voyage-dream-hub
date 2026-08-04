import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, BellOff, Check, X, Smartphone, Loader2, Send, Copy, Trash2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { confirm } from "@/lib/confirm";
import { listarLinksChat, criarLinkChat, removerLinkChat } from "@/lib/chat/device-session.functions";
import {
  chaveVapidChat,
  salvarPushChat,
  removerPushChat,
  testarPushChat,
  listarAparelhosPushChat,
} from "@/lib/chat/push.functions";
import { b64urlParaUint8, ehIOS, ehStandalone, nomeDoAparelho, SW_URL } from "@/lib/chat/push-client";

export const Route = createFileRoute("/chat/notificacoes")({
  ssr: false,
  component: NotificacoesPage,
  head: () => ({
    meta: [
      { title: "Notificações — VIA AIR Chat" },
      { name: "description", content: "Ative as notificações push da Central de Atendimento neste aparelho." },
      { property: "og:title", content: "Notificações — VIA AIR Chat" },
      { property: "og:description", content: "Ative as notificações push da Central de Atendimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Aparelho = {
  id: string;
  endpoint: string;
  device_name: string | null;
  ativo: boolean;
  failure_count: number;
  last_success_at: string | null;
  last_test_at: string | null;
};

function Linha({ ok, label, valor }: { ok: boolean | null; label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-slate-900">
        {ok === true && <Check className="h-4 w-4 text-emerald-600" />}
        {ok === false && <X className="h-4 w-4 text-rose-600" />}
        {valor}
      </span>
    </div>
  );
}

function NotificacoesPage() {
  const [suportado, setSuportado] = useState(false);
  const [permissao, setPermissao] = useState<NotificationPermission | "indisponivel">("indisponivel");
  const [swOk, setSwOk] = useState(false);
  const [assinado, setAssinado] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const pegarVapid = useServerFn(chaveVapidChat);
  const salvar = useServerFn(salvarPushChat);
  const remover = useServerFn(removerPushChat);
  const testar = useServerFn(testarPushChat);
  const listar = useServerFn(listarAparelhosPushChat);

  const atualizar = useCallback(async () => {
    const cap = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSuportado(cap);
    if ("Notification" in window) setPermissao(Notification.permission);
    if (cap) {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL).catch(() => null);
      setSwOk(!!reg);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      setAssinado(!!sub);
      setEndpoint(sub?.endpoint ?? null);
    }
    try {
      setAparelhos((await listar({})) as Aparelho[]);
    } catch {
      /* silencioso */
    }
  }, [listar]);

  useEffect(() => {
    void atualizar();
  }, [atualizar]);

  const ativar = async () => {
    setOcupado(true);
    try {
      if (!suportado) {
        toast.error("Este navegador não suporta notificações push.");
        return;
      }
      if (ehIOS() && !ehStandalone()) {
        toast.error("No iPhone, abra o app pelo ícone da Tela de Início para ativar as notificações.");
        return;
      }
      const perm = await Notification.requestPermission();
      setPermissao(perm);
      if (perm !== "granted") {
        toast.error("As notificações foram bloqueadas. Abra Ajustes > Notificações > VIA AIR Chat e permita.");
        return;
      }
      const { vapid } = await pegarVapid({});
      if (!vapid) {
        toast.error("Notificações não configuradas no servidor.");
        return;
      }
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
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
          endpoint: j.endpoint!,
          p256dh: j.keys!.p256dh!,
          auth: j.keys!.auth!,
          userAgent: navigator.userAgent,
          deviceName: nomeDoAparelho(),
        },
      });
      const t = await testar({ data: { endpoint: j.endpoint! } });
      toast[t.ok ? "success" : "error"](
        t.ok ? "Notificações ativadas. Enviamos um teste pelo servidor." : `Assinatura salva, mas o teste falhou: ${t.erro}`,
      );
      await atualizar();
    } catch (e) {
      toast.error((e as Error).message || "Não consegui ativar as notificações.");
    } finally {
      setOcupado(false);
    }
  };

  const desativar = async () => {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await remover({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      if ("clearAppBadge" in navigator) await (navigator as Navigator & { clearAppBadge(): Promise<void> }).clearAppBadge();
      toast.success("Notificações desativadas neste aparelho.");
      await atualizar();
    } catch (e) {
      toast.error((e as Error).message || "Falha ao desativar.");
    } finally {
      setOcupado(false);
    }
  };

  const enviarTeste = async () => {
    if (!endpoint) return;
    setOcupado(true);
    const t = await testar({ data: { endpoint } });
    toast[t.ok ? "success" : "error"](t.ok ? "Notificação de teste enviada pelo servidor." : t.erro || "Falha no envio.");
    await atualizar();
    setOcupado(false);
  };

  const iosSemInstalar = ehIOS() && !ehStandalone();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Notificações</h1>
        <p className="text-sm text-slate-500">Receba um aviso no aparelho quando chegar mensagem nova de cliente.</p>
      </header>

      {iosSemInstalar && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Para receber notificações no iPhone:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Abra este sistema no Safari.</li>
            <li>Toque no botão Compartilhar.</li>
            <li>Selecione “Adicionar à Tela de Início”.</li>
            <li>Abra o aplicativo pelo novo ícone.</li>
            <li>Volte nesta tela e toque em “Ativar notificações”.</li>
          </ol>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <Linha ok={suportado} label="Navegador compatível" valor={suportado ? "Sim" : "Não"} />
        <Linha ok={swOk} label="Service Worker registrado" valor={swOk ? "Sim" : "Não"} />
        <Linha
          ok={permissao === "granted" ? true : permissao === "denied" ? false : null}
          label="Permissão"
          valor={permissao === "granted" ? "Concedida" : permissao === "denied" ? "Bloqueada" : "Ainda não pedida"}
        />
        <Linha ok={assinado} label="Assinatura push ativa" valor={assinado ? "Sim" : "Não"} />
        <Linha ok={ehStandalone() ? true : null} label="Aberto como aplicativo" valor={ehStandalone() ? "Sim" : "Pelo navegador"} />
      </div>

      <div className="flex flex-wrap gap-2">
        {!assinado || permissao !== "granted" ? (
          <button
            onClick={() => void ativar()}
            disabled={ocupado}
            className="inline-flex items-center gap-2 rounded-lg bg-[#F26B1F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Ativar notificações neste dispositivo
          </button>
        ) : (
          <>
            <button
              onClick={() => void enviarTeste()}
              disabled={ocupado}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> Enviar notificação de teste
            </button>
            <button
              onClick={() => void desativar()}
              disabled={ocupado}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              <BellOff className="h-4 w-4" /> Desativar neste dispositivo
            </button>
          </>
        )}
      </div>

      {permissao === "denied" && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          As notificações foram bloqueadas. Abra Ajustes &gt; Notificações &gt; VIA AIR Chat (ou as permissões do site no
          navegador) e permita as notificações.
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Meus aparelhos</h2>
        {aparelhos.length === 0 && <p className="text-sm text-slate-500">Nenhum aparelho cadastrado ainda.</p>}
        <ul className="space-y-2">
          {aparelhos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-slate-800">
                <Smartphone className="h-4 w-4 text-slate-400" />
                {a.device_name || "Aparelho"}
                {endpoint === a.endpoint && <span className="text-xs text-emerald-600">(este)</span>}
              </span>
              <span className="text-xs text-slate-500">
                {a.ativo ? "ativo" : "inativo"}
                {a.last_success_at ? ` · último envio ${new Date(a.last_success_at).toLocaleString("pt-BR")}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <AppNoCelular />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App no celular: link secreto + PIN (igual à Agenda)                 */
/* ------------------------------------------------------------------ */

type LinkApp = { id: string; token: string; nome: string; ativo: boolean; last_seen_at: string | null };

function AppNoCelular() {
  const carregar = useServerFn(listarLinksChat);
  const criar = useServerFn(criarLinkChat);
  const remover = useServerFn(removerLinkChat);

  const [links, setLinks] = useState<LinkApp[]>([]);
  const [nome, setNome] = useState("");
  const [pin, setPin] = useState("");
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const r = (await carregar()) as { links: LinkApp[] };
      setLinks(r.links);
    } catch { /* sem acesso */ }
  }, [carregar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const base = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">App no celular</h2>
      <p className="mb-3 text-xs text-slate-500">
        Link secreto (sem login) para adicionar à tela de início. Protegido por PIN de 4 números e válido por 30 dias
        a cada uso.
      </p>

      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm text-slate-900">{l.nome}</span>
              <button
                type="button"
                aria-label="Copiar link"
                onClick={() => {
                  void navigator.clipboard.writeText(`${base}/chat/app/${l.token}`);
                  toast.success("Link copiado.");
                }}
              >
                <Copy className="h-4 w-4 text-slate-400 hover:text-primary" />
              </button>
              <button
                type="button"
                aria-label="Remover link"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Remover este link?",
                    description: "Quem já instalou o app com ele perde o acesso.",
                  });
                  if (!ok) return;
                  await remover({ data: { id: l.id } });
                  toast.success("Link removido.");
                  void recarregar();
                }}
              >
                <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" />
              </button>
            </div>
            <p className="mt-1 break-all text-[11px] text-slate-500">{`${base}/chat/app/${l.token}`}</p>
          </li>
        ))}
        {links.length === 0 && <p className="text-xs text-slate-500">Nenhum link criado ainda.</p>}
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
              await criar({ data: { nome: nome.trim() || undefined, pin } });
              setNome("");
              setPin("");
              toast.success("Link do app criado.");
              void recarregar();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Não foi possível criar o link.");
            } finally {
              setSalvando(false);
            }
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Criar link do app
        </Button>
      </div>
    </section>
  );
}
