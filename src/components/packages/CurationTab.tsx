import { useMemo, useState } from "react";
import { Copy, Loader2, Sparkles, ExternalLink, Wand2, ImageDown, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateCurationCopy } from "@/lib/packages/curate.functions";

type Pkg = {
  id: string;
  slug: string;
  title: string;
  destination: string;
  origin: string | null;
  going_date: string | null;
  return_date: string | null;
  nights: number | null;
  price_per_person: number;
  base_occupancy: number;
  hotel_name: string | null;
  hotel_stars: number | null;
  meal_plan: string | null;
  is_active: boolean;
  image_url?: string | null;
  includes?: string[] | null;
  room_type?: string | null;
  tripadvisor_address?: string | null;
};

type Group = {
  key: string;
  title: string;
  reason: string;
  emoji: string;
  packages: Pkg[];
};

// ─── Ícones brand ──────────────────────────────────────────────────────────
function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.78 1.23 1.82 2.506 3.41 4.554 4.34.616.287 2.035.888 2.722.888.817 0 2.15-.515 2.478-1.318.13-.32.244-.66.244-1.005 0-.717-1.777-1.688-2.708-1.688zm-2.24 7.463h-.02a9.87 9.87 0 0 1-5.03-1.376l-.36-.214-3.75.98 1-3.65-.235-.375a9.86 9.86 0 0 1-1.512-5.26c.003-5.454 4.44-9.89 9.9-9.89 2.64 0 5.128 1.03 6.994 2.898a9.83 9.83 0 0 1 2.895 6.99c-.002 5.456-4.44 9.897-9.892 9.897zM26.72 5.281A13.19 13.19 0 0 0 16.876 1.2C9.62 1.2 3.712 7.104 3.708 14.362a13.147 13.147 0 0 0 1.756 6.578L3.6 27.75l6.977-1.83a13.157 13.157 0 0 0 6.294 1.603h.006c7.253 0 13.164-5.906 13.167-13.16A13.086 13.086 0 0 0 26.72 5.28z" />
    </svg>
  );
}
function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.42.56.22.96.48 1.38.9.42.42.68.82.9 1.38.17.42.37 1.06.42 2.23.06 1.26.07 1.64.07 4.85s-.01 3.6-.07 4.85c-.05 1.17-.25 1.8-.42 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.17-1.06.37-2.23.42-1.26.06-1.64.07-4.85.07s-3.6-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.42a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.17-.42-.37-1.06-.42-2.23C2.2 15.6 2.2 15.2 2.2 12s.01-3.6.07-4.85c.05-1.17.25-1.8.42-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.17 1.06-.37 2.23-.42C8.4 2.2 8.8 2.2 12 2.2M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.9 5.9 0 0 0-2.13 1.38A5.9 5.9 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13.67.67 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.9 5.9 0 0 0 2.13-1.38 5.9 5.9 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.9 5.9 0 0 0-1.38-2.13A5.9 5.9 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 12 18.16 6.16 6.16 0 0 0 12 5.84zm0 10.16A4 4 0 1 1 12 8a4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z" />
    </svg>
  );
}

const HOLIDAY_WINDOWS: Array<{ theme: string; from: string; to: string; label: string }> = [
  { theme: "natal", from: "2026-12-19", to: "2026-12-27", label: "Natal 2026" },
  { theme: "reveillon", from: "2026-12-27", to: "2027-01-04", label: "Réveillon 2026/27" },
  { theme: "carnaval", from: "2027-02-04", to: "2027-02-11", label: "Carnaval 2027" },
  { theme: "pascoa", from: "2027-03-24", to: "2027-03-29", label: "Páscoa 2027" },
  { theme: "natal", from: "2027-12-19", to: "2027-12-27", label: "Natal 2027" },
  { theme: "reveillon", from: "2027-12-27", to: "2028-01-04", label: "Réveillon 2027/28" },
  { theme: "carnaval", from: "2028-02-24", to: "2028-03-02", label: "Carnaval 2028" },
  { theme: "pascoa", from: "2028-04-12", to: "2028-04-17", label: "Páscoa 2028" },
  { theme: "prolongado", from: "2026-04-18", to: "2026-04-25", label: "Feriado de Tiradentes" },
  { theme: "prolongado", from: "2026-06-01", to: "2026-06-07", label: "Corpus Christi" },
  { theme: "prolongado", from: "2026-09-04", to: "2026-09-09", label: "7 de Setembro" },
  { theme: "prolongado", from: "2026-10-09", to: "2026-10-13", label: "N. Sra. Aparecida" },
  { theme: "prolongado", from: "2026-10-30", to: "2026-11-04", label: "Finados" },
  { theme: "prolongado", from: "2026-11-13", to: "2026-11-17", label: "Proclamação da República" },
  { theme: "prolongado", from: "2027-04-19", to: "2027-04-25", label: "Feriado de Tiradentes 2027" },
  { theme: "prolongado", from: "2027-09-04", to: "2027-09-09", label: "7 de Setembro 2027" },
];

