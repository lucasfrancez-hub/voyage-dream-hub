import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Treinador de robô de check-in por visão.
 * Cada passo é executado remotamente no Chrome do Browserless.
 * Após executar, tira um screenshot e (opcionalmente) pergunta pra IA
 * onde clicar em seguida — devolvendo coordenadas que a UI valida com humano.
 */

const StepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), url: z.string().url() }),
  z.object({ action: z.literal("wait"), ms: z.number().int().min(50).max(15000) }),
  z.object({ action: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({ action: z.literal("type"), x: z.number(), y: z.number(), text: z.string(), clearFirst: z.boolean().optional() }),
  z.object({ action: z.literal("press"), key: z.string() }),
  z.object({ action: z.literal("scroll"), dy: z.number() }),
  z.object({
    action: z.literal("capture_region"),
    x: z.number(), y: z.number(), width: z.number(), height: z.number(),
    filename: z.string().optional(),
    // 1-based: qual passageiro (pela ordem em order_passengers.sort_order)
    // este recorte representa. 0/undefined = genérico (envia pra todos).
    passenger_index: z.number().int().min(0).max(20).optional(),
  }),
]);
export type TrainingStep = z.infer<typeof StepSchema>;

const RunInput = z.object({
  url: z.string().url(),
  steps: z.array(StepSchema).default([]),
  viewportWidth: z.number().int().min(320).max(1920).default(1280),
  viewportHeight: z.number().int().min(400).max(2000).default(900),
  // Substitui {{locator}} / {{surname}} nos steps `type` do script salvo.
  locator: z.string().optional(),
  surname: z.string().optional(),
});

export const runTrainingScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: apenas admin");

    const locator = (data.locator || "").trim();
    const surname = (data.surname || "").trim();

    try {
      const { runScriptInLiveSession } = await import("@/lib/checkin/training-runner.server");
      const result = await runScriptInLiveSession({
        userId: `training:${context.userId}`,
        url: data.url,
        steps: data.steps,
        viewportWidth: data.viewportWidth,
        viewportHeight: data.viewportHeight,
        locator,
        surname,
      });

      // Faz upload das regiões capturadas durante o script.
      const uploads: Array<{ path: string; signedUrl: string | null; sizeKb: number; index: number }> = [];
      const caps = result.captures ?? [];
      if (caps.length > 0) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        for (const c of caps) {
          const bytes = Buffer.from(c.pngBase64, "base64");
          const nameBase = c.filename || `${locator || "reserva"}-${surname || "pax"}-regiao-${c.i}.png`;
          const safeName = nameBase.replace(/[^\w.\-]+/g, "_");
          const finalName = safeName.toLowerCase().endsWith(".png") ? safeName : `${safeName}.png`;
          const path = `training/${context.userId}/${Date.now()}-${finalName}`;
          const up = await supabaseAdmin.storage
            .from("boarding-passes")
            .upload(path, bytes, { contentType: "image/png", upsert: true });
          if (up.error) continue;
          const signed = await supabaseAdmin.storage
            .from("boarding-passes")
            .createSignedUrl(path, 60 * 60 * 24 * 30);
          uploads.push({ path, signedUrl: signed.data?.signedUrl ?? null, sizeKb: Math.round(bytes.length / 1024), index: c.i });
        }
      }
      return { ...result, uploads };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error || "erro desconhecido");
      throw new Error(`Não foi possível rodar o script no navegador protegido: ${detail}`);
    }
  });


/* ==========================================================================
 * SESSÃO VIVA — abre a página uma vez e executa cada passo na hora
 * ========================================================================== */

async function ensureAdmin(context: { supabase: unknown; userId: string }) {
  const supa = context.supabase as { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => Promise<{ data: unknown }> };
  const { data: isAdmin } = await supa.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden: apenas admin");
}


const OpenSessionInput = z.object({
  url: z.string().url(),
  viewportWidth: z.number().int().min(320).max(1920).default(1280),
  viewportHeight: z.number().int().min(400).max(2000).default(900),
  useResidentialProxy: z.boolean().optional(),
});

export const openTrainingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OpenSessionInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    try {
      const { openLiveSession } = await import("@/lib/checkin/training-session.server");
      const result = await openLiveSession({ userId: context.userId, ...data });
      return { ok: true as const, ...result };
    } catch (error) {
      console.error("openTrainingSession failed:", error);
      const detail = error instanceof Error ? error.message : String(error);
      const short = detail.slice(0, 400);
      const message = /LATAM_NAVIGATION_BLOCKED|ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR/i.test(detail)
        ? data.useResidentialProxy
          ? "A LATAM bloqueou também a conexão residencial. Aguarde um pouco e tente abrir uma nova sessão."
          : "A LATAM bloqueou a conexão direta. Ative ‘Usar proxy residencial BR’ e abra uma nova sessão."
        : /LATAM_EMPTY_PAGE/i.test(detail)
          ? "A sessão abriu sem renderizar a LATAM. Feche a sessão e abra novamente para trocar a conexão residencial."
        : /408|timed out|timeout|aborted/i.test(detail)
          ? `A LATAM demorou demais para abrir. Detalhe: ${short}`
          : `Não foi possível abrir a sessão protegida da LATAM: ${short}`;
      return { ok: false as const, error: message };
    }

  });

