import { useMemo, useState } from "react";
import { Copy, Loader2, ExternalLink, Wand2, ImageDown, Smartphone, Send } from "lucide-react";
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
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412 0 6.556-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.29-4.143c1.589.943 3.385 1.44 5.217 1.441 5.485 0 9.95-4.466 9.95-9.95 0-2.657-1.034-5.155-2.91-7.031s-4.375-2.91-7.031-2.91c-5.485 0-9.95 4.466-9.95 9.951 0 1.913.546 3.782 1.582 5.39l-1.04 3.797 3.892-1.021zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}
function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
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

const INTERNATIONAL_KEYWORDS = [
  "bariloche", "buenos aires", "mendoza", "el calafate", "ushuaia", "salta",
  "santiago", "chile", "valparaíso", "atacama", "puerto varas",
  "montevidéu", "montevideo", "punta del este",
  "cancún", "cancun", "playa del carmen", "cozumel", "riviera maya", "cidade do méxico", "méxico",
  "punta cana", "havana", "cuba", "aruba", "curaçao", "curacao", "bahamas", "jamaica",
  "orlando", "miami", "nova york", "new york", "las vegas", "los angeles", "san francisco",
  "estados unidos", "eua", "usa",
  "paris", "lisboa", "porto", "madrid", "barcelona", "roma", "milão", "milano", "veneza", "florença",
  "londres", "amsterdam", "amsterdã", "berlim", "praga", "viena", "atenas", "santorini",
  "dubai", "abu dhabi", "istambul", "cairo", "marrakech",
  "tóquio", "toquio", "kyoto", "seul", "bangkok", "bali", "phuket", "singapura", "hong kong",
  "cape town", "cidade do cabo",
  "cartagena", "medellín", "medellin", "bogotá", "bogota", "lima", "cusco", "machu picchu",
  "quito", "galápagos", "galapagos",
];
const WINTER_KEYWORDS = [
  "bariloche", "ushuaia", "el calafate", "valle nevado", "portillo",
  "campos do jordão", "campos do jordao", "gramado", "canela", "monte verde", "urubici",
  "são joaquim", "sao joaquim", "serra gaúcha", "serra catarinense",
];
const SUMMER_BR_KEYWORDS = [
  "porto seguro", "arraial d'ajuda", "trancoso", "morro de são paulo", "morro de sao paulo",
  "salvador", "praia do forte", "maragogi", "porto de galinhas", "maceió", "maceio", "japaratinga",
  "recife", "natal", "pipa", "fortaleza", "jericoacoara", "canoa quebrada", "aracaju",
  "florianópolis", "florianopolis", "balneário camboriú", "balneario camboriu", "bombinhas",
  "búzios", "buzios", "cabo frio", "arraial do cabo", "angra dos reis", "ilha grande", "paraty",
  "ubatuba", "ilhabela", "guarujá", "guaruja", "ilhéus", "ilheus", "itacaré", "itacare",
  "fernando de noronha", "alter do chão", "alter do chao",
];

const normalize = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const matchesAny = (dest: string, keywords: string[]) => {
  const n = normalize(dest);
  return keywords.some((k) => n.includes(normalize(k)));
};
const withinWindow = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;
const totalPrice = (p: Pkg) => Number(p.price_per_person) * (p.base_occupancy ?? 2);
const daysUntil = (s: string | null) => {
  if (!s) return null;
  const d = new Date(String(s) + "T12:00:00").getTime();
  return isNaN(d) ? null : Math.round((d - Date.now()) / 86400000);
};
const monthOf = (s: string | null) => {
  if (!s) return null;
  const m = Number(s.slice(5, 7));
  return isNaN(m) ? null : m;
};

