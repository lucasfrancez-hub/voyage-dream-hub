/**
 * Meta Marketing API (server-only).
 *
 * Turbinar publicações do Instagram usando o post que já existe — sem
 * recriar arte. Estrutura criada na Meta:
 *   Campanha → Conjunto de anúncios (público/orçamento/período) →
 *   Criativo (source_instagram_media_id) → Anúncio.
 *
 * Credenciais (secrets do projeto):
 *   META_ADS_ACCESS_TOKEN  → token de usuário/system user com ads_management
 *   META_AD_ACCOUNT_ID     → ex.: act_1234567890 (ou só os números)
 *   META_FB_PAGE_ID        → Página do Facebook vinculada ao Instagram
 *   META_WHATSAPP_NUMBER   → (opcional) número E.164 para Click-to-WhatsApp
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type Objetivo = "whatsapp" | "site" | "engajamento" | "perfil";

export type Publico = {
  modo: "auto" | "custom";
  pais?: string;
  estados?: string[];
  cidades?: string[];
  idade_min?: number;
  idade_max?: number;
  sexo?: "todos" | "feminino" | "masculino";
};

export class MetaAdsError extends Error {
  constructor(
    message: string,
    readonly detalhes?: { code?: number; subcode?: number; tipo?: string; user_msg?: string },
  ) {
    super(message);
    this.name = "MetaAdsError";
  }
}

export function metaAdsConfig() {
  const token = process.env["META_ADS_ACCESS_TOKEN"];
  const rawAct = process.env["META_AD_ACCOUNT_ID"];
  const pageId = process.env["META_FB_PAGE_ID"];
  if (!token) throw new MetaAdsError("Token de anúncios da Meta não configurado no sistema.");
  if (!rawAct) throw new MetaAdsError("Conta de anúncios da Meta não configurada no sistema.");
  const adAccountId = rawAct.startsWith("act_") ? rawAct : `act_${rawAct.replace(/\D/g, "")}`;
  return {
    token,
    adAccountId,
    pageId: pageId ?? null,
    whatsappNumber: (process.env["META_WHATSAPP_NUMBER"] ?? "").replace(/\D/g, "") || null,
  };
}

async function call<T>(
  path: string,
  opts: { method?: "GET" | "POST"; token: string; params?: Record<string, unknown> },
): Promise<T> {
  const method = opts.method ?? "GET";
  const params = { ...(opts.params ?? {}), access_token: opts.token };
  let url = `${GRAPH}${path}`;
  let body: string | undefined;

  const encoded = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    encoded.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  if (method === "GET") url += `?${encoded.toString()}`;
  else body = encoded.toString();

  const res = await fetch(url, {
    method,
    ...(body ? { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body } : {}),
  });
  const texto = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    json = null;
  }

  if (!res.ok || (json && json.error)) {
    const err = (json?.error ?? {}) as {
      message?: string;
      code?: number;
      error_subcode?: number;
      type?: string;
      error_user_msg?: string;
      error_user_title?: string;
    };
    const amigavel =
      err.error_user_msg ||
      err.error_user_title ||
      err.message ||
      `Falha na Meta (HTTP ${res.status}).`;
    console.error(`[meta-ads] ${method} ${path} → ${res.status}: ${texto.slice(0, 600)}`);
    throw new MetaAdsError(amigavel, {
      code: err.code,
      subcode: err.error_subcode,
      tipo: err.type,
      user_msg: err.error_user_msg,
    });
  }
  return (json ?? {}) as T;
}

// ---------- mapeamento de objetivos ----------

type Mapa = {
  campaignObjective: string;
  optimizationGoal: string;
  billingEvent: string;
  destinationType?: string;
  ctaType?: string;
  /** action_type usado nos Insights para contar "Resultados" */
  actionTypes: string[];
  rotulo: string;
  rotuloSingular: string;
};

