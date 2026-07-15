import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listProtocoloMessages, ensureProtocoloResumo, getProtocoloDetail } from "@/lib/chat/queries.functions";
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
  const detailFn = useServerFn(getProtocoloDetail);
  const ensureFn = useServerFn(ensureProtocoloResumo);

  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ["proto-print", "msgs", protocoloId],
    queryFn: () => msgsFn({ data: { protocolo_id: protocoloId } }),
    enabled: !!session,
  });

  const { data: detail, isLoading: detailLoading, refetch: refetchDetail } = useQuery({
    queryKey: ["proto-print", "detail", protocoloId],
    queryFn: () => detailFn({ data: { protocolo_id: protocoloId } }),
    enabled: !!session,
  });

  // Backfill silencioso do resumo/necessidade e refetch dos detalhes quando gerado.
  useEffect(() => {
    if (!session) return;
    ensureFn({ data: { protocolo_id: protocoloId } })
      .then((r) => { if (r?.updated) refetchDetail(); })
      .catch(() => {});
  }, [session, protocoloId, ensureFn, refetchDetail]);

  const necessidade = (detail?.assunto_resumo ?? "").trim();
  const resumo = (detail?.resumo_conversa ?? "").trim();
  const numero = detail?.numero ?? protocoloId.slice(0, 8);

  const grouped = useMemo(() => {
    const out: { date: string; items: typeof messages }[] = [];
    for (const m of messages) {
      const d = new Date(m.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const last = out[out.length - 1];
      if (last && last.date === d) last.items.push(m);
      else out.push({ date: d, items: [m] });
    }
    return out;
  }, [messages]);

  if (session === undefined || (session && (msgsLoading || detailLoading))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!session) return null;

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4 print:max-w-none print:px-0">
        {/* Cabeçalho */}
        <div className="mb-4 flex items-start justify-between gap-3 print:mb-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Protocolo VIA AIR</div>
            <h1 className="font-mono text-xl font-semibold text-slate-800">#{numero}</h1>
            <div className="mt-1 text-[11px] text-slate-600">
              Aberto em {fmtDateTime(detail?.opened_at)}
              {detail?.closed_at && <> · Fechado em {fmtDateTime(detail.closed_at)}</>}
              {detail?.numero_pedido && <> · Pedido #{detail.numero_pedido}</>}
              {detail?.numero_reserva && <> · Reserva {detail.numero_reserva}</>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#F26B1F] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 print:hidden"
          >
            <Printer className="h-3.5 w-3.5" /> Imprimir / Salvar PDF
          </button>
        </div>

        {/* Bloco de resumo pela IA */}
        <div className="mb-4 grid gap-3 md:grid-cols-2 print:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">Necessidade do cliente</div>
            {necessidade ? (
              <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">{necessidade}</div>
            ) : (
              <div className="text-[11px] italic text-slate-500">Sem necessidade preenchida.</div>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">O que foi tratado</div>
            {resumo ? (
              <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">{resumo}</div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] italic text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Gerando resumo pela IA…
              </div>
            )}
          </div>
        </div>

        {/* Conversa completa em balões */}
        <div className="rounded-lg border border-slate-200 bg-[#ECE5DD] p-4 shadow-sm print:bg-white print:border-slate-300">
          <div className="mb-2 text-center text-[10px] font-medium uppercase tracking-wider text-slate-600">
            Conversa completa
          </div>
          {messages.length === 0 ? (
            <div className="py-10 text-center text-sm italic text-slate-500">
              Nenhuma mensagem neste protocolo.
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => (
                <div key={g.date} className="space-y-2">
                  <div className="mx-auto w-fit rounded-full bg-white/70 px-2 py-0.5 text-center text-[10px] font-medium text-slate-600 shadow-sm">
                    {g.date}
                  </div>
                  {g.items.map((m) => {
                    const who = m.direction === "inbound"
                      ? "Cliente"
                      : m.sender === "system"
                        ? "Sistema"
                        : m.sender === "human"
                          ? (m.sender_full_name ?? "Atendente")
                          : "IA";
                    const isInbound = m.direction === "inbound";
                    const hora = new Date(m.created_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={m.id} className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
                        <div className={cn(
                          "max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm",
                          isInbound
                            ? "bg-white text-slate-800"
                            : m.sender === "system"
                              ? "bg-slate-200 text-slate-700"
                              : "bg-[#DCF8C6] text-slate-800",
                        )}>
                          <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            {who}
                          </div>
                          <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                          <div className="mt-1 text-right text-[9px] text-slate-500">{hora}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
