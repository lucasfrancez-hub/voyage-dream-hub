import { createFileRoute } from "@tanstack/react-router";

/**
 * Robô das notificações push da Agenda VIA AIR.
 *
 * Roda a cada 5 minutos e cuida de três avisos:
 *  1. lembrete X minutos antes do compromisso;
 *  2. resumo do dia por volta das 07h (horário de Brasília);
 *  3. compromisso novo que apareceu na sincronização das agendas.
 *
 * Tudo passa por `wa_calendar_push_log` pra nunca mandar duas vezes.
 */

const FUSO = "America/Sao_Paulo";

type Sub = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  pref_lembrete: boolean;
  pref_resumo: boolean;
  pref_novo: boolean;
  minutos_antes: number;
};

type Evento = { id: string; titulo: string; inicio: string; fim: string; local: string | null; dia_inteiro: boolean; created_at?: string };

function horaBrasilia(d: Date) {
  return Number(new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(d));
}
function diaBrasilia(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function horaCurta(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export const Route = createFileRoute("/api/public/hooks/calendar-push")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enviarPush } = await import("@/lib/whatsapp/webpush.server");

        const { data: subsRaw } = await supabaseAdmin
          .from("wa_calendar_push_subs")
          .select("id, endpoint, p256dh, auth, pref_lembrete, pref_resumo, pref_novo, minutos_antes")
          .eq("ativo", true);
        const subs = (subsRaw ?? []) as Sub[];
        if (subs.length === 0) return Response.json({ ok: true, aparelhos: 0 });

        const agora = new Date();
        const limite = new Date(agora.getTime() + 25 * 60 * 60 * 1000);

        const { data: evRaw } = await supabaseAdmin
          .from("wa_calendar_events")
          .select("id, titulo, inicio, fim, local, dia_inteiro, created_at")
          .gte("inicio", new Date(agora.getTime() - 60 * 60 * 1000).toISOString())
          .lte("inicio", limite.toISOString())
          .is("deleted_at", null)
          .order("inicio", { ascending: true });
        const eventos = (evRaw ?? []) as Evento[];

        const enviados: Array<{ sub: Sub; chave: string; titulo: string; corpo: string; tag: string }> = [];

        for (const sub of subs) {
          // 1. lembretes
          if (sub.pref_lembrete) {
            const janelaIni = agora.getTime() + sub.minutos_antes * 60000 - 3 * 60000;
            const janelaFim = agora.getTime() + sub.minutos_antes * 60000 + 3 * 60000;
            for (const e of eventos) {
              if (e.dia_inteiro) continue;
              const t = new Date(e.inicio).getTime();
              if (t < janelaIni || t > janelaFim) continue;
              enviados.push({
                sub,
                chave: `lembrete:${sub.id}:${e.id}:${sub.minutos_antes}`,
                titulo: e.titulo,
                corpo: `Começa às ${horaCurta(e.inicio)}${e.local ? ` · ${e.local}` : ""}`,
                tag: `ev-${e.id}`,
              });
            }
          }

          // 2. resumo da manhã (07h BRT)
          if (sub.pref_resumo && horaBrasilia(agora) === 7) {
            const dia = diaBrasilia(agora);
            const doDia = eventos.filter((e) => diaBrasilia(new Date(e.inicio)) === dia);
            if (doDia.length > 0) {
              const linhas = doDia
                .slice(0, 4)
                .map((e) => `${e.dia_inteiro ? "dia todo" : horaCurta(e.inicio)} · ${e.titulo}`)
                .join("\n");
              enviados.push({
                sub,
                chave: `resumo:${sub.id}:${dia}`,
                titulo: `Hoje você tem ${doDia.length} compromisso${doDia.length > 1 ? "s" : ""}`,
                corpo: linhas + (doDia.length > 4 ? `\n+${doDia.length - 4} depois` : ""),
                tag: `resumo-${dia}`,
              });
            }
          }

          // 3. compromissos novos (criados nos últimos 10 min)
          if (sub.pref_novo) {
            for (const e of eventos) {
              if (!e.created_at) continue;
              const idade = agora.getTime() - new Date(e.created_at).getTime();
              if (idade < 0 || idade > 10 * 60000) continue;
              enviados.push({
                sub,
                chave: `novo:${sub.id}:${e.id}`,
                titulo: "Novo compromisso na agenda",
                corpo: `${e.titulo} · ${e.dia_inteiro ? "dia todo" : horaCurta(e.inicio)}`,
                tag: `novo-${e.id}`,
              });
            }
          }
        }

        let ok = 0;
        let falhas = 0;
        for (const item of enviados) {
          const { error } = await supabaseAdmin.from("wa_calendar_push_log").insert({ chave: item.chave });
          if (error) continue; // já foi mandado antes
          const r = await enviarPush(item.sub, {
            title: item.titulo,
            body: item.corpo,
            url: "/",
            tag: item.tag,
          });
          if (r.ok) ok++;
          else {
            falhas++;
            if (r.gone) await supabaseAdmin.from("wa_calendar_push_subs").delete().eq("id", item.sub.id);
          }
        }

        // limpeza do histórico
        await supabaseAdmin
          .from("wa_calendar_push_log")
          .delete()
          .lt("created_at", new Date(agora.getTime() - 7 * 24 * 3600000).toISOString());

        return Response.json({ ok: true, aparelhos: subs.length, enviados: ok, falhas });
      },
    },
  },
});
