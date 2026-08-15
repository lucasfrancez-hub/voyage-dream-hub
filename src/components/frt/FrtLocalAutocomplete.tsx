import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { frtAutocomplete, selecionarLocalFrt } from "@/lib/frt/frt.functions";

export type FrtLocalSelecionado = {
  value: string;
  label: string;
  /** Campo interno j_idt#### gerado pela FRT no itemSelect. */
  interno: string | null;
};

export type FrtAutocompleteDiag = {
  termo: string;
  componente: "origem" | "destino";
  /** Nome da server function realmente chamada — precisa ser sempre frtAutocomplete. */
  serverFn: string;
  source: string;
  disparado: boolean;
  status: number;
  bytes: number;
  updates: { id: string; bytes: number }[];
  dataItemValue: number;
  amostra: string | null;
  opcoes: { value: string; label: string }[];
  erro?: string;
  em: string;
};


type Props = {
  id: string;
  rotulo: string;
  componente: "origem" | "destino";
  termo: string;
  onTermoChange: (v: string) => void;
  selecionado: FrtLocalSelecionado | null;
  onSelecionar: (s: FrtLocalSelecionado | null) => void;
  onDiagnostico?: (d: FrtAutocompleteDiag) => void;
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
  onDiagnostico,
}: Props) {
  const sugerir = useServerFn(sugestoesLocalFrt);
  const selecionar = useServerFn(selecionarLocalFrt);
  const [opcoes, setOpcoes] = useState<{ value: string; label: string }[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [semOpcoes, setSemOpcoes] = useState(false);
  const pedidoRef = useRef(0);

  useEffect(() => {
    const t = termo.trim();
    if (selecionado || t.length < 3) {
      setOpcoes([]);
      setSemOpcoes(false);
      setAberto(false);
      return;
    }
    const meu = ++pedidoRef.current;
    const timer = setTimeout(async () => {
      setBuscando(true);
      onDiagnostico?.({
        termo: t,
        componente,
        source: "—",
        disparado: true,
        status: 0,
        bytes: 0,
        updates: [],
        dataItemValue: 0,
        amostra: null,
        opcoes: [],
        em: new Date().toISOString(),
      });
      try {
        const r = await sugerir({ data: { componente, termo: t } });
        if (pedidoRef.current !== meu) return;
        setOpcoes(r.opcoes);
        setSemOpcoes(r.opcoes.length === 0);
        setAberto(true);
        onDiagnostico?.({ ...r.diagnostico, opcoes: r.opcoes.slice(0, 5) });
      } catch (e) {
        if (pedidoRef.current !== meu) return;
        setOpcoes([]);
        setSemOpcoes(true);
        onDiagnostico?.({
          termo: t,
          componente,
          source: "—",
          disparado: true,
          status: 0,
          bytes: 0,
          updates: [],
          dataItemValue: 0,
          amostra: null,
          opcoes: [],
          erro: (e as Error).message,
          em: new Date().toISOString(),
        });
        toast.error((e as Error).message);
      } finally {
        if (pedidoRef.current === meu) setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [termo, componente, selecionado, sugerir, onDiagnostico]);

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
    <div className={cn("relative space-y-1.5", aberto && "z-50")}>
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
          onFocus={() => (opcoes.length > 0 || semOpcoes) && setAberto(true)}
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

      {aberto && (opcoes.length > 0 || semOpcoes) && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {opcoes.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              A FRT não devolveu opções para este termo
            </li>
          ) : (
            opcoes.map((op) => (
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
            ))
          )}
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