// Cidades/países internacionais (heurística por nome do destino)
const INTERNATIONAL_KEYWORDS = [
  "bariloche", "buenos aires", "mendoza", "el calafate", "ushuaia", "salta", "córdoba argentina",
  "santiago", "santiago do chile", "chile", "valparaíso", "atacama", "puerto varas",
  "montevidéu", "montevideo", "punta del este",
  "cancún", "cancun", "playa del carmen", "cozumel", "riviera maya", "cidade do méxico", "méxico",
  "punta cana", "havana", "cuba", "aruba", "curaçao", "curacao", "bahamas", "jamaica",
  "orlando", "miami", "nova york", "new york", "las vegas", "los angeles", "san francisco", "chicago",
  "estados unidos", "eua", "usa",
  "paris", "lisboa", "porto", "madrid", "barcelona", "roma", "milão", "milano", "veneza", "florença",
  "londres", "amsterdam", "amsterdã", "berlim", "berlin", "praga", "viena", "atenas", "santorini",
  "dubai", "abu dhabi", "istambul", "cairo", "marrakech",
  "tóquio", "toquio", "kyoto", "seul", "bangkok", "bali", "phuket", "singapura", "hong kong",
  "cape town", "cidade do cabo",
  "cartagena", "medellín", "medellin", "bogotá", "bogota", "lima", "cusco", "machu picchu",
  "quito", "galápagos", "galapagos",
];

// Destinos "de neve/frio" — bom pra inverno
const WINTER_KEYWORDS = [
  "bariloche", "ushuaia", "el calafate", "valle nevado", "portillo", "san martín de los andes",
  "campos do jordão", "campos do jordao", "gramado", "canela", "monte verde", "urubici",
  "são joaquim", "sao joaquim", "serra gaúcha", "serra catarinense", "aspen", "whistler",
];

// Destinos praianos brasileiros — bom pra verão
const SUMMER_BR_KEYWORDS = [
  "porto seguro", "arraial d'ajuda", "trancoso", "morro de são paulo", "morro de sao paulo",
  "salvador", "praia do forte", "maragogi", "porto de galinhas", "maceió", "maceio", "japaratinga",
  "recife", "natal", "pipa", "fortaleza", "jericoacoara", "canoa quebrada", "aracaju",
  "florianópolis", "florianopolis", "balneário camboriú", "balneario camboriu", "bombinhas",
  "búzios", "buzios", "cabo frio", "arraial do cabo", "angra dos reis", "ilha grande", "paraty",
  "ubatuba", "ilhabela", "guarujá", "guaruja", "ilhéus", "ilheus", "itacaré", "itacare",
  "fernando de noronha", "alter do chão", "alter do chao",
];

function normalize(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function matchesAny(dest: string, keywords: string[]): boolean {
  const n = normalize(dest);
  return keywords.some((k) => n.includes(normalize(k)));
}

function withinWindow(dateStr: string | null, from: string, to: string): boolean {
  if (!dateStr) return false;
  return dateStr >= from && dateStr <= to;
}
function totalPrice(p: Pkg): number {
  return Number(p.price_per_person) * (p.base_occupancy ?? 2);
}
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(String(dateStr) + "T12:00:00").getTime();
  if (isNaN(d)) return null;
  return Math.round((d - Date.now()) / 86400000);
}
function monthOf(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const m = Number(dateStr.slice(5, 7));
  return isNaN(m) ? null : m;
}

