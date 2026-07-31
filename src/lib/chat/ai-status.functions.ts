/**
 * Status/saúde dos modelos de IA usados pelo atendimento no WhatsApp.
 *
 * - `getAiModelStatus`: devolve a cadeia de fallback configurada + o catálogo
 *   de modelos disponíveis.
 * - `pingAiModels`: faz uma chamada mínima em cada modelo do catálogo pelo
 *   gateway e mede latência/erro — é assim que enxergamos instabilidade.
 * - `setAiModelChain`: salva a nova ordem de tentativas.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const AI_MODEL_CATALOG: Array<{ id: string; label: string; vendor: "OpenAI" | "Gemini" }> = [
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 mini", vendor: "OpenAI" },
  { id: "openai/gpt-5.4", label: "GPT-5.4", vendor: "OpenAI" },
  { id: "openai/gpt-5.4-nano", label: "GPT-5.4 nano", vendor: "OpenAI" },
  { id: "openai/gpt-5.5", label: "GPT-5.5", vendor: "OpenAI" },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini", vendor: "OpenAI" },
  { id: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash", vendor: "Gemini" },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", vendor: "Gemini" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", vendor: "Gemini" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", vendor: "Gemini" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", vendor: "Gemini" },
];

export const DEFAULT_AI_CHAIN = [
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4",
  "openai/gpt-5.4-nano",
  "google/gemini-3.6-flash",
  "google/gemini-3.1-flash-lite",
];

export const getAiModelStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_model_chain")
      .select("models, updated_at")
      .eq("id", "whatsapp")
      .maybeSingle();
    const models = Array.isArray(data?.models) && (data!.models as string[]).length
      ? (data!.models as string[])
      : DEFAULT_AI_CHAIN;
    return {
      chain: models,
      updatedAt: (data as { updated_at?: string } | null)?.updated_at ?? null,
      catalog: AI_MODEL_CATALOG,
    };
  });

export const setAiModelChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ chain: z.array(z.string()) }).parse(d))
  .handler(async ({ data, context }) => {
    const valid = data.chain.filter((m) => AI_MODEL_CATALOG.some((c) => c.id === m));
    if (!valid.length) throw new Error("Selecione ao menos um modelo");
    const { error } = await context.supabase
      .from("ai_model_chain")
      .upsert({ id: "whatsapp", models: valid, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true, chain: valid };
  });

type Ping = {
  id: string;
  ok: boolean;
  ms: number;
  status: number | null;
  error: string | null;
};

async function pingModel(model: string, key: string): Promise<Ping> {
  const started = Date.now();
  const isOpenAI = model.startsWith("openai/");
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        ...(isOpenAI ? { max_completion_tokens: 16 } : { max_tokens: 16 }),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        id: model,
        ok: false,
        ms,
        status: res.status,
        error: body.slice(0, 200) || res.statusText,
      };
    }
    await res.json().catch(() => null);
    return { id: model, ok: true, ms, status: res.status, error: null };
  } catch (e) {
    return {
      id: model,
      ok: false,
      ms: Date.now() - started,
      status: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const pingAiModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const results = await Promise.all(AI_MODEL_CATALOG.map((m) => pingModel(m.id, key)));
    return { checkedAt: new Date().toISOString(), results };
  });
