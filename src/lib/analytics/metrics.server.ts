/** Agregações das métricas de uso do site e dos links curtos. */

type Row = Record<string, any>;

function contar<T extends string>(rows: Row[], campo: T, limite = 12) {
  const mapa = new Map<string, number>();
  for (const r of rows) {
    const k = (r[campo] ?? "—") as string;
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limite);
}

/** Rótulos legíveis para geolocalização ausente. */
function rotuloGeo(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s || "Não identificado";
}

function classificarOrigem(r: Row) {
  if (r.short_slug) return `Link curto (/l/${r.short_slug})`;
  if (r.utm_source) return `Campanha: ${r.utm_source}`;
  const host = r.referrer_host as string | null;
  if (!host) return "Acesso direto";
  if (/instagram/.test(host)) return "Instagram";
  if (/whatsapp|wa\.me/.test(host)) return "WhatsApp";
  if (/google|bing|duckduck/.test(host)) return "Busca (Google/Bing)";
  if (/facebook/.test(host)) return "Facebook";
  return host;
}

export async function carregarMetricasSite(dias: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("site_events")
    .select("*")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(50000);
  if (error) throw new Error(error.message);
  const { isRotaInterna } = await import("./public-scope");
  // relatórios consideram apenas o tráfego público do site
  const { isHostInterno } = await import("./public-scope");
  const { nomeDoPais, nomeDaRegiao } = await import("./ua.server");
  const rows = ((data ?? []) as Row[])
    // ignora rotas internas e tráfego vindo do ambiente de teste/preview
    .filter((r) => !isRotaInterna(r.path) && !isHostInterno(r.referrer_host))
    .map((r): Row => ({
      ...r,
      country: rotuloGeo(nomeDoPais(r.country)),
      region: rotuloGeo(nomeDaRegiao(r.region, r.country)),
      city: rotuloGeo(r.city),
    }));

  const pageviews = rows.filter((r) => r.event_type === "pageview");
  const cliques = rows.filter((r) => r.event_type === "click");
  const sessoes = new Set(rows.map((r) => r.session_id));
  const visitantes = new Set(rows.map((r) => r.visitor_id).filter(Boolean));

  // páginas por sessão → quantas realmente navegaram (2+ páginas)
  const porSessao = new Map<string, { paginas: Set<string>; duracao: number }>();
  for (const r of rows) {
    const s = porSessao.get(r.session_id) ?? { paginas: new Set<string>(), duracao: 0 };
    if (r.event_type === "pageview" && r.path) s.paginas.add(r.path);
    if (r.duration_ms) s.duracao = Math.max(s.duracao, Number(r.duration_ms));
    porSessao.set(r.session_id, s);
  }
  const navegaram = [...porSessao.values()].filter((s) => s.paginas.size > 1).length;
  const somaDuracao = [...porSessao.values()].reduce((a, s) => a + s.duracao, 0);
  const tempoMedioMs = porSessao.size ? Math.round(somaDuracao / porSessao.size) : 0;
  const rejeicao = porSessao.size
    ? Math.round((([...porSessao.values()].filter((s) => s.paginas.size <= 1).length) / porSessao.size) * 100)
    : 0;

  // série diária de visitas
  const serieMapa = new Map<string, { sessoes: Set<string>; views: number }>();
  for (const r of rows) {
    const dia = String(r.created_at).slice(0, 10);
    const s = serieMapa.get(dia) ?? { sessoes: new Set<string>(), views: 0 };
    s.sessoes.add(r.session_id);
    if (r.event_type === "pageview") s.views += 1;
    serieMapa.set(dia, s);
  }
  const serie = [...serieMapa.entries()]
    .map(([dia, v]) => ({ dia, sessoes: v.sessoes.size, views: v.views }))
    .sort((a, b) => a.dia.localeCompare(b.dia));

  const entradas = pageviews.filter((r) => r.entry);
  const origens = contar(
    entradas.map((r) => ({ origem: classificarOrigem(r) })),
    "origem",
  );
  const direto = entradas.filter((r) => classificarOrigem(r) === "Acesso direto").length;

  return {
    resumo: {
      visitantes: visitantes.size,
      sessoes: sessoes.size,
      pageviews: pageviews.length,
      navegaram,
      cliques: cliques.length,
      tempoMedioMs,
      rejeicao,
      direto,
      diretoPct: entradas.length ? Math.round((direto / entradas.length) * 100) : 0,
    },
    serie,
    paginas: contar(pageviews, "path", 15),
    entradasPagina: contar(entradas, "path", 10),
    cliquesTop: contar(cliques, "target_label", 15),
    paises: contar(rows, "country", 10),
    regioes: contar(rows, "region", 10),
    cidades: contar(rows, "city", 10),
    dispositivos: contar(rows, "device", 5),
    navegadores: contar(rows, "browser", 6),
    sistemas: contar(rows, "os", 6),
    origens,
    campanhas: contar(
      rows.filter((r) => r.utm_campaign),
      "utm_campaign",
      10,
    ),
  };
}

export async function carregarMetricasLinks(dias: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: cliques, error: e1 }, { data: links, error: e2 }] = await Promise.all([
    supabaseAdmin
      .from("short_link_clicks")
      .select("*")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(50000),
    supabaseAdmin
      .from("short_links")
      .select("slug,label,target_url,click_count,created_at,last_click_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const { nomeDoPais, nomeDaRegiao } = await import("./ua.server");
  const rows = ((cliques ?? []) as Row[]).map((r): Row => ({
    ...r,
    country: rotuloGeo(nomeDoPais(r.country)),
    region: rotuloGeo(nomeDaRegiao(r.region, r.country)),
    city: rotuloGeo(r.city),
  }));
  const porSlug = new Map<string, number>();
  for (const r of rows) porSlug.set(r.slug, (porSlug.get(r.slug) ?? 0) + 1);

  const detalhado = ((links ?? []) as Row[])
    .map((l) => ({
      slug: l.slug as string,
      label: (l.label as string | null) ?? null,
      target_url: l.target_url as string,
      total: (l.click_count as number) ?? 0,
      periodo: porSlug.get(l.slug as string) ?? 0,
      last_click_at: l.last_click_at as string | null,
      created_at: l.created_at as string,
    }))
    .sort((a, b) => b.periodo - a.periodo || b.total - a.total);

  return {
    resumo: {
      cliquesPeriodo: rows.length,
      linksAtivos: detalhado.filter((l) => l.periodo > 0).length,
      linksTotais: detalhado.length,
    },
    links: detalhado,
    origens: contar(
      rows.map((r) => ({ origem: r.referrer_host || "Direto (WhatsApp/app)" })),
      "origem",
      10,
    ),
    paises: contar(rows, "country", 8),
    regioes: contar(rows, "region", 8),
    cidades: contar(rows, "city", 8),
    dispositivos: contar(rows, "device", 5),
  };
}
