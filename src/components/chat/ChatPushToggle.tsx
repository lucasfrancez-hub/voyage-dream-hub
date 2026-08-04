import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { chaveVapidChat, salvarPushChat, removerPushChat, testarPushChat } from "@/lib/chat/push.functions";
import { assinarPush } from "@/lib/chat/push-client";

function b64urlParaUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function ehStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function ehIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Liga/desliga as notificações push do Chat neste aparelho. */
export function ChatPushToggle() {
  const [ligado, setLigado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [suportado, setSuportado] = useState(true);

  const pegarVapid = useServerFn(chaveVapidChat);
  const salvar = useServerFn(salvarPushChat);
  const remover = useServerFn(removerPushChat);
  const testar = useServerFn(testarPushChat);

  useEffect(() => {
    void (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setSuportado(false);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/chat-sw.js");
        const sub = await reg.pushManager.getSubscription();
        setLigado(!!sub && Notification.permission === "granted");
      } catch {
        setSuportado(false);
      }
    })();
  }, []);

  const ativar = async () => {
    setOcupado(true);
    try {
      if (ehIOS() && !ehStandalone()) {
        toast.error("No iPhone, adicione o Chat à Tela de Início e abra pelo ícone para receber notificações.");
        return;
      }
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        toast.error("Permissão de notificação negada. Libere nos ajustes do aparelho.");
        return;
      }
      const { vapid } = await pegarVapid({});
      if (!vapid) {
        toast.error("Notificações não configuradas no servidor.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/chat-sw.js");
      await navigator.serviceWorker.ready;
      const sub = await assinarPush(reg, vapid);
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await salvar({
        data: { endpoint: j.endpoint!, p256dh: j.keys!.p256dh!, auth: j.keys!.auth!, userAgent: navigator.userAgent },
      });
      await testar({ data: { endpoint: j.endpoint! } });
      setLigado(true);
      toast.success("Notificações ativadas neste aparelho.");
    } catch (e) {
      toast.error((e as Error).message || "Não consegui ativar as notificações.");
    } finally {
      setOcupado(false);
    }
  };

  const desativar = async () => {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/chat-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await remover({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setLigado(false);
      toast.success("Notificações desligadas neste aparelho.");
    } finally {
      setOcupado(false);
    }
  };

  if (!suportado) return null;

  return (
    <button
      onClick={() => void (ligado ? desativar() : ativar())}
      disabled={ocupado}
      className={`inline-flex shrink-0 rounded-md p-2 ${
        ligado ? "text-[#F26B1F] hover:bg-[#F26B1F]/10" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      }`}
      title={ligado ? "Notificações ativas neste aparelho" : "Ativar notificações neste aparelho"}
      aria-label="Notificações"
    >
      {ocupado ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : ligado ? (
        <BellRing className="h-4 w-4" />
      ) : Notification?.permission === "denied" ? (
        <BellOff className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
    </button>
  );
}