export function CurationTab({ packages }: { packages: Pkg[] }) {
  const active = useMemo(() => (packages || []).filter((p) => p.is_active), [packages]);

  const groups = useMemo<Group[]>(() => {
    const list: Group[] = [];
    if (!active.length) return list;

    // 1. Melhores preços
    const cheapest = [...active].sort((a, b) => totalPrice(a) - totalPrice(b)).slice(0, 5);
    if (cheapest.length) {
      list.push({
        key: "menor-preco",
        emoji: "💰",
        title: "Melhores preços do momento",
        reason: "Ranking dos 5 pacotes com menor valor total no cadastro ativo.",
        packages: cheapest,
      });
    }

    // 2. Destinos internacionais (ordenado por preço)
    const intl = active
      .filter((p) => matchesAny(p.destination, INTERNATIONAL_KEYWORDS))
      .sort((a, b) => totalPrice(a) - totalPrice(b))
      .slice(0, 6);
    if (intl.length) {
      list.push({
        key: "internacional",
        emoji: "🌎",
        title: "Destaques internacionais",
        reason: "Pacotes fora do Brasil, ordenados do mais barato ao mais caro.",
        packages: intl,
      });
    }

    // 3. Inverno na neve (jun-ago, destinos frios)
    const winter = active
      .filter((p) => {
        const m = monthOf(p.going_date);
        return m !== null && m >= 6 && m <= 8 && matchesAny(p.destination, WINTER_KEYWORDS);
      })
      .sort((a, b) => totalPrice(a) - totalPrice(b))
      .slice(0, 6);
    if (winter.length) {
      list.push({
        key: "inverno-neve",
        emoji: "❄️",
        title: "Temporada de inverno — neve e frio",
        reason: "Saídas entre junho e agosto para destinos de neve e serra (Bariloche, Gramado, Campos do Jordão…).",
        packages: winter,
      });
    }

    // 4. Verão no Brasil (dez-mar, destinos praianos)
    const summer = active
      .filter((p) => {
        const m = monthOf(p.going_date);
        if (m === null) return false;
        const isSummerMonth = m === 12 || m === 1 || m === 2 || m === 3;
        return isSummerMonth && matchesAny(p.destination, SUMMER_BR_KEYWORDS);
      })
      .sort((a, b) => totalPrice(a) - totalPrice(b))
      .slice(0, 6);
    if (summer.length) {
      list.push({
        key: "verao-brasil",
        emoji: "🏖️",
        title: "Verão no Brasil — sol e praia",
        reason: "Saídas de dezembro a março para praias brasileiras.",
        packages: summer,
      });
    }

    // 5. Datas próximas (60 dias)
    const upcoming = active
      .filter((p) => {
        const d = daysUntil(p.going_date);
        return d !== null && d >= 0 && d <= 60;
      })
      .sort((a, b) => (daysUntil(a.going_date) ?? 999) - (daysUntil(b.going_date) ?? 999))
      .slice(0, 5);
    if (upcoming.length) {
      list.push({
        key: "proximos",
        emoji: "⏱️",
        title: "Saídas nos próximos 60 dias",
        reason: "Embarques próximos — bom apelo de urgência.",
        packages: upcoming,
      });
    }

    // 6. Feriados temáticos
    const byTheme = new Map<string, Pkg[]>();
    for (const p of active) {
      for (const w of HOLIDAY_WINDOWS) {
        if (withinWindow(p.going_date, w.from, w.to)) {
          const key = `${w.theme}:${w.label}`;
          if (!byTheme.has(key)) byTheme.set(key, []);
          byTheme.get(key)!.push(p);
          break;
        }
      }
    }
    const themeOrder = ["natal", "reveillon", "carnaval", "pascoa", "prolongado"];
    const themeMeta: Record<string, { title: string; reason: string; emoji: string }> = {
      natal: { title: "Pacotes para o Natal", reason: "Datas alinhadas ao Natal — alta procura, ideal para divulgar.", emoji: "🎄" },
      reveillon: { title: "Pacotes para o Réveillon", reason: "Saídas na virada — bom para venda antecipada.", emoji: "🎆" },
      carnaval: { title: "Pacotes para o Carnaval", reason: "Saídas na semana do Carnaval — feriado longo.", emoji: "🎭" },
      pascoa: { title: "Pacotes para a Páscoa", reason: "Feriado de Páscoa com viagem inclusa.", emoji: "🐣" },
      prolongado: { title: "Pacotes em feriados prolongados", reason: "Feriados nacionais prolongados — bom para escapadas curtas.", emoji: "🗓️" },
    };
    for (const theme of themeOrder) {
      const merged: Pkg[] = [];
      const labels: string[] = [];
      for (const [k, arr] of byTheme.entries()) {
        if (!k.startsWith(theme + ":")) continue;
        labels.push(k.split(":")[1]);
        merged.push(...arr);
      }
      if (!merged.length) continue;
      const seen = new Set<string>();
      const unique = merged.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
      unique.sort((a, b) => totalPrice(a) - totalPrice(b));
      const meta = themeMeta[theme];
      list.push({
        key: `feriado-${theme}`,
        emoji: meta.emoji,
        title: meta.title,
        reason: `${meta.reason} ${labels.length ? `(${labels.join(", ")})` : ""}`.trim(),
        packages: unique.slice(0, 6),
      });
    }

    return list;
  }, [active]);

  const [filter, setFilter] = useState<string>("all");
  const visibleGroups = filter === "all" ? groups : groups.filter((g) => g.key === filter);

  if (!active.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhum pacote ativo para curar. Ative pacotes na aba anterior.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho didático */}
      <div className="rounded-2xl border border-brand-orange/30 bg-gradient-to-br from-brand-orange/10 to-transparent p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-orange/15 p-2">
            <Sparkles className="h-5 w-5 text-brand-orange" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-foreground">Curadoria automática</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              A IA agrupa os pacotes ativos em <b>coleções prontas para divulgar</b>: melhor preço,
              destinos internacionais, temporada (inverno / verão), saídas próximas e feriados.
              Em cada pacote, clique nos círculos <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-[#25D366]" /> WhatsApp</span> ou
              {" "}<span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]" /> Instagram</span> para gerar a legenda pronta,
              e nos ícones <b>Feed</b> ou <b>Story</b> para baixar a arte.
            </div>
          </div>
        </div>
      </div>

      {/* Filtro rápido por coleção */}
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="Todas" emoji="✨" count={groups.length} />
          {groups.map((g) => (
            <FilterChip
              key={g.key}
              active={filter === g.key}
              onClick={() => setFilter(g.key)}
              label={g.title.replace(/^Pacotes (para o|em|para a) /i, "")}
              emoji={g.emoji}
              count={g.packages.length}
            />
          ))}
        </div>
      )}

      {visibleGroups.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum grupo destacado. Cadastre pacotes com datas em feriados ou próximas.
        </div>
      )}

      {visibleGroups.map((g) => (
        <GroupCard key={g.key} group={g} />
      ))}
    </div>
  );
}

