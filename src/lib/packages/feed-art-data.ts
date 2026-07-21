/**
 * Lógica compartilhada entre feed-art (3:4) e story-art (9:16):
 * carrega fontes, deriva o estado do destino, formata datas, detecta
 * inclusos e monta o objeto FeedArtData a partir do registro do pacote.
 */
import type { FeedArtData } from "@/components/packages/PackageFeedArt";
import { fetchProxiedImage } from "@/lib/image-proxy.functions";
import { generatePackageTagline } from "@/lib/packages/ai.functions";

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&family=Dancing+Script:wght@600;700&display=swap";

export async function ensureFonts() {
  if (typeof document === "undefined") return;
  if (!document.querySelector(`link[data-vfeed-fonts]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_HREF;
    link.setAttribute("data-vfeed-fonts", "1");
    document.head.appendChild(link);
  }
  try {
    await Promise.all([
      (document as any).fonts?.load?.('900 100px "Montserrat"'),
      (document as any).fonts?.load?.('700 20px "Montserrat"'),
      (document as any).fonts?.load?.('700 48px "Dancing Script"'),
    ]);
    await (document as any).fonts?.ready;
  } catch {
    /* noop */
  }
}

const APT_LABEL: Record<number, string> = {
  1: "individual", 2: "duplo", 3: "triplo", 4: "quádruplo", 5: "quíntuplo",
};

const KNOWN_STATE: Record<string, string> = {
  "porto seguro": "Bahia", "salvador": "Bahia", "morro de sao paulo": "Bahia",
  "ilheus": "Bahia", "trancoso": "Bahia", "arraial d'ajuda": "Bahia",
  "maceio": "Alagoas", "maragogi": "Alagoas", "sao miguel dos milagres": "Alagoas",
  "recife": "Pernambuco", "porto de galinhas": "Pernambuco", "fernando de noronha": "Pernambuco",
  "natal": "Rio Grande do Norte", "pipa": "Rio Grande do Norte",
  "joao pessoa": "Paraiba",
  "fortaleza": "Ceara", "jericoacoara": "Ceara", "canoa quebrada": "Ceara",
  "sao luis": "Maranhao", "barreirinhas": "Maranhao",
  "belem": "Para",
  "manaus": "Amazonas",
  "rio de janeiro": "Rio de Janeiro", "buzios": "Rio de Janeiro", "angra dos reis": "Rio de Janeiro", "paraty": "Rio de Janeiro",
  "sao paulo": "Sao Paulo", "campos do jordao": "Sao Paulo", "ubatuba": "Sao Paulo", "ilhabela": "Sao Paulo",
  "curitiba": "Parana", "foz do iguacu": "Parana",
  "florianopolis": "Santa Catarina", "balneario camboriu": "Santa Catarina", "bombinhas": "Santa Catarina",
  "gramado": "Rio Grande do Sul", "canela": "Rio Grande do Sul", "porto alegre": "Rio Grande do Sul",
  "brasilia": "Distrito Federal",
  "bonito": "Mato Grosso do Sul", "campo grande": "Mato Grosso do Sul",
  "cuiaba": "Mato Grosso",
  "goiania": "Goias", "caldas novas": "Goias", "pirenopolis": "Goias",
  "belo horizonte": "Minas Gerais", "ouro preto": "Minas Gerais", "tiradentes": "Minas Gerais",
  "vitoria": "Espirito Santo", "guarapari": "Espirito Santo",
};

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function deriveState(destination: string, address?: string | null) {
  const key = norm(destination);
  if (KNOWN_STATE[key]) return KNOWN_STATE[key];
  if (address) {
    const m = address.match(/-\s*([A-Z]{2})\b/);
    const UF: Record<string, string> = {
      AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
      CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
      MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
      PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
      RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
      RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
      SE: "Sergipe", TO: "Tocantins",
    };
    if (m && UF[m[1]]) return UF[m[1]];
  }
  return "";
}

function formatDateBR(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function detectIncludes(list: string[] | null | undefined) {
  const s = (list ?? []).map((x) => norm(x)).join(" | ");
  return {
    aereo: /aereo|voo|passag|avia/.test(s),
    hotel: /hotel|hospedagem|resort|pousada|acomoda/.test(s),
    cafeDaManha: /cafe da manha|cafe|breakfast|acm|map|fap|all inclusive/.test(s),
    bagagem23kg: /bagagem|despachad|23\s*kg|23kg/.test(s),
    transfer: /transfer|traslado/.test(s),
    seguroViagem: /seguro/.test(s),
    esimInternacional: /esim|chip|internet/.test(s),
  };
}

async function toDataUrl(url: string): Promise<string> {
  const res = await fetchProxiedImage({ data: { url } });
  if (!res.ok || !("base64" in res)) throw new Error("Falha ao carregar imagem de capa");
  return `data:${res.contentType || "image/jpeg"};base64,${res.base64}`;
}

export type FeedInputPkg = {
  slug: string;
  destination: string;
  origin: string | null;
  going_date: string | null;
  return_date: string | null;
  nights: number | null;
  price_per_person: number;
  image_url: string | null;
  includes: string[] | null;
  hotel_name: string | null;
  hotel_stars: number | null;
  room_type: string | null;
  base_occupancy: number;
  tripadvisor_address?: string | null;
};

export async function buildFeedArtData(pkg: FeedInputPkg): Promise<FeedArtData> {
  if (!pkg.image_url) throw new Error("Cadastre a URL da imagem de capa para gerar a arte.");

  const [bg, tagline] = await Promise.all([
    toDataUrl(pkg.image_url),
    generatePackageTagline({ data: { destination: pkg.destination } })
      .then((r) => r.text)
      .catch(() => `Descubra ${pkg.destination}.`),
  ]);

  const pessoas = Math.max(1, Number(pkg.base_occupancy) || 2);
  return {
    backgroundDataUrl: bg,
    estado: deriveState(pkg.destination, pkg.tripadvisor_address),
    destino: pkg.destination,
    frase: tagline,
    dataIda: formatDateBR(pkg.going_date),
    dataVolta: formatDateBR(pkg.return_date),
    noites: pkg.nights,
    origem: pkg.origin || "",
    hotel: pkg.hotel_name || "",
    estrelas: pkg.hotel_stars,
    quantidadePessoas: pessoas,
    apartamento: APT_LABEL[pessoas] || `de ${pessoas} pessoas`,
    parcelas: 10,
    valorTotal: (Number(pkg.price_per_person) || 0) * pessoas,
    inclusos: detectIncludes(pkg.includes),
  };
}