export const MAPA_OBJETIVOS: Record<Objetivo, Mapa> = {
  whatsapp: {
    campaignObjective: "OUTCOME_ENGAGEMENT",
    optimizationGoal: "CONVERSATIONS",
    billingEvent: "IMPRESSIONS",
    destinationType: "WHATSAPP",
    ctaType: "WHATSAPP_MESSAGE",
    actionTypes: [
      "onsite_conversion.total_messaging_connection",
      "onsite_conversion.messaging_conversation_started_7d",
    ],
    rotulo: "conversas iniciadas",
    rotuloSingular: "conversa iniciada",
  },
  site: {
    campaignObjective: "OUTCOME_TRAFFIC",
    optimizationGoal: "LINK_CLICKS",
    billingEvent: "IMPRESSIONS",
    destinationType: "WEBSITE",
    ctaType: "LEARN_MORE",
    actionTypes: ["link_click"],
    rotulo: "cliques no link",
    rotuloSingular: "clique no link",
  },
  engajamento: {
    campaignObjective: "OUTCOME_ENGAGEMENT",
    optimizationGoal: "POST_ENGAGEMENT",
    billingEvent: "IMPRESSIONS",
    actionTypes: ["post_engagement"],
    rotulo: "interações",
    rotuloSingular: "interação",
  },
  perfil: {
    campaignObjective: "OUTCOME_TRAFFIC",
    optimizationGoal: "PROFILE_VISIT",
    billingEvent: "IMPRESSIONS",
    destinationType: "INSTAGRAM_PROFILE",
    actionTypes: ["profile_visit", "onsite_conversion.ig_profile_visit"],
    rotulo: "visitas ao perfil",
    rotuloSingular: "visita ao perfil",
  },
};

export function rotuloResultado(objetivo: string, quantidade: number) {
  const mapa = MAPA_OBJETIVOS[objetivo as Objetivo] ?? MAPA_OBJETIVOS.engajamento;
  return quantidade === 1 ? mapa.rotuloSingular : mapa.rotulo;
}

// ---------- segmentação ----------

async function buscarGeo(
  token: string,
  tipo: "region" | "city",
  termos: string[],
): Promise<Array<{ key: string }>> {
  const achados: Array<{ key: string }> = [];
  for (const termo of termos) {
    if (!termo.trim()) continue;
    const r = await call<{ data?: Array<{ key: string; type: string; country_code?: string }> }>(
      "/search",
      {
        token,
        params: {
          type: "adgeolocation",
          location_types: JSON.stringify([tipo]),
          q: termo,
          country_code: "BR",
          limit: 1,
        },
      },
    );
    const item = r.data?.[0];
    if (item?.key) achados.push({ key: item.key });
  }
  return achados;
}

export async function montarTargeting(token: string, publico: Publico) {
  const base: Record<string, unknown> = {
    geo_locations: { countries: [publico.pais || "BR"] },
    age_min: 18,
    age_max: 65,
  };

  if (publico.modo === "auto") {
    base.targeting_automation = { advantage_audience: 1 };
    return base;
  }

  const geo: Record<string, unknown> = { countries: [publico.pais || "BR"] };
  if (publico.estados?.length) {
    const regions = await buscarGeo(token, "region", publico.estados);
    if (regions.length) {
      geo.regions = regions;
      delete geo.countries;
    }
  }
  if (publico.cidades?.length) {
    const cities = await buscarGeo(token, "city", publico.cidades);
    if (cities.length) {
      geo.cities = cities.map((c) => ({ ...c, radius: 25, distance_unit: "kilometer" }));
      delete geo.countries;
    }
  }
  base.geo_locations = geo;
  if (publico.idade_min) base.age_min = Math.max(18, publico.idade_min);
  if (publico.idade_max) base.age_max = Math.min(65, publico.idade_max);
  if (publico.sexo === "feminino") base.genders = [2];
  if (publico.sexo === "masculino") base.genders = [1];
  return base;
}

// ---------- criação ----------