export function CurationTab({ packages }: { packages: Pkg[] }) {
  const active = useMemo(() => (packages || []).filter((p) => p.is_active), [packages]);

  const groups = useMemo<Group[]>(() => {
    const list: Group[] = [];
    if (!active.length) return list;

    const cheapest = [...active].sort((a, b) => totalPrice(a) - totalPrice(b)).slice(0, 5);
    if (cheapest.length) list.push({
      key: "menor-preco", emoji: "💰", title: "Melhores preços do momento",
      reason: "Ranking dos 5 pacotes com menor valor total no cadastro ativo.", packages: cheapest,
    });

    const intl = active.filter((p) => matchesAny(p.destination, INTERNATIONAL_KEYWORDS))
      .sort((a, b) => totalPrice(a) - totalPrice(b)).slice(0, 6);
    if (intl.length) list.push({
      key: "internacional", emoji: "🌎", title: "Destaques internacionais",
      reason: "Pacotes fora do Brasil, ordenados do mais barato ao mais caro.", packages: intl,
    });

    const winter = active.filter((p) => {
      const m = monthOf(p.going_date);
      return m !== null && m >= 6 && m <= 8 && matchesAny(p.destination, WINTER_KEYWORDS);
    }).sort((a, b) => totalPrice(a) - totalPrice(b)).slice(0, 6);
    if (winter.length) list.push({
      key: "inverno-neve", emoji: "❄️", title: "Temporada de inverno — neve e frio",
      reason: "Saídas entre junho e agosto para destinos de neve e serra.", packages: winter,
    });

    const summer = active.filter((p) => {
      const m = monthOf(p.going_date);
      if (m === null) return false;
      return (m === 12 || m === 1 || m === 2 || m === 3) && matchesAny(p.destination, SUMMER_BR_KEYWORDS);
    }).sort((a, b) => totalPrice(a) - totalPrice(b)).slice(0, 6);
    if (summer.length) list.push({
      key: "verao-brasil", emoji: "🏖️", title: "Verão no Brasil — sol e praia",
      reason: "Saídas de dezembro a março para praias brasileiras.", packages: summer,
    });

    const upcoming = active.filter((p) => {
      const d = daysUntil(p.going_date);
      return d !== null && d >= 0 && d <= 60;
    }).sort((a, b) => (daysUntil(a.going_date) ?? 999) - (daysUntil(b.going_date) ?? 999)).slice(0, 5);
    if (upcoming.length) list.push({
      key: "proximos", emoji: "⏱️", title: "Saídas nos próximos 60 dias",
      reason: "Embarques próximos — bom apelo de urgência.", packages: upcoming,
    });

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
      natal: { title: "Pacotes para o Natal", reason: "Datas alinhadas ao Natal — alta procura.", emoji: "🎄" },
      reveillon: { title: "Pacotes para o Réveillon", reason: "Saídas na virada — bom para venda antecipada.", emoji: "🎆" },
      carnaval: { title: "Pacotes para o Carnaval", reason: "Saídas na semana do Carnaval — feriado longo.", emoji: "🎭" },
      pascoa: { title: "Pacotes para a Páscoa", reason: "Feriado de Páscoa com viagem inclusa.", emoji: "🐣" },
      prolongado: { title: "Pacotes em feriados prolongados", reason: "Feriados nacionais prolongados — bom pra escapadas curtas.", emoji: "🗓️" },
    };
    for (const theme of themeOrder) {
      const merged: Pkg[] = []; const labels: string[] = [];
      for (const [k, arr] of byTheme.entries()) {
        if (!k.startsWith(theme + ":")) continue;
        labels.push(k.split(":")[1]); merged.push(...arr);
      }
      if (!merged.length) continue;
      const seen = new Set<string>();
      const unique = merged.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
      unique.sort((a, b) => totalPrice(a) - totalPrice(b));
      const meta = themeMeta[theme];
      list.push({
        key: `feriado-${theme}`, emoji: meta.emoji, title: meta.title,
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
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
        Nenhum pacote ativo para curar. Ative pacotes na aba anterior.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Chips de filtro */}
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-2 pb-6 border-b border-white/5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="Todas" emoji="✨" count={groups.length} />
          {groups.map((g) => (
            <FilterChip
              key={g.key} active={filter === g.key} onClick={() => setFilter(g.key)}
              label={g.title.replace(/^Pacotes (para o|em|para a) /i, "").replace(/ — .*$/, "")}
              emoji={g.emoji} count={g.packages.length}
            />
          ))}
        </div>
      )}

      {visibleGroups.length === 0 && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
          Nenhum grupo destacado.
        </div>
      )}

      {visibleGroups.map((g, idx) => (
        <GroupSection
          key={g.key}
          group={g}
          index={filter === "all" ? idx + 1 : groups.findIndex((x) => x.key === g.key) + 1}
        />
      ))}
    </div>
  );
}

