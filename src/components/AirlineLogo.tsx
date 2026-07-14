import { airlineLogo, findAirline } from "@/lib/airlines";
import { cn } from "@/lib/utils";

type Props = {
  /** Airline IATA code or name (e.g. "AA", "American Airlines"). */
  airline: string | null | undefined;
  /** Pixel size of the square badge (default 32). */
  size?: number;
  className?: string;
  /** If true, hide badge instead of showing initials fallback. */
  hideIfUnknown?: boolean;
};

/**
 * Square badge with a soft gray background, sized so the transparent-PNG logo
 * always sits centered with breathing room. Used in pedidos, pacotes, vouchers.
 */
export function AirlineLogo({ airline, size = 32, className, hideIfUnknown }: Props) {
  const found = findAirline(airline);
  const url = found?.logo ?? airlineLogo(airline);
  const label = found?.name ?? airline ?? "";

  if (!url) {
    if (hideIfUnknown) return null;
    // Fallback: initials on the same gray square, so cards don't shift.
    const initials = (airline ?? "?")
      .replace(/[^a-zA-Z ]/g, "")
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 text-neutral-500 font-semibold shrink-0",
          className,
        )}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
        aria-label={label || "Companhia aérea"}
        title={label || undefined}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 shrink-0 overflow-hidden",
        className,
      )}
      style={{ width: size, height: size, padding: Math.max(3, Math.round(size * 0.14)) }}
      title={label}
    >
      <img
        src={url}
        alt={label}
        className="max-h-full max-w-full object-contain"
        loading="lazy"
      />
    </span>
  );
}