export type CriarBoostInput = {
  igMediaId: string;
  igUserId?: string | null;
  nome: string;
  objetivo: Objetivo;
  budgetType: "daily" | "lifetime";
  /** em reais */
  budgetAmount: number;
  totalBudget: number;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  publico: Publico;
  linkSite?: string | null;
};

export async function criarImpulsionamento(input: CriarBoostInput) {
  const { token, adAccountId, pageId, whatsappNumber } = metaAdsConfig();
  const mapa = MAPA_OBJETIVOS[input.objetivo];
  if (input.objetivo === "whatsapp" && !pageId) {
    throw new MetaAdsError(
      "Para anúncios de WhatsApp é preciso vincular a Página do Facebook da VIA AIR na configuração.",
    );
  }

  const inicio = new Date(`${input.startDate}T09:00:00-03:00`).toISOString();
  const fim = new Date(`${input.endDate}T23:59:00-03:00`).toISOString();

  // 1) Campanha (pausada até tudo ficar pronto)
  const campanha = await call<{ id: string }>(`/${adAccountId}/campaigns`, {
    method: "POST",
    token,
    params: {
      name: `[VIA AIR] ${input.nome}`.slice(0, 100),
      objective: mapa.campaignObjective,
      status: "PAUSED",
      special_ad_categories: JSON.stringify([]),
      buying_type: "AUCTION",
    },
  });

  const targeting = await montarTargeting(token, input.publico);
  const centavos = (v: number) => String(Math.round(v * 100));

  // 2) Conjunto de anúncios
  const adsetParams: Record<string, unknown> = {
    name: `Conjunto — ${input.nome}`.slice(0, 100),
    campaign_id: campanha.id,
    optimization_goal: mapa.optimizationGoal,
    billing_event: mapa.billingEvent,
    targeting: JSON.stringify(targeting),
    start_time: inicio,
    end_time: fim,
    status: "PAUSED",
  };
  if (input.budgetType === "daily") adsetParams.daily_budget = centavos(input.budgetAmount);
  else adsetParams.lifetime_budget = centavos(input.totalBudget);
  if (mapa.destinationType) adsetParams.destination_type = mapa.destinationType;
  if (input.objetivo === "whatsapp" && pageId) {
    adsetParams.promoted_object = JSON.stringify({ page_id: pageId });
  }

  const adset = await call<{ id: string }>(`/${adAccountId}/adsets`, {
    method: "POST",
    token,
    params: adsetParams,
  });

  // 3) Criativo a partir da publicação existente no Instagram
  const objectStorySpec: Record<string, unknown> = {};
  if (pageId) objectStorySpec.page_id = pageId;
  if (input.igUserId) objectStorySpec.instagram_user_id = input.igUserId;

  const creativeParams: Record<string, unknown> = {
    name: `Criativo — ${input.nome}`.slice(0, 100),
    source_instagram_media_id: input.igMediaId,
  };
  if (Object.keys(objectStorySpec).length) {
    creativeParams.object_story_spec = JSON.stringify(objectStorySpec);
  }
  if (input.objetivo === "whatsapp" && whatsappNumber) {
    creativeParams.call_to_action = JSON.stringify({
      type: "WHATSAPP_MESSAGE",
      value: { app_destination: "WHATSAPP", link: `https://api.whatsapp.com/send?phone=${whatsappNumber}` },
    });
  } else if (input.objetivo === "site" && input.linkSite) {
    creativeParams.call_to_action = JSON.stringify({
      type: "LEARN_MORE",
      value: { link: input.linkSite },
    });
  }

  const creative = await call<{ id: string }>(`/${adAccountId}/adcreatives`, {
    method: "POST",
    token,
    params: creativeParams,
  });

  // 4) Anúncio
  const ad = await call<{ id: string }>(`/${adAccountId}/ads`, {
    method: "POST",
    token,
    params: {
      name: input.nome.slice(0, 100),
      adset_id: adset.id,
      creative: JSON.stringify({ creative_id: creative.id }),
      status: "PAUSED",
    },
  });

  // 5) Só agora liga tudo
  await call(`/${adset.id}`, { method: "POST", token, params: { status: "ACTIVE" } });
  await call(`/${ad.id}`, { method: "POST", token, params: { status: "ACTIVE" } });
  await call(`/${campanha.id}`, { method: "POST", token, params: { status: "ACTIVE" } });

  return {
    campaign_id: campanha.id,
    adset_id: adset.id,
    ad_id: ad.id,
    creative_id: creative.id,
    ad_account_id: adAccountId,
    page_id: pageId,
  };
}

