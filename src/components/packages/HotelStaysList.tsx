import { BedDouble, CalendarDays, MapPin, Utensils } from "lucide-react";

export type HotelStay = {
  hotel_name: string;
  room_type?: string | null;
  room_category?: string | null;
  bed_type?: string | null;
  meal_plan?: string | null;
  checkin?: string | null;
  checkout?: string | null;
  nights?: number | null;
  address?: string | null;
  photo?: string | null;
};

export function normalizeStays(value: unknown): HotelStay[] {
  if (!Array.isArray(value)) return [];
  return (value as any[]).filter((s) => s && typeof s === "object" && String(s.hotel_name ?? "").trim());
}

const dataBr = (v?: string | null) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");

/**
 * Roteiro com mais de uma hospedagem: cada estadia é sequencial
 * (ex.: 2 noites em Salvador, depois 2 noites em Morro de São Paulo).
 */
export function HotelStaysList({
  stays,
  compact = false,
}: {
  stays: HotelStay[];
  compact?: boolean;
}) {
  if (!stays?.length) return null;

  return (
    <ol className="space-y-2">
      {stays.map((s, i) => (
        <li
          key={`${s.hotel_name}-${i}`}
          className="flex gap-3 rounded-xl border border-border bg-card p-2.5"
        >
          {s.photo ? (
            <img
              src={s.photo}
              alt={s.hotel_name}
              loading="lazy"
              className="h-14 w-16 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-14 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
              <BedDouble className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-orange/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-orange">
                {i + 1}ª hospedagem
              </span>
              {!!s.nights && (
                <span className="text-[11px] text-muted-foreground">
                  {s.nights} {s.nights === 1 ? "noite" : "noites"}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold">{s.hotel_name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {[s.room_type, s.bed_type].filter(Boolean).join(" · ") || "—"}
            </div>
            {!compact && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {(s.checkin || s.checkout) && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {dataBr(s.checkin)}
                    {s.checkout ? ` → ${dataBr(s.checkout)}` : ""}
                  </span>
                )}
                {s.meal_plan && (
                  <span className="inline-flex items-center gap-1">
                    <Utensils className="h-3 w-3" />
                    {s.meal_plan}
                  </span>
                )}
                {s.address && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{s.address}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default HotelStaysList;
