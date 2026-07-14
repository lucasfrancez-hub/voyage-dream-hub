import { useMemo } from "react";
import { findAirline } from "@/lib/airlines";
import { cn } from "@/lib/utils";

type Props = {
  /** Airline reference (name or IATA) — used to derive the IATA prefix. */
  airline: string | null | undefined;
  /** Current flight number value (e.g. "LA 3331" or "3331"). */
  value: string | null | undefined;
  /** Called with the normalized value ("LA 3331" when airline is known, otherwise the raw digits/text). */
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Extract only the numeric/suffix portion of a flight number, stripping any leading airline code.
 * Examples: "LA 3331" -> "3331", "la3331" -> "3331", "3331" -> "3331", "AD 4720A" -> "4720A".
 */
function stripPrefix(raw: string): string {
  const s = raw.trim().toUpperCase();
  // Match optional airline code (letters+digits, 2-3 chars) + optional space, then the rest
  const m = s.match(/^[A-Z0-9]{2,3}\s*(.+)$/);
  if (m && /\d/.test(m[1])) return m[1].trim();
  // If input starts with a digit, return as-is
  return s.replace(/^\s+/, "");
}

export function FlightNumberInput({
  airline,
  value,
  onChange,
  className,
  placeholder,
  disabled,
}: Props) {
  const iata = useMemo(() => findAirline(airline)?.iata ?? "", [airline]);

  // What the user sees typing: only the suffix (without the airline prefix) when we know the airline.
  const displayed = useMemo(() => {
    const v = String(value ?? "");
    if (!iata) return v;
    return stripPrefix(v);
  }, [value, iata]);

  const handleChange = (raw: string) => {
    const suffix = stripPrefix(raw);
    if (!iata) {
      onChange(raw.toUpperCase());
      return;
    }
    onChange(suffix ? `${iata} ${suffix}` : "");
  };

  return (
    <div
      className={cn(
        "flex h-10 w-full items-center rounded-md border border-input bg-background text-sm shadow-xs transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {iata ? (
        <span className="flex h-full items-center rounded-l-md border-r border-input bg-muted px-2.5 font-semibold tabular-nums text-muted-foreground">
          {iata}
        </span>
      ) : null}
      <input
        type="text"
        value={displayed}
        disabled={disabled}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder ?? (iata ? "Ex.: 3331" : "Ex.: LA 3331")}
        className="h-full w-full flex-1 bg-transparent px-3 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  );
}
