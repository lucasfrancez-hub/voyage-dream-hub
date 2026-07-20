import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron: detecta voos LATAM entre agora e +48h sem check-in ainda,
 * agenda registros pendentes e roda os pendentes.
 * Chamado pelo pg_cron a cada 10 minutos.
 */
export const Route = createFileRoute("/api/public/hooks/run-checkins")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Segurança: apikey do supabase
        const apikey = request.headers.get("apikey");
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !anon || apikey !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { detectAirline } = await import("@/lib/checkin/checkin.functions");

        const nowIso = new Date().toISOString();
        const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

        // 1) Descobrir voos LATAM que decolam nas próximas 48h e ainda não têm check-in success
        const { data: items } = await supabaseAdmin
          .from("order_items")
          .select("id, order_id, supplier_locator, details, status")
          .eq("kind", "flight")
          .neq("status", "cancelled");

        const candidates: Array<{ id: string; order_id: string; locator: string; details: any }> = [];
        for (const it of items ?? []) {
          const details = (it as any).details ?? {};
          const airline = detectAirline({ airline: details.airline, flight_number: details.flight_number });
          if (airline !== "LATAM") continue;
          const dep = details.departure_at;
          if (!dep) continue;
          const depMs = Date.parse(dep);
          if (isNaN(depMs)) continue;
          if (depMs < Date.now() + 60 * 60 * 1000) continue; // já passou de 1h antes
          if (depMs > Date.now() + 48 * 60 * 60 * 1000) continue;
          const checkinUrl = String(details.airline_checkin_url || "");
          let orderIdFromUrl = "";
          try { orderIdFromUrl = new URL(checkinUrl).searchParams.get("orderId")?.trim().toUpperCase() || ""; } catch { /* URL ausente */ }
          const locator = orderIdFromUrl || details.purchase_order || details.order_id || (it as any).supplier_locator || details.locator;
          if (!locator) continue;
          candidates.push({ id: (it as any).id, order_id: (it as any).order_id, locator: String(locator).toUpperCase(), details });
        }

        const created: string[] = [];
        const ran: string[] = [];
        const errors: Array<{ item: string; error: string }> = [];

        for (const c of candidates) {
          // Verifica se já existe checkin success/running pra esse item
          const { data: existing } = await supabaseAdmin
            .from("flight_checkins")
            .select("id, status, attempts")
            .eq("order_item_id", c.id)
            .maybeSingle();
          if (existing && ["success", "running"].includes((existing as any).status)) continue;
          if (existing && ((existing as any).attempts ?? 0) >= 3) continue;

          // Pega sobrenome
          const { data: pax } = await supabaseAdmin
            .from("order_passengers")
            .select("id, full_name")
            .eq("order_id", c.order_id)
            .order("sort_order", { ascending: true })
            .limit(1);
          const firstPax = (pax as Array<any>)?.[0];
          const surname = firstPax?.full_name?.split(/\s+/).slice(-1)[0];
          if (!surname) continue;

          // Cria/atualiza como scheduled
          const upsert = await supabaseAdmin
            .from("flight_checkins")
            .upsert({
              order_id: c.order_id,
              order_item_id: c.id,
              passenger_id: firstPax?.id ?? null,
              cia: "LATAM",
              locator: c.locator,
              pnr_surname: surname,
              flight_number: c.details.flight_number ?? null,
              departure_at: c.details.departure_at ?? null,
              status: "scheduled",
              scheduled_for: nowIso,
            }, { onConflict: "order_item_id,passenger_id" })
            .select("id")
            .single();
          if (upsert.error) { errors.push({ item: c.id, error: upsert.error.message }); continue; }
          created.push((upsert.data as any).id);
        }

        // 2) Roda os agendados um por um (sequencial pra não estourar Browserless)
        const { data: scheduled } = await supabaseAdmin
          .from("flight_checkins")
          .select("id, locator, pnr_surname, order_id, order_item_id, attempts")
          .in("status", ["scheduled", "failed"])
          .lt("attempts", 12)
          .order("scheduled_for", { ascending: true })
          .limit(5);

        const { runScriptInLiveSession, rebuildInitialUrlForOrder } = await import("@/lib/checkin/training-runner.server");
        const { deliverBoardingPass } = await import("@/lib/checkin/deliver.server");

        for (const ci of (scheduled ?? []) as Array<any>) {
          try {
            await supabaseAdmin.from("flight_checkins").update({
              status: "running",
              last_attempt_at: new Date().toISOString(),
              attempts: (ci.attempts ?? 0) + 1,
              error: null,
            }).eq("id", ci.id);

            // Só rodamos via script salvo no treinador. Autopilot antigo foi removido.
            const { data: scriptRows } = await supabaseAdmin
              .from("checkin_training_scripts")
              .select("id, initial_url, steps, viewport_width, viewport_height")
              .eq("airline", "LATAM")
              .order("updated_at", { ascending: false })
              .limit(1);
            const script = (scriptRows ?? [])[0] as any;
            if (!script || !Array.isArray(script.steps) || script.steps.length === 0) {
              throw new Error("Nenhum script de treinador salvo para LATAM. Grave um em /admin/checkin-treino.");
            }
            const runUrl = rebuildInitialUrlForOrder(script.initial_url, ci.locator, ci.pnr_surname);
            const result = await runScriptInLiveSession({
              userId: `cron:${ci.id}`,
              url: runUrl,
              steps: script.steps as any,
              viewportWidth: script.viewport_width ?? 1280,
              viewportHeight: script.viewport_height ?? 900,
              locator: ci.locator,
              surname: ci.pnr_surname,
            });
            const caps = (result.captures || []).filter((c: any) => c.pngBase64);
            if (caps.length === 0) throw new Error("Script rodou mas não capturou nenhum cartão de embarque.");

            // Faz upload de TODOS os recortes; cada um pode representar um pax.
            const boardingPasses: Array<{ path: string; url: string | null; passenger_index: number; filename: string | null }> = [];
            let primaryPath = "";
            let primaryUrl: string | null = null;
            for (let idx = 0; idx < caps.length; idx += 1) {
              const cap: any = caps[idx];
              const bytes = Uint8Array.from(atob(cap.pngBase64), (c) => c.charCodeAt(0));
              const path = caps.length === 1 ? `${ci.order_id}/${ci.id}.png` : `${ci.order_id}/${ci.id}-pax${idx + 1}.png`;
              const up = await supabaseAdmin.storage.from("boarding-passes")
                .upload(path, bytes, { contentType: "image/png", upsert: true });
              if (up.error) throw new Error(up.error.message);
              const signed = await supabaseAdmin.storage.from("boarding-passes").createSignedUrl(path, 60 * 60 * 24 * 30);
              const paxIdx = typeof cap.passengerIndex === "number" && cap.passengerIndex > 0 ? cap.passengerIndex : idx + 1;
              boardingPasses.push({ path, url: signed.data?.signedUrl ?? null, passenger_index: paxIdx, filename: cap.filename ?? null });
              if (idx === 0) { primaryPath = path; primaryUrl = signed.data?.signedUrl ?? null; }
            }


            await supabaseAdmin.from("flight_checkins").update({
              status: "success",
              boarding_pass_path: primaryPath,
              boarding_pass_url: primaryUrl,
              boarding_passes: boardingPasses,
              error: null,
              completed_at: new Date().toISOString(),
            }).eq("id", ci.id);

            await deliverBoardingPass(ci.id).catch((e) => console.error("[cron-checkin] deliver", e));
            ran.push(ci.id);
          } catch (err: any) {
            const msg = err?.message ?? String(err);
            await supabaseAdmin.from("flight_checkins").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", ci.id);
            errors.push({ item: ci.id, error: msg });
          }
        }

        return Response.json({
          ok: true,
          scanned: candidates.length,
          created: created.length,
          ran: ran.length,
          errors,
        });
      },
    },
  },
});
