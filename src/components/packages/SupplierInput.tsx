import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Campo de fornecedor com autopreencher a partir dos fornecedores já usados. */
export function SupplierInput({
  value,
  onChange,
  className = "",
  placeholder = "Ex.: GTA, Civitatis, Ingresso Fácil…",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const { data: suppliers = [] } = useQuery({
    queryKey: ["supplier-names"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("packages")
        .select("supplier_name")
        .not("supplier_name", "is", null)
        .limit(500);
      const set = new Set(
        (data ?? [])
          .map((r: any) => String(r.supplier_name ?? "").trim())
          .filter(Boolean),
      );
      return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
    },
  });

  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm normal-case outline-none focus:border-brand-orange ${className}`}
      />
      <datalist id={listId}>
        {suppliers.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