const RunStepInput = z.object({
  sessionId: z.string().min(4),
  step: StepSchema.or(z.object({ action: z.literal("back") })),
});

export const runLiveTrainingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunStepInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    try {
      const step = data.step;
      // capture_region: crop + upload aqui (o runLiveStep só faz o print da tela cheia).
      if (step.action === "capture_region") {
        const { captureRegionPng, screenshotLiveSession } = await import("@/lib/checkin/training-session.server");
        const { pngBase64 } = await captureRegionPng({
          userId: context.userId, sessionId: data.sessionId,
          x: step.x, y: step.y, width: step.width, height: step.height,
        });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const bytes = Buffer.from(pngBase64, "base64");
        const safeName = (step.filename || `treino-regiao-${Date.now()}.png`).replace(/[^\w.\-]+/g, "_");
        const finalName = safeName.toLowerCase().endsWith(".png") ? safeName : `${safeName}.png`;
        const path = `training/${context.userId}/${Date.now()}-${finalName}`;
        const up = await supabaseAdmin.storage.from("boarding-passes").upload(path, bytes, { contentType: "image/png", upsert: true });
        if (up.error) throw new Error(up.error.message);
        const signed = await supabaseAdmin.storage.from("boarding-passes").createSignedUrl(path, 60 * 60 * 24 * 30);
        const shot = await screenshotLiveSession({ userId: context.userId, sessionId: data.sessionId });
        return { ok: true as const, ...shot, region: { path, signedUrl: signed.data?.signedUrl ?? null, sizeKb: Math.round(bytes.length / 1024) } };
      }
      const { runLiveStep } = await import("@/lib/checkin/training-session.server");
      const result = await runLiveStep({ userId: context.userId, sessionId: data.sessionId, step: step as never });
      return { ok: true as const, ...result };
    } catch (e) {
      console.error(e);
      const code = (e as { code?: string })?.code;
      if (code === "SESSION_EXPIRED") {
        return { ok: false as const, error: "SESSION_EXPIRED" };
      }
      const detail = e instanceof Error ? e.message : String(e);
      return {
        ok: false as const,
        error: /LATAM_NAVIGATION_BLOCKED/i.test(detail)
          ? "A LATAM interrompeu esta conexão. Feche a sessão e reabra usando o proxy residencial BR."
          : "Não foi possível executar esta ação na sessão da LATAM.",
      };
    }
  });

const SessionIdInput = z.object({ sessionId: z.string().min(4) });

export const screenshotTrainingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SessionIdInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    try {
      const { screenshotLiveSession } = await import("@/lib/checkin/training-session.server");
      const result = await screenshotLiveSession({ userId: context.userId, sessionId: data.sessionId });
      return { ok: true as const, ...result };
    } catch (e) {
      console.error(e);
      const code = (e as { code?: string })?.code;
      if (code === "SESSION_EXPIRED") return { ok: false as const, error: "SESSION_EXPIRED" };
      return { ok: false as const, error: "Não foi possível atualizar a imagem da sessão." };
    }
  });

export const heartbeatTrainingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SessionIdInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    try {
      const { heartbeatLiveSession } = await import("@/lib/checkin/training-session.server");
      await heartbeatLiveSession({ userId: context.userId, sessionId: data.sessionId });
      return { ok: true as const };
    } catch (e) {
      console.error(e);
      return { ok: false as const, error: "SESSION_EXPIRED" };
    }
  });

export const closeTrainingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SessionIdInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { closeLiveSession } = await import("@/lib/checkin/training-session.server");
    return closeLiveSession({ userId: context.userId, sessionId: data.sessionId });
  });

const CapturePdfInput = z.object({
  sessionId: z.string().min(4),
  x: z.number(),
  y: z.number(),
  filename: z.string().optional(),
});

export const captureTrainingPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CapturePdfInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    try {
      const { captureNextPdfFromClick } = await import("@/lib/checkin/training-session.server");
      const { pdfBase64, sourceUrl } = await captureNextPdfFromClick({
        userId: context.userId,
        sessionId: data.sessionId,
        x: Math.round(data.x),
        y: Math.round(data.y),
      });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const bytes = Buffer.from(pdfBase64, "base64");
      const safeName = (data.filename || `treino-${Date.now()}.pdf`).replace(/[^\w.\-]+/g, "_");
      const path = `training/${context.userId}/${Date.now()}-${safeName}`;
      const up = await supabaseAdmin.storage
        .from("boarding-passes")
        .upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(up.error.message);
      const signed = await supabaseAdmin.storage
        .from("boarding-passes")
        .createSignedUrl(path, 60 * 60 * 24 * 30);
      return {
        ok: true as const,
        path,
        sourceUrl,
        signedUrl: signed.data?.signedUrl ?? null,
        sizeKb: Math.round(bytes.length / 1024),
      };
    } catch (e) {
      console.error(e);
      const code = (e as { code?: string })?.code;
      if (code === "SESSION_EXPIRED") return { ok: false as const, error: "SESSION_EXPIRED" };
      return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao capturar PDF" };
    }
  });

