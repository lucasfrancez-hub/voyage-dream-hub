import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { selecionarLocalFrt, sugestoesLocalFrt } from "@/lib/frt/frt.functions";

export type FrtLocalSelecionado = {
  value: string;
  label: string;
  /** Campo interno j_idt#### gerado pela FRT no itemSelect. */
  interno: string | null;
};

type Props = {
  id: string;
  rotulo: string;
  componente: "origem" | "destino";
  termo: string;
  onTermoChange: (v: string) => void;
  selecionado: FrtLocalSelecionado | null;
  onSelecionar: (s: FrtLocalSelecionado | null) => void;
};

/**
 * Campo de origem/destino ligado ao autocomplete real da FRT:
 * digita 3+ caracteres -> query PrimeFaces -> lista com data-item-value
 * -> ao escolher, o backend executa o itemSelect e devolve o j_idt####.
 */
export function FrtLocalAutocomplete({
  id,
  rotulo,
  componente,
  termo,
  onTermoChange,
  selecionado,
  onSelecionar,
}: Props) {
  const sugerir = useServerFn(sugestoesLocalFrt);
  const selecionar = useServerFn(selecionarLocalFrt);
  const [opcoes, setOpcoes] = useState<{ value: string; label: string }[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const pedidoRef = useRef(0);

  useEffect(() => {
    const t = termo.trim();
    if (selecionado || t.length < 3) {
      setOpcoes([]);
      return;
    }
    const meu = ++pedidoRef.current;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await sugerir({ data: { componente, termo: t } });
        if (pedidoRef.current !== meu) return;
        setOpcoes(r.opcoes);
        setAberto(true);
      } catch (e) {
        if (pedidoRef.current === meu) toast.error((e as Error).message);
      } finally {
        if (pedidoRef.current === meu) setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [termo, componente, selecionado, sugerir]);

  const escolher = async (op: { value: string; label: string }) => {
    setAberto(false);
    setConfirmando(true);
    try {
      const r = await selecionar({
        data: { componente, termo: termo.trim(), value: op.value, label: op.label },
      });
      onTermoChange(r.label);
      onSelecionar({ value: r.value, label: r.label, interno: r.interno });
      if (!r.ok) toast.warning("A FRT não devolveu o campo interno para esta seleção");
    } catch (e) {
      onSelecionar(null);
      toast.error((e as Error).message);
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <div className="relative space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="relative">
        <Input
          id={id}
          autoComplete="off"
          value={termo}
          placeholder="Digite 3+ letras (ex.: MGF)"
          onChange={(e) => {
            onTermoChange(e.target.value);
            if (selecionado) onSelecionar(null);
          }}
          onFocus={() => opcoes.length > 0 && setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          className={cn(selecionado && "border-primary/60")}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
          {buscando || confirmando ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : selecionado ? (
            <Check className="h-4 w-4 text-primary" />
          ) : null}
        </span>
      </div>

      {aberto && opcoes.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {opcoes.map((op) => (
            <li key={op.value}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(op)}
              >
                {op.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        {selecionado
          ? `Selecionado na FRT${selecionado.interno ? ` · campo ${selecionado.interno}` : ""}`
          : "Escolha uma opção da lista da FRT para liberar a consulta"}
      </p>
    </div>
  );
}
