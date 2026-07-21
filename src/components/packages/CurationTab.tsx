import { useMemo, useState } from "react";
import { Copy, Loader2, Sparkles, ExternalLink, Wand2, Instagram, MessageCircle, ImageDown, Smartphone } from "lucide-react";
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
  // Campos usados pelo gerador de arte (Feed 3:4 e Story 9:16)
  image_url?: string | null;
  includes?: string[] | null;
  room_type?: string | null;
  tripadvisor_address?: string | null;
};

type Group = {
  key: string;
  title: string;
  reason: string;
  packages: Pkg[];
};

/**
 * Feriados prolongados (Brasil). Cada janela é uma faixa contínua onde a
 * data de ida do pacote deve cair. Cobre 2026-2028.
 */
const HOLIDAY_WINDOWS: Array<{ theme: string; from: string; to: string; label: string }> = [
  { theme: "natal", from: "2026-12-19", to: "2026-12-27", label: "Natal 2026" },
  { theme: "reveillon", from: "2026-12-27", to: "2027-01-04", label: "Réveillon 2026/27" },
  { theme: "carnaval", from: "2027-02-04", to: "2027-02-11", label: "Carnaval 2027" },
  { theme: "pascoa", from: "2027-03-24", to: "2027-03-29", label: "Páscoa 2027" },
  { theme: "natal", from: "2027-12-19", to: "2027-12-27", label: "Natal 2027" },
  { theme: "reveillon", from: "2027-12-27", to: "2028-01-04", label: "Réveillon 2027/28" },
  { theme: "carnaval", from: "2028-02-24", to: "2028-03-02", label: "Carnaval 2028" },
  { theme: "pascoa", from: "2028-04-12", to: "2028-04-17", label: "Páscoa 2028" },
  // Feriados prolongados (janela ±3 dias)
  { theme: "prolongado", from: "2026-04-18", to: "2026-04-25", label: "Feriado de Tiradentes" },
  { theme: "prolongado", from: "2026-06-01", to: "2026-06-07", label: "Corpus Christi" },
  { theme: "prolongado", from: "2026-09-04", to: "2026-09-09", label: "7 de Setembro" },
  { theme: "prolongado", from: "2026-10-09", to: "2026-10-13", label: "N. Sra. Aparecida" },
  { theme: "prolongado", from: "2026-10-30", to: "2026-11-04", label: "Finados" },
  { theme: "prolongado", from: "2026-11-13", to: "2026-11-17", label: "Proclamação da República" },
  { theme: "prolongado", from: "2027-04-19", to: "2027-04-25", label: "Feriado de Tiradentes 2027" },
  { theme: "prolongado", from: "2027-09-04", to: "2027-09-09", label: "7 de Setembro 2027" },
];

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
  const diff = d - Date.now();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export function CurationTab({ packages }: { packages: Pkg[] }) {
  const active = useMemo(() => (packages || []).filter((p) => p.is_active), [packages]);

  const groups = useMemo<Group[]>(() => {
    const list: Group[] = [];
    if (!active.length) return list;

    // 1. Melhores preços
    const cheapest = [...active]
      .sort((a, b) => totalPrice(a) - totalPrice(b))
      .slice(0, 5);
    if (cheapest.length) {
      list.push({
        key: "menor-preco",
        title: "Melhores preços do momento",
        reason: "Pacotes com menor valor total no cadastro ativo.",
        packages: cheapest,
      });
    }

    // 2. Datas próximas (próximos 60 dias)
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
        title: "Saídas nos próximos 60 dias",
        reason: "Embarques próximos — bom apelo de urgência.",
        packages: upcoming,
      });
    }

    // 3. Feriados temáticos
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
    const themeTitles: Record<string, string> = {
      natal: "Pacotes para o Natal",
      reveillon: "Pacotes para o Réveillon",
      carnaval: "Pacotes para o Carnaval",
      pascoa: "Pacotes para a Páscoa",
      prolongado: "Pacotes em feriados prolongados",
    };
    const themeReasons: Record<string, string> = {
      natal: "Datas alinhadas ao Natal — alta procura, ideal para divulgar.",
      reveillon: "Saídas na virada — bom para venda antecipada.",
      carnaval: "Saídas na semana do Carnaval — feriado longo.",
      pascoa: "Feriado de Páscoa com viagem inclusa.",
      prolongado: "Feriados nacionais prolongados — bom para escapadas curtas.",
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
      // Dedup por id, ordenar por preço
      const seen = new Set<string>();
      const unique = merged.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
      unique.sort((a, b) => totalPrice(a) - totalPrice(b));
      list.push({
        key: `feriado-${theme}`,
        title: themeTitles[theme],
        reason: `${themeReasons[theme]} ${labels.length ? `(${labels.join(", ")})` : ""}`.trim(),
        packages: unique.slice(0, 6),
      });
    }

    return list;
  }, [active]);

  if (!active.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhum pacote ativo para curar. Ative pacotes na aba anterior.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-brand-orange/30 bg-brand-orange/5 p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-brand-orange shrink-0 mt-0.5" />
        <div className="text-sm text-foreground">
          <div className="font-semibold">Curadoria automática</div>
          <div className="text-muted-foreground text-xs mt-1">
            A IA agrupa seus pacotes por menor preço, datas próximas e feriados
            (Natal, Réveillon, Carnaval, Páscoa e prolongados). Clique em <b>Gerar</b> para
            criar a mensagem pronta pro WhatsApp ou Instagram.
          </div>
        </div>
      </div>

      {groups.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum grupo destacado no momento. Cadastre pacotes com datas em feriados ou
          próximas dos próximos 60 dias.
        </div>
      )}

      {groups.map((g) => (
        <GroupCard key={g.key} group={g} />
      ))}
    </div>
  );
}