export async function alterarStatusCampanha(campaignId: string, ativo: boolean) {
  const { token } = metaAdsConfig();
  await call(`/${campaignId}`, {
    method: "POST",
    token,
    params: { status: ativo ? "ACTIVE" : "PAUSED" },
  });
}

export async function alterarOrcamento(params: {
  adsetId: string;
  budgetType: "daily" | "lifetime";
  valor: number;
}) {
  const { token } = metaAdsConfig();
  const centavos = String(Math.round(params.valor * 100));
  await call(`/${params.adsetId}`, {
    method: "POST",
    token,
    params:
      params.budgetType === "daily" ? { daily_budget: centavos } : { lifetime_budget: centavos },
  });
}

export type InsightsResumo = {
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  results: number;
  cost_per_result: number | null;
};

export async function buscarInsights(
  campaignId: string,
  objetivo: string,
): Promise<InsightsResumo> {
  const { token } = metaAdsConfig();
  const r = await call<{
    data?: Array<{
      spend?: string;
      reach?: string;
      impressions?: string;
      clicks?: string;
      actions?: Array<{ action_type: string; value: string }>;
    }>;
  }>(`/${campaignId}/insights`, {
    token,
    params: { fields: "spend,reach,impressions,clicks,actions", date_preset: "maximum" },
  });

  const linha = r.data?.[0] ?? {};
  const mapa = MAPA_OBJETIVOS[objetivo as Objetivo] ?? MAPA_OBJETIVOS.engajamento;
  let results = 0;
  for (const tipo of mapa.actionTypes) {
    const achado = linha.actions?.find((a) => a.action_type === tipo);
    if (achado) {
      results = Number(achado.value) || 0;
      break;
    }
  }
  const spend = Number(linha.spend ?? 0) || 0;
  return {
    spend,
    reach: Number(linha.reach ?? 0) || 0,
    impressions: Number(linha.impressions ?? 0) || 0,
    clicks: Number(linha.clicks ?? 0) || 0,
    results,
    cost_per_result: results > 0 ? spend / results : null,
  };
}

export async function buscarStatusCampanha(campaignId: string) {
  const { token } = metaAdsConfig();
  const r = await call<{
    effective_status?: string;
    status?: string;
    issues_info?: Array<{ error_message?: string; error_summary?: string }>;
  }>(`/${campaignId}`, {
    token,
    params: { fields: "status,effective_status,issues_info" },
  });
  return {
    status: r.status ?? null,
    effective_status: r.effective_status ?? null,
    motivo: r.issues_info?.[0]?.error_message ?? r.issues_info?.[0]?.error_summary ?? null,
  };
}

/** Valida token, conta de anúncios e permissões antes de turbinar. */
export async function validarConta() {
  const { token, adAccountId, pageId } = metaAdsConfig();
  const conta = await call<{
    name?: string;
    account_status?: number;
    currency?: string;
    disable_reason?: number;
  }>(`/${adAccountId}`, {
    token,
    params: { fields: "name,account_status,currency,disable_reason" },
  });
  const ativa = conta.account_status === 1;
  return {
    nome: conta.name ?? "Conta de anúncios Meta",
    moeda: conta.currency ?? "BRL",
    ativa,
    page_id: pageId,
    aviso: ativa
      ? null
      : "A conta de anúncios da Meta não está ativa (verifique faturamento ou restrições na Meta).",
  };
}