const CaptureRegionInput = z.object({
  sessionId: z.string().min(4),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  filename: z.string().optional(),
  passenger_index: z.number().int().min(0).max(20).optional(),
});

export const captureTrainingRegion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CaptureRegionInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    try {
      const { captureRegionPng } = await import("@/lib/checkin/training-session.server");
      const { pngBase64, sourceUrl } = await captureRegionPng({
        userId: context.userId,
        sessionId: data.sessionId,
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
      });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const bytes = Buffer.from(pngBase64, "base64");
      const safeName = (data.filename || `treino-${Date.now()}.png`).replace(/[^\w.\-]+/g, "_");
      const finalName = safeName.toLowerCase().endsWith(".png") ? safeName : `${safeName}.png`;
      const path = `training/${context.userId}/${Date.now()}-${finalName}`;
      const up = await supabaseAdmin.storage
        .from("boarding-passes")
        .upload(path, bytes, { contentType: "image/png", upsert: true });
      if (up.error) throw new Error(up.error.message);
      const signed = await supabaseAdmin.storage
        .from("boarding-passes")
        .createSignedUrl(path, 60 * 60 * 24 * 30);
      return {
        ok: true as const,
        path,
        sourceUrl,
        signedUrl: signed.data?.signedUrl ?? null,
        sizeKb: Math.round(bytes.length / 1024),
      };
    } catch (e) {
      console.error(e);
      const code = (e as { code?: string })?.code;
      if (code === "SESSION_EXPIRED") return { ok: false as const, error: "SESSION_EXPIRED" };
      return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao capturar região" };
    }
  });


const AskInput = z.object({
  imageBase64: z.string().min(100),
  question: z.string().min(3),
  width: z.number().int(),
  height: z.number().int(),
});

export const askVisionAboutScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AskInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: apenas admin");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");


    const systemPrompt = `Você é um assistente que analisa screenshots de páginas web para automação de check-in aéreo.
A imagem tem dimensões ${data.width}x${data.height} pixels (origem 0,0 no canto superior esquerdo).
Responda SEMPRE em JSON válido, sem markdown, com este formato:
{
  "reasoning": "explicação curta em pt-BR do que você vê",
  "targets": [
    { "label": "nome curto do elemento", "x": <centro X>, "y": <centro Y>, "w": <largura>, "h": <altura>, "confidence": 0-1 }
  ],
  "notes": "observações extras (popups, cookies, captcha, etc.)"
}
As coordenadas devem estar dentro de 0..${data.width} e 0..${data.height}.`;

    const body = {
      model: "google/gemini-3.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: data.question },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.imageBase64}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`IA Gateway ${res.status}: ${t.slice(0, 500)}`);
    }
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = j.choices?.[0]?.message?.content ?? "{}";
    type VisionTarget = { label: string; x: number; y: number; w: number; h: number; confidence?: number };
    type VisionResult = { reasoning?: string; targets?: VisionTarget[]; notes?: string; raw?: string };
    let parsed: VisionResult = {};
    try {
      parsed = JSON.parse(raw) as VisionResult;
    } catch {
      parsed = { reasoning: "resposta não-JSON", raw };
    }
    return { raw, parsed };
  });

/* ==========================================================================
 * SCRIPTS SALVOS por companhia (LATAM/GOL/AZUL)
 * ========================================================================== */

const AirlineEnum = z.enum(["LATAM", "GOL", "AZUL"]);

const ListScriptsInput = z.object({ airline: AirlineEnum });

export const listTrainingScripts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListScriptsInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("checkin_training_scripts")
      .select("id,airline,name,initial_url,viewport_width,viewport_height,updated_at")
      .eq("airline", data.airline)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { ok: true as const, scripts: rows ?? [] };
  });

const GetScriptInput = z.object({ id: z.string().uuid() });

export const getTrainingScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetScriptInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: row, error } = await context.supabase
      .from("checkin_training_scripts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Script não encontrado");
    return { ok: true as const, script: row };
  });

const SaveScriptInput = z.object({
  id: z.string().uuid().optional(),
  airline: AirlineEnum,
  name: z.string().min(1).max(120),
  initial_url: z.string().url(),
  steps: z.array(StepSchema),
  annotations: z.array(z.object({
    x: z.number(), y: z.number(), label: z.string(),
    kind: z.enum(["type", "click"]), url: z.string(),
  })).default([]),
  viewport_width: z.number().int().default(1280),
  viewport_height: z.number().int().default(900),
});

export const saveTrainingScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveScriptInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const payload = {
      airline: data.airline,
      name: data.name,
      initial_url: data.initial_url,
      steps: data.steps,
      annotations: data.annotations,
      viewport_width: data.viewport_width,
      viewport_height: data.viewport_height,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("checkin_training_scripts")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { ok: true as const, id: row?.id ?? data.id };
    }
    const { data: row, error } = await context.supabase
      .from("checkin_training_scripts")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: row!.id as string };
  });

export const deleteTrainingScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetScriptInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase
      .from("checkin_training_scripts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
