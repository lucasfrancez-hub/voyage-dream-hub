const BUCKET = "package-hotel-photos";
const MAX_PHOTOS = 5;
const MAX_BYTES = 12 * 1024 * 1024;
const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

function norm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(hotel|resort|pousada|by|gav|hoteis|hotels|flat|inn)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Confere se a legenda da foto realmente cita o hotel procurado. */
function legendaBate(hotelName: string, legenda: string) {
  const alvo = norm(hotelName);
  const texto = norm(legenda);
  if (!alvo || !texto) return false;
  const tokens = alvo.split(" ").filter((t) => t.length > 2);
  if (!tokens.length) return false;
  const acertos = tokens.filter((t) => texto.includes(t)).length;
  return acertos / tokens.length >= 0.6;
}

function extensionFor(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("avif")) return "avif";
  return "jpg";
}

/** Sobe a resolução das miniaturas conhecidas para uma versão grande. */
function emAltaResolucao(url: string) {
  return url
    .replace(/\/max(?:300|500|750|800)(?:x\d+)?\//i, "/max1024x768/")
    .replace(/\/square\d+\//i, "/max1024x768/");
}

function fotoValida(url: string) {
  if (!/^https:\/\//i.test(url)) return false;
  if (/\.(svg|gif)(\?|$)/i.test(url)) return false;
  // Ignora avatares de avaliadores, bandeiras e ícones de layout.
  return !/(googleusercontent|graph\.facebook|design-assets|images-flags|xphoto|static\/img|logo|icon|sprite)/i.test(
    url,
  );
}

type Achado = { url: string; legenda: string };

function extrairImagens(markdown: string): Achado[] {
  const achados: Achado[] = [];
  const regex = /!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown))) {
    const legenda = match[1] ?? "";
    const url = match[2] ?? "";
    if (fotoValida(url)) achados.push({ url, legenda });
  }
  return achados;
}

async function firecrawlSearch(query: string) {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const firecrawlKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableApiKey || !firecrawlKey) return [] as Achado[];

  const response = await fetch(`${GATEWAY}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": firecrawlKey,
    },
    body: JSON.stringify({
      query,
      limit: 3,
      lang: "pt",
      country: "br",
      scrapeOptions: { formats: ["markdown"] },
    }),
  });
  if (!response.ok) {
    const detalhe = await response.text().catch(() => "");
    console.warn(`[hotel-photos] Firecrawl ${response.status}: ${detalhe.slice(0, 400)}`);
    return [] as Achado[];
  }

  const json = (await response.json()) as {
    data?: { web?: Array<{ markdown?: string; description?: string }> } | Array<{ markdown?: string }>;
  };
  const resultados = Array.isArray(json.data) ? json.data : (json.data?.web ?? []);
  const achados: Achado[] = [];
  for (const item of resultados) {
    const texto = `${item.markdown ?? ""}\n${(item as { description?: string }).description ?? ""}`;
    achados.push(...extrairImagens(texto));
  }
  return achados;
}

/** Busca fotos reais da propriedade na web e salva até cinco no storage. */
export async function recoverHotelPhotos(
  hotelName: string,
  city: string | null,
): Promise<string[]> {
  const local = city ? `${hotelName} ${city}` : hotelName;
  const achados = [
    ...(await firecrawlSearch(`${local} booking.com fotos do hotel`).catch(() => [])),
    ...(await firecrawlSearch(`${local} hotel fotos`).catch(() => [])),
  ];
  if (!achados.length) return [];

  const preferidas = achados.filter((a) => legendaBate(hotelName, a.legenda));
  const ordenadas = preferidas.length ? preferidas : [];
  if (!ordenadas.length) {
    console.warn(`[hotel-photos] nenhuma foto confirmada para: ${hotelName}`);
    return [];
  }

  const vistas = new Set<string>();
  const candidatas: Array<{ grande: string; original: string }> = [];
  for (const achado of ordenadas) {
    const chave = (achado.url.split("?")[0] ?? achado.url).replace(/\/max\d+(?:x\d+)?\//i, "/");
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    candidatas.push({ grande: emAltaResolucao(achado.url), original: achado.url });
    if (candidatas.length >= MAX_PHOTOS * 3) break;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const folder = crypto.randomUUID();
  const persisted: string[] = [];

  const baixar = async (url: string) => {
    const response = await fetch(url, {
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      redirect: "follow",
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0] ?? "";
    if (!contentType.startsWith("image/")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 8_000 || bytes.byteLength > MAX_BYTES) return null;
    return { bytes, contentType };
  };

  for (const candidata of candidatas) {
    if (persisted.length >= MAX_PHOTOS) break;
    try {
      // A URL ampliada pode não ter assinatura válida; nesse caso usa a original.
      const baixada =
        (await baixar(candidata.grande).catch(() => null)) ??
        (candidata.grande === candidata.original
          ? null
          : await baixar(candidata.original).catch(() => null));
      if (!baixada) continue;
      const { bytes, contentType } = baixada;
      const path = `${folder}/${persisted.length + 1}.${extensionFor(contentType)}`;
      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType, upsert: true, cacheControl: "31536000" });
      if (!error) persisted.push(`/api/public/package-hotel-photo/${path}`);
    } catch {
      // Tenta a próxima imagem encontrada.
    }
  }

  return persisted;
}
