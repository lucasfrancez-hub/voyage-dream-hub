import { useEffect, useState } from "react";

// Converte ISO (yyyy-mm-dd) -> BR (dd/mm/yyyy)
function isoToBr(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Converte BR (dd/mm/yyyy) -> ISO (yyyy-mm-dd) só quando completo e válido
function brToIso(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return "";
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12) return "";
  if (d < 1 || d > 31) return "";
  if (y < 1900 || y > 2100) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function maskBr(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4, 8));
  return parts.join("/");
}

type Props = {
  value: string; // ISO yyyy-mm-dd
  onChange: (iso: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  autoComplete?: string;
};

/**
 * Campo de data manual no formato dd/mm/aaaa (sem calendário do sistema).
 * Persiste o valor em ISO (yyyy-mm-dd) para compatibilidade com o backend.
 */
export function DateBRInput({
  value,
  onChange,
  required,
  className,
  placeholder = "dd/mm/aaaa",
  id,
  name,
  autoComplete = "bday",
}: Props) {
  const [text, setText] = useState<string>(() => isoToBr(value));

  useEffect(() => {
    // Se a prop mudar externamente, sincroniza
    const next = isoToBr(value);
    if (next !== text && (next !== "" || !text.match(/\d/))) {
      setText(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete={autoComplete}
      pattern="\d{2}/\d{2}/\d{4}"
      maxLength={10}
      required={required}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const masked = maskBr(e.target.value);
        setText(masked);
        const iso = brToIso(masked);
        onChange(iso);
      }}
      className={className}
    />
  );
}

export default DateBRInput;
