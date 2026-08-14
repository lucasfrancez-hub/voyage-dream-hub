import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hotelSearchSchema } from "@/lib/hotels/hotels.functions";

async function assertAdmin(ctx: { supabase: { rpc: Function }; userId: string }) {
  const { data, error } = await (ctx.supabase.rpc as (
    fn: "has_role",
    args: { _user_id: string; _role: "admin" },
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>)("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito");
}

const stepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), url: z.string().url() }),
  z.object({ action: z.literal("wait"), ms: z.number().int().min(100).max(15_000) }),
  z.object({ action: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({
    action: z.literal("type"),
    x: z.number(),
    y: z.number(),
    text: z.string().max(200),
    clearFirst: z.boolean().optional(),
  }),
  z.object({ action: z.literal("press"), key: z.string().max(20) }),
  z.object({ action: z.literal("scroll"), dy: z.number() }),
  z.object({ action: z.literal("back") }),
]);

// ------------------------------------------------------------------ sessões

export const listExpediaSessionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { listExpediaSessions } = await import("@/lib/expedia/session-store.server");
    return listExpediaSessions();
  });

export const listExpediaLogsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { listExpediaSearchLogs } = await import("@/lib/expedia/session-store.server");
    return listExpediaSearchLogs(30);
  });

export const deleteExpediaSessionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { deleteExpediaSession } = await import("@/lib/expedia/session-store.server");
    await deleteExpediaSession(data.id);
    return { ok: true as const };
  });

// -------------------------------------------------------- login manual vivo

export const openExpediaLoginFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { openLiveSession } = await import("@/lib/checkin/training-session.server");
    return openLiveSession({
      userId: context.userId,
      url: "https://www.expedia.com.br/",
      viewportWidth: 1280,
      viewportHeight: 800,
      useResidentialProxy: true,
    });
  });

export const stepExpediaLoginFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string(), step: stepSchema }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { runLiveStep } = await import("@/lib/checkin/training-session.server");
    return runLiveStep({ userId: context.userId, sessionId: data.sessionId, step: data.step });
  });

export const shotExpediaLoginFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { screenshotLiveSession } = await import("@/lib/checkin/training-session.server");
    return screenshotLiveSession({ userId: context.userId, sessionId: data.sessionId });
  });

export const saveExpediaLoginFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sessionId: z.string(),
        label: z.string().trim().max(80).default("Expedia TAAP"),
        accountEmail: z.string().trim().max(160).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { captureSessionCookies, closeLiveSession } = await import(
      "@/lib/checkin/training-session.server"
    );
    const { saveExpediaSession } = await import("@/lib/expedia/session-store.server");
    const captured = await captureSessionCookies({
      userId: context.userId,
      sessionId: data.sessionId,
    });
    const saved = await saveExpediaSession({
      label: data.label,
      accountEmail: data.accountEmail ?? null,
      cookies: captured.cookies as never,
      storage: captured.storage,
      userId: context.userId,
    });
    await closeLiveSession({ userId: context.userId, sessionId: data.sessionId }).catch(() => {});
    return saved;
  });

export const closeExpediaLoginFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { closeLiveSession } = await import("@/lib/checkin/training-session.server");
    return closeLiveSession({ userId: context.userId, sessionId: data.sessionId });
  });

// ------------------------------------------------------------- teste de busca

export const testExpediaSearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => hotelSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { searchHotels } = await import("@/lib/hotels/search.server");
    return searchHotels(data);
  });
