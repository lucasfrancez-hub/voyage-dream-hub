import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listProtocoloMessages } from "@/lib/chat/queries.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/protocolo/$protocoloId")({
  component: ProtocoloPrintView,
  head: () => ({
    meta: [
      { title: "Protocolo — VIA AIR" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function ProtocoloPrintView() {
  const { protocoloId } = useParams({ from: "/protocolo/$protocoloId" });
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session === null) navigate({ to: "/auth" });
  }, [session, navigate]);

  const msgsFn = useServerFn(listProtocoloMessages);
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["proto-print", "msgs", protocoloId],
    queryFn: () => msgsFn({ data: { protocolo_id: protocoloId } }),
    enabled: !!session,
  });

  if (session === undefined || (session && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!session) return null;

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Protocolo</div>
            <h1 className="font-mono text-lg font-semibold text-slate-800">#{protocoloId.slice(0, 8)}</h1>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-[#F26B1F] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            Imprimir / Salvar PDF
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {messages.length === 0 ? (
            <div className="py-10 text-center text-sm italic text-slate-500">
              Nenhuma mensagem neste protocolo.
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => {
                const who = m.direction === "inbound"
                  ? "Cliente"
                  : m.sender === "system"
                    ? "Sistema"
                    : m.sender === "human"
                      ? (m.sender_full_name ?? "Atendente")
                      : "IA";
                const isInbound = m.direction === "inbound";
                return (
                  <div key={m.id} className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
                    <div className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      isInbound
                        ? "border border-slate-200 bg-slate-50 text-slate-800"
                        : "border border-[#F26B1F]/20 bg-[#F26B1F]/10 text-slate-800",
                    )}>
                      <div className="mb-1 flex items-center justify-between gap-4 text-[10px] uppercase tracking-wider text-slate-500">
                        <span>{who}</span>
                        <span>{fmtDateTime(m.created_at)}</span>
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
