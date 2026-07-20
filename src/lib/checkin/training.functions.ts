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
]);
export type TrainingStep = z.infer<typeof StepSchema>;

const RunInput = z.object({
  url: z.string().url(),
  steps: z.array(StepSchema).default([]),
  viewportWidth: z.number().int().min(320).max(1920).default(1280),
  viewportHeight: z.number().int().min(400).max(2000).default(900),
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
    const token = process.env.BROWSERLESS_TOKEN;
    if (!token) throw new Error("BROWSERLESS_TOKEN não configurado");


    const code = `
export default async ({ page, context }) => {
  const { url, steps, viewportWidth, viewportHeight } = context;
  const logs = [];
  await page.setViewport({ width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1 });
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    logs.push({ step: "goto", url, ok: true });
    await new Promise((r) => setTimeout(r, 2500));
  } catch (e) {
    logs.push({ step: "goto", url, ok: false, err: String(e && e.message || e) });
  }

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    try {
      if (s.action === "goto") {
        await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise((r) => setTimeout(r, 1500));
      } else if (s.action === "wait") {
        await new Promise((r) => setTimeout(r, s.ms));
      } else if (s.action === "click") {
        await page.mouse.move(s.x, s.y, { steps: 8 });
        await page.mouse.click(s.x, s.y, { delay: 60 });
        await new Promise((r) => setTimeout(r, 800));
      } else if (s.action === "type") {
        await page.mouse.click(s.x, s.y, { delay: 60 });
        if (s.clearFirst) {
          await page.keyboard.down("Control");
          await page.keyboard.press("A");
          await page.keyboard.up("Control");
          await page.keyboard.press("Backspace");
        }
        await page.keyboard.type(s.text, { delay: 30 });
      } else if (s.action === "press") {
        await page.keyboard.press(s.key);
        await new Promise((r) => setTimeout(r, 600));
      } else if (s.action === "scroll") {
        await page.evaluate((dy) => window.scrollBy(0, dy), s.dy);
        await new Promise((r) => setTimeout(r, 500));
      }
      logs.push({ i, action: s.action, ok: true });
    } catch (e) {
      logs.push({ i, action: s.action, ok: false, err: String(e && e.message || e) });
      break;
    }
  }

  const screenshot = await page.screenshot({ type: "jpeg", quality: 70, encoding: "base64", fullPage: false });
  const currentUrl = page.url();
  const title = await page.title().catch(() => "");
  return { data: { screenshot, currentUrl, title, logs, width: viewportWidth, height: viewportHeight } };
};
`;

    const params = new URLSearchParams({ token, timeout: "120000" });
    const res = await fetch(`https://production-sfo.browserless.io/function?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, context: data }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Browserless HTTP ${res.status}: ${text.slice(0, 2000)}`);
    }
    type LogEntry = { i?: number; step?: string; action?: string; url?: string; ok: boolean; err?: string };
    const json = (await res.json()) as {
      data: { screenshot: string; currentUrl: string; title: string; logs: LogEntry[]; width: number; height: number };
    };
    return json.data;
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