function FilterChip({
  active, onClick, label, emoji, count,
}: {
  active: boolean; onClick: () => void; label: string; emoji: string; count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
        (active
          ? "border-brand-orange bg-brand-orange text-white shadow-sm"
          : "border-border bg-card text-foreground hover:border-brand-orange/60 hover:text-brand-orange")
      }
    >
      <span>{emoji}</span>
      <span>{label}</span>
      <span className={"rounded-full px-1.5 text-[10px] " + (active ? "bg-white/20" : "bg-muted text-muted-foreground")}>{count}</span>
    </button>
  );
}

function GroupCard({ group }: { group: Group }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{group.emoji}</span>
          <h3 className="text-sm font-black uppercase tracking-tight text-foreground">
            {group.title}
          </h3>
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">
            {group.packages.length} {group.packages.length === 1 ? "pacote" : "pacotes"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">{group.reason}</p>
      </div>

      <div className="divide-y divide-border">
        {group.packages.map((p) => (
          <PackageRow key={p.id} pkg={p} groupTitle={group.title} groupReason={group.reason} />
        ))}
      </div>
    </div>
  );
}

function PackageRow({ pkg, groupTitle, groupReason }: { pkg: Pkg; groupTitle: string; groupReason: string }) {
  const generateFn = useServerFn(generateCurationCopy);
  const [loading, setLoading] = useState<"whatsapp" | "instagram" | "feed" | "story" | null>(null);
  const [output, setOutput] = useState<{ channel: "whatsapp" | "instagram"; text: string } | null>(null);

  const total = Number(pkg.price_per_person) * (pkg.base_occupancy ?? 2);
  const dfmt = (s: string | null) =>
    s ? new Date(String(s) + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";

  async function handleGenerate(channel: "whatsapp" | "instagram") {
    setLoading(channel);
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      const res = await generateFn({
        data: {
          channel,
          groupTitle,
          groupReason,
          packages: [{
            title: pkg.title,
            destination: pkg.destination,
            origin: pkg.origin,
            going_date: pkg.going_date,
            return_date: pkg.return_date,
            nights: pkg.nights,
            price_per_person: Number(pkg.price_per_person),
            base_occupancy: pkg.base_occupancy ?? 2,
            hotel_name: pkg.hotel_name,
            hotel_stars: pkg.hotel_stars,
            meal_plan: pkg.meal_plan,
            slug: pkg.slug,
          }],
          baseUrl,
        },
      });
      setOutput({ channel, text: res.text });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar texto");
    } finally {
      setLoading(null);
    }
  }

  async function copyText() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output.text);
      toast.success("Texto copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function downloadArt(kind: "feed" | "story") {
    if (!pkg.image_url) {
      toast.error("Cadastre a URL da imagem de capa do pacote antes de gerar a arte.");
      return;
    }
    setLoading(kind);
    try {
      const input = {
        slug: pkg.slug,
        destination: pkg.destination,
        origin: pkg.origin,
        going_date: pkg.going_date,
        return_date: pkg.return_date,
        nights: pkg.nights,
        price_per_person: Number(pkg.price_per_person),
        image_url: pkg.image_url,
        includes: pkg.includes ?? null,
        hotel_name: pkg.hotel_name,
        hotel_stars: pkg.hotel_stars,
        room_type: pkg.room_type ?? null,
        base_occupancy: pkg.base_occupancy ?? 2,
        tripadvisor_address: pkg.tripadvisor_address ?? null,
      };
      if (kind === "feed") {
        const { generatePackageFeedArt } = await import("@/lib/packages/feed-art");
        await generatePackageFeedArt(input);
      } else {
        const { generatePackageStoryArt } = await import("@/lib/packages/story-art");
        await generatePackageStoryArt(input);
      }
      toast.success(kind === "feed" ? "Arte Feed (3:4) baixada!" : "Arte Story (9:16) baixada!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar a arte");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="px-4 py-3 text-xs">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground truncate">{pkg.title}</div>
          <div className="text-muted-foreground mt-0.5">
            {pkg.destination}
            {pkg.going_date && <> · {dfmt(pkg.going_date)}{pkg.return_date ? ` a ${dfmt(pkg.return_date)}` : ""}</>}
            {pkg.nights ? ` · ${pkg.nights}n` : ""}
            {pkg.hotel_name ? ` · ${pkg.hotel_name}` : ""}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted-foreground uppercase">Total ({pkg.base_occupancy ?? 2}p)</div>
          <div className="font-black tabular-nums text-foreground">
            {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>
        <a
          href={`/pacotes/${pkg.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:text-brand-orange hover:border-brand-orange"
          aria-label="Abrir pacote"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Ações — círculos com logo */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">Gerar:</span>
        <CircleButton
          title="Gerar legenda para WhatsApp"
          onClick={() => handleGenerate("whatsapp")}
          disabled={loading !== null}
          loading={loading === "whatsapp"}
          className="bg-[#25D366] hover:bg-[#1fb457] text-white"
        >
          <WhatsAppIcon />
        </CircleButton>
        <CircleButton
          title="Gerar legenda para Instagram"
          onClick={() => handleGenerate("instagram")}
          disabled={loading !== null}
          loading={loading === "instagram"}
          className="bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90 text-white"
        >
          <InstagramIcon />
        </CircleButton>

        <span className="mx-1 h-6 w-px bg-border" />

        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">Baixar arte:</span>
        <CircleButton
          title="Baixar arte Feed 3:4"
          onClick={() => downloadArt("feed")}
          disabled={loading !== null}
          loading={loading === "feed"}
          className="bg-card border border-border text-foreground hover:border-brand-orange hover:text-brand-orange"
        >
          <ImageDown className="h-4 w-4" />
        </CircleButton>
        <CircleButton
          title="Baixar arte Story 9:16"
          onClick={() => downloadArt("story")}
          disabled={loading !== null}
          loading={loading === "story"}
          className="bg-card border border-border text-foreground hover:border-brand-orange hover:text-brand-orange"
        >
          <Smartphone className="h-4 w-4" />
        </CircleButton>
      </div>

      {output && (
        <div className="mt-3 rounded-lg border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-orange flex items-center gap-1.5">
              <Wand2 className="h-3 w-3" />
              Texto para {output.channel === "whatsapp" ? "WhatsApp" : "Instagram"}
            </div>
            <button
              type="button"
              onClick={copyText}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-[10px] font-semibold text-foreground hover:border-brand-orange hover:text-brand-orange"
            >
              <Copy className="h-3 w-3" /> Copiar
            </button>
          </div>
          <textarea
            readOnly
            value={output.text}
            className="w-full min-h-[180px] rounded-lg border border-border bg-background p-2.5 text-[11px] font-mono text-foreground leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}

function CircleButton({
  children, onClick, disabled, loading, title, className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed " +
        className
      }
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}