function GroupCard({ group }: { group: Group }) {
  const generateFn = useServerFn(generateCurationCopy);
  const [loading, setLoading] = useState<"whatsapp" | "instagram" | null>(null);
  const [output, setOutput] = useState<{ channel: "whatsapp" | "instagram"; text: string } | null>(null);

  async function handleGenerate(channel: "whatsapp" | "instagram") {
    setLoading(channel);
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      const res = await generateFn({
        data: {
          channel,
          groupTitle: group.title,
          groupReason: group.reason,
          packages: group.packages.map((p) => ({
            title: p.title,
            destination: p.destination,
            origin: p.origin,
            going_date: p.going_date,
            return_date: p.return_date,
            nights: p.nights,
            price_per_person: Number(p.price_per_person),
            base_occupancy: p.base_occupancy ?? 2,
            hotel_name: p.hotel_name,
            hotel_stars: p.hotel_stars,
            meal_plan: p.meal_plan,
            slug: p.slug,
          })),
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

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
        <div className="min-w-0">
          <h3 className="text-base font-black uppercase tracking-tight text-foreground">
            {group.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{group.reason}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleGenerate("whatsapp")}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#1fb457] disabled:opacity-60 text-white px-3 py-2 text-xs font-bold uppercase tracking-wider transition"
          >
            {loading === "whatsapp" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => handleGenerate("instagram")}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90 disabled:opacity-60 text-white px-3 py-2 text-xs font-bold uppercase tracking-wider transition"
          >
            {loading === "instagram" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Instagram className="h-3.5 w-3.5" />}
            Instagram
          </button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {group.packages.map((p) => {
          const total = totalPrice(p);
          const dfmt = (s: string | null) =>
            s ? new Date(String(s) + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
          return (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground truncate">{p.title}</div>
                <div className="text-muted-foreground mt-0.5">
                  {p.destination}
                  {p.going_date && <> · {dfmt(p.going_date)}{p.return_date ? ` a ${dfmt(p.return_date)}` : ""}</>}
                  {p.nights ? ` · ${p.nights}n` : ""}
                  {p.hotel_name ? ` · ${p.hotel_name}` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-muted-foreground uppercase">Total ({p.base_occupancy ?? 2}p)</div>
                <div className="font-black tabular-nums text-foreground">
                  {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
              <a
                href={`/pacotes/${p.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:text-brand-orange hover:border-brand-orange"
                aria-label="Abrir pacote"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        })}
      </div>

      {output && (
        <div className="border-t border-border bg-background/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-orange flex items-center gap-1.5">
              <Wand2 className="h-3 w-3" />
              Texto gerado para {output.channel === "whatsapp" ? "WhatsApp" : "Instagram"}
            </div>
            <button
              type="button"
              onClick={copyText}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:border-brand-orange hover:text-brand-orange"
            >
              <Copy className="h-3 w-3" /> Copiar
            </button>
          </div>
          <textarea
            readOnly
            value={output.text}
            className="w-full min-h-[220px] rounded-lg border border-border bg-background p-3 text-xs font-mono text-foreground leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}
