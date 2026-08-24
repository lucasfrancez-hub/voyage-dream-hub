import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { autocompleteLocalidadeCF } from "@/lib/comprefacil/localidades.functions";

type Props = {
  valor: string;
  onChange: (nome: string, cidadeId: number | null) => void;
  campo: "destino" | "saida";
  placeholder?: string;
};

/** Campo de cidade com autopreencher do catálogo CompreFácil (traz o Id certo). */
export function CidadeAutocompleteCF({ valor, onChange, campo, placeholder }: Props) {
  const sugerir = useServerFn(autocompleteLocalidadeCF);
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState(valor);
  const [debounced, setDebounced] = useState(valor);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setTermo(valor), [valor]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo), 250);
    return () => clearTimeout(t);
  }, [termo]);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const q = useQuery({
    queryKey: ["cf", "localidades", campo, debounced],
    queryFn: () => sugerir({ data: { termo: debounced, campo } }),
    enabled: aberto && debounced.trim().length >= 2,
    staleTime: 60_000,
  });

  const itens = q.data ?? [];

  return (
    <div className="relative" ref={box}>
      <Input
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
          onChange(e.target.value, null);
        }}
        onFocus={() => setAberto(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {aberto && debounced.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          {q.isFetching && itens.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando cidades…
            </div>
          )}
          {!q.isFetching && itens.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma cidade encontrada</div>
          )}
          {itens.map((c) => (
            <button
              key={`${c.nome}-${c.cidadeId ?? "s"}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setTermo(c.nome);
                onChange(c.nome, c.cidadeId);
                setAberto(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {c.nome}
              </span>
              <span className="text-xs text-muted-foreground">{c.total} pacotes</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