function FilterChip({
  active, onClick, label, emoji, count,
}: { active: boolean; onClick: () => void; label: string; emoji: string; count: number; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 " +
        (active
          ? "bg-brand-orange text-white border border-brand-orange shadow-lg shadow-brand-orange/20"
          : "bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10 hover:text-slate-200")
      }
    >
      <span>{emoji}</span>
      <span>{label}</span>
      <span className={"ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] " + (active ? "bg-white/25" : "bg-white/10 text-slate-500")}>{count}</span>
    </button>
  );
}

function GroupSection({ group, index }: { group: Group; index: number }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-3 leading-tight">
            <span className="text-brand-orange">#{String(index).padStart(2, "0")}</span>
            <span>{group.emoji}</span>
            {group.title}
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">{group.reason}</p>
        </div>
        <div className="hidden sm:block px-3 py-1 bg-brand-orange/10 border border-brand-orange/20 rounded text-brand-orange text-[10px] font-bold tracking-tighter uppercase whitespace-nowrap">
          {group.packages.length} {group.packages.length === 1 ? "pacote" : "pacotes"}
        </div>
      </div>

      <div className="space-y-3">
        {group.packages.map((p) => (
          <PackageRow key={p.id} pkg={p} groupTitle={group.title} groupReason={group.reason} />
        ))}
      </div>
    </section>
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
          channel, groupTitle, groupReason,
          packages: [{
            title: pkg.title, destination: pkg.destination, origin: pkg.origin,
            going_date: pkg.going_date, return_date: pkg.return_date, nights: pkg.nights,
            price_per_person: Number(pkg.price_per_person), base_occupancy: pkg.base_occupancy ?? 2,
            hotel_name: pkg.hotel_name, hotel_stars: pkg.hotel_stars, meal_plan: pkg.meal_plan, slug: pkg.slug,
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
    try { await navigator.clipboard.writeText(output.text); toast.success("Texto copiado!"); }
    catch { toast.error("Não foi possível copiar"); }
  }

  async function sendToWhatsApp() {
    if (!output) return;
    const text = output.text;
    // Try native share with image file (mobile / PWA)
    if (pkg.image_url && typeof navigator !== "undefined" && (navigator as any).canShare) {
      try {
        const resp = await fetch(pkg.image_url, { mode: "cors" });
        if (resp.ok) {
          const blob = await resp.blob();
          const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
          const file = new File([blob], `${pkg.slug}.${ext}`, { type: blob.type || "image/jpeg" });
          const shareData: any = { files: [file], text };
          if ((navigator as any).canShare(shareData)) {
            await (navigator as any).share(shareData);
            return;
          }
        }
      } catch {
        // fall through to wa.me
      }
    }
    // Fallback: open WhatsApp with the text only (image needs to be attached manually)
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.message("WhatsApp aberto", {
      description: "Texto copiado. Anexe a imagem do pacote manualmente se precisar.",
    });
  }


  async function downloadArt(kind: "feed" | "story") {
    if (!pkg.image_url) { toast.error("Cadastre a URL da imagem de capa do pacote antes de gerar a arte."); return; }
    setLoading(kind);
    try {
      const input = {
        slug: pkg.slug, destination: pkg.destination, origin: pkg.origin,
        going_date: pkg.going_date, return_date: pkg.return_date, nights: pkg.nights,
        price_per_person: Number(pkg.price_per_person), image_url: pkg.image_url,
        includes: pkg.includes ?? null, hotel_name: pkg.hotel_name, hotel_stars: pkg.hotel_stars,
        room_type: pkg.room_type ?? null, base_occupancy: pkg.base_occupancy ?? 2,
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
    <div className="group relative bg-white/[0.02] border border-white/5 hover:border-white/20 hover:bg-white/[0.04] p-4 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6 transition-all duration-300">
      {/* Thumbnail */}
      <div className="relative flex-shrink-0">
        {pkg.image_url ? (
          <img
            src={pkg.image_url}
            alt={pkg.title}
            className="w-full sm:w-[160px] h-[110px] object-cover rounded-xl shadow-2xl"
            loading="lazy"
          />
        ) : (
          <div className="w-full sm:w-[160px] h-[110px] rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/5 flex items-center justify-center text-3xl">
            {pkg.destination.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Título + preço */}
        <div className="flex justify-between items-start gap-3">
          <div className="space-y-1 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-foreground group-hover:text-brand-orange transition-colors leading-tight truncate">
              {pkg.title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 font-light flex flex-wrap items-center gap-1.5">
              <span>{pkg.destination}</span>
              {pkg.going_date && <>
                <span className="w-1 h-1 rounded-full bg-white/20"></span>
                <span>{dfmt(pkg.going_date)}{pkg.return_date ? ` a ${dfmt(pkg.return_date)}` : ""}</span>
              </>}
              {pkg.nights ? <>
                <span className="w-1 h-1 rounded-full bg-white/20"></span>
                <span>{pkg.nights} {pkg.nights === 1 ? "noite" : "noites"}</span>
              </> : null}
              {pkg.hotel_name ? <>
                <span className="w-1 h-1 rounded-full bg-white/20"></span>
                <span className="text-slate-300 font-medium truncate">{pkg.hotel_name}</span>
              </> : null}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">
              Total {pkg.base_occupancy ?? 2}p
            </p>
            <p className="text-xl sm:text-2xl font-bold text-foreground tracking-tighter tabular-nums">
              {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Dock unificado */}
        <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-tighter">Gerar:</span>
              <button
                type="button"
                title="Gerar legenda para WhatsApp"
                aria-label="Gerar legenda para WhatsApp"
                onClick={() => handleGenerate("whatsapp")}
                disabled={loading !== null}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all ring-1 ring-[#25D366]/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading === "whatsapp" ? <Loader2 className="w-4 h-4 animate-spin" /> : <WhatsAppIcon />}
              </button>
              <button
                type="button"
                title="Gerar legenda para Instagram"
                aria-label="Gerar legenda para Instagram"
                onClick={() => handleGenerate("instagram")}
                disabled={loading !== null}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#E1306C]/10 text-[#E1306C] hover:bg-[#E1306C] hover:text-white transition-all ring-1 ring-[#E1306C]/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading === "instagram" ? <Loader2 className="w-4 h-4 animate-spin" /> : <InstagramIcon />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-tighter">Download:</span>
              <button
                type="button"
                onClick={() => downloadArt("feed")}
                disabled={loading !== null}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 flex items-center gap-1.5 hover:bg-white/10 hover:text-brand-orange hover:border-brand-orange/40 transition-colors disabled:opacity-60"
              >
                {loading === "feed" ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageDown className="w-3 h-3" />}
                FEED 3:4
              </button>
              <button
                type="button"
                onClick={() => downloadArt("story")}
                disabled={loading !== null}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 flex items-center gap-1.5 hover:bg-white/10 hover:text-brand-orange hover:border-brand-orange/40 transition-colors disabled:opacity-60"
              >
                {loading === "story" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />}
                STORY 9:16
              </button>
            </div>
          </div>

          <a
            href={`/pacotes/${pkg.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl text-slate-500 hover:text-foreground hover:bg-white/10 transition-all"
            aria-label="Abrir pacote"
            title="Abrir pacote"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Output IA */}
        {output && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-brand-orange flex items-center gap-1.5">
                <Wand2 className="h-3 w-3" />
                Texto para {output.channel === "whatsapp" ? "WhatsApp" : "Instagram"}
              </div>
              <div className="flex items-center gap-2">
                {output.channel === "whatsapp" && (
                  <button
                    type="button"
                    onClick={sendToWhatsApp}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#25D366]/40 bg-[#25D366]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#25D366] hover:bg-[#25D366] hover:text-white transition-colors"
                    title="Enviar no WhatsApp (com imagem quando suportado)"
                  >
                    <Send className="h-3 w-3" /> Enviar
                  </button>
                )}
                <button
                  type="button"
                  onClick={copyText}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-brand-orange hover:text-brand-orange"
                >
                  <Copy className="h-3 w-3" /> Copiar
                </button>
              </div>

            </div>
            <textarea
              readOnly
              value={output.text}
              className="w-full min-h-[180px] rounded-lg border border-white/10 bg-black/40 p-2.5 text-[11px] font-mono text-slate-200 leading-relaxed"
            />
          </div>
        )}
      </div>
    </div>
  );
}
