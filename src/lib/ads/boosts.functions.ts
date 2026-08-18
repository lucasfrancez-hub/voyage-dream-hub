/**
 * Turbinar publicações do Instagram (Meta Marketing API) — RPCs da dashboard.
 * A complexidade da Meta (campanha/adset/creative/ad) fica no servidor.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const publicoSchema = z.object({
  modo: z.enum(["auto", "custom"]).default("auto"),
  pais: z.string().default("BR"),
  estados: z.array(z.string()).default([]),
  cidades: z.array(z.string()).default([]),
  idade_min: z.number().int().min(18).max(65).default(18),
  idade_max: z.number().int().min(18).max(65).default(65),
  sexo: z.enum(["todos", "feminino", "masculino"]).default("todos"),
});

async function exigirPermissao(context: { supabase: { rpc: Function }; userId: string }) {
  const { data: admin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  const { data: marketing } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "marketing",
  });
  if (!admin && !marketing) throw new Error("Sem permissão para gerenciar anúncios.");
}

/** Dados da conta de anúncios para exibir na tela de cobrança. */
export const contaDeAnuncios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirPermissao(context as never);
    const { validarConta, MetaAdsError } = await import("./meta-ads.server");
    try {
      return { ok: true as const, ...(await validarConta()) };
    } catch (e) {
      const msg = e instanceof MetaAdsError ? e.message : (e as Error).message;
      return { ok: false as const, erro: msg };
    }
  });

/** Todos os impulsionamentos (a dashboard casa por ig_media_id). */
export const listarImpulsionamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirPermissao(context as never);
    const { data, error } = await context.supabase
      .from("meta_ad_boosts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const turbinarPublicacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ig_media_id: z.string().min(1),
        ig_user_id: z.string().nullable().optional(),
        ig_account_id: z.string().uuid().nullable().optional(),
        ig_permalink: z.string().nullable().optional(),
        ig_caption: z.string().nullable().optional(),
        ig_thumbnail: z.string().nullable().optional(),
        objetivo: z.enum(["whatsapp", "site", "engajamento", "perfil"]),
        budget_type: z.enum(["daily", "lifetime"]),
        budget_amount: z.number().positive(),
        duration_days: z.number().int().min(1).max(90),
        link_site: z.string().url().nullable().optional(),
        publico: publicoSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigirPermissao(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { criarImpulsionamento, MetaAdsError } = await import("./meta-ads.server");

    const hoje = new Date();
    const fim = new Date(hoje.getTime() + (data.duration_days - 1) * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const total =
      data.budget_type === "daily" ? data.budget_amount * data.duration_days : data.budget_amount;

    const nome =
      (data.ig_caption?.replace(/\s+/g, " ").trim().slice(0, 60) || "Publicação Instagram") +
      ` — ${iso(hoje)}`;

    const { data: row, error } = await supabaseAdmin
      .from("meta_ad_boosts")
      .insert({
        ig_media_id: data.ig_media_id,
        ig_user_id: data.ig_user_id ?? null,
        ig_account_id: data.ig_account_id ?? null,
        ig_permalink: data.ig_permalink ?? null,
        ig_caption: data.ig_caption ?? null,
        ig_thumbnail: data.ig_thumbnail ?? null,
        ad_account_id: "pendente",
        objetivo: data.objetivo,
        budget_type: data.budget_type,
        budget_amount: data.budget_amount,
        duration_days: data.duration_days,
        total_budget: total,
        start_date: iso(hoje),
        end_date: iso(fim),
        audience: data.publico as never,
        status: "criando",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    try {
      const criado = await criarImpulsionamento({
        igMediaId: data.ig_media_id,
        igUserId: data.ig_user_id ?? null,
        nome,
        objetivo: data.objetivo,
        budgetType: data.budget_type,
        budgetAmount: data.budget_amount,
        totalBudget: total,
        startDate: iso(hoje),
        endDate: iso(fim),
        publico: data.publico,
        linkSite: data.link_site ?? null,
      });

      await supabaseAdmin
        .from("meta_ad_boosts")
        .update({
          campaign_id: criado.campaign_id,
          adset_id: criado.adset_id,
          ad_id: criado.ad_id,
          creative_id: criado.creative_id,
          ad_account_id: criado.ad_account_id,
          page_id: criado.page_id,
          status: "em_analise",
          meta_error: null,
        })
        .eq("id", row!.id);

      return { id: row!.id, ok: true as const };
    } catch (e) {
      const msg = e instanceof MetaAdsError ? e.message : (e as Error).message;
      await supabaseAdmin
        .from("meta_ad_boosts")
        .update({ status: "erro", meta_error: msg })
        .eq("id", row!.id);
      throw new Error(msg);
    }
  });

export const pausarOuRetomarBoost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await exigirPermissao(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { alterarStatusCampanha } = await import("./meta-ads.server");

    const { data: boost } = await supabaseAdmin
      .from("meta_ad_boosts")
      .select("campaign_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!boost?.campaign_id) throw new Error("Campanha ainda não foi criada na Meta.");

    await alterarStatusCampanha(boost.campaign_id, data.ativo);
    await supabaseAdmin
      .from("meta_ad_boosts")
      .update({ status: data.ativo ? "ativo" : "pausado", meta_error: null })
      .eq("id", data.id);
    return { ok: true as const };
  });

export const aumentarOrcamentoBoost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), novo_valor: z.number().positive() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigirPermissao(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { alterarOrcamento } = await import("./meta-ads.server");

    const { data: boost } = await supabaseAdmin
      .from("meta_ad_boosts")
      .select("adset_id, budget_type, duration_days")
      .eq("id", data.id)
      .maybeSingle();
    if (!boost?.adset_id) throw new Error("Campanha ainda não foi criada na Meta.");

    const tipo = (boost.budget_type as "daily" | "lifetime") ?? "daily";
    await alterarOrcamento({ adsetId: boost.adset_id, budgetType: tipo, valor: data.novo_valor });

    const total = tipo === "daily" ? data.novo_valor * (boost.duration_days ?? 1) : data.novo_valor;
    await supabaseAdmin
      .from("meta_ad_boosts")
      .update({ budget_amount: data.novo_valor, total_budget: total })
      .eq("id", data.id);
    return { ok: true as const, total };
  });

/** Atualiza métricas de um impulsionamento (botão "Atualizar dados"). */
export const sincronizarBoost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await exigirPermissao(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sincronizarUmBoost } = await import("./sync.server");
    const { data: boost } = await supabaseAdmin
      .from("meta_ad_boosts")
      .select("id, campaign_id, objetivo, end_date, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!boost) throw new Error("Impulsionamento não encontrado.");
    return await sincronizarUmBoost(boost as never);
  });
