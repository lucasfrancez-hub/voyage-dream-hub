/**
 * Editor da comissão extra (RAV por fora) da reserva.
 * O valor é interno da agência: soma ao total da reserva e aparece no plano de viagem.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { passhubComissaoExtra } from "@/lib/passhub/passhub.functions";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export function ComissaoExtraEditor({
  idPassagem,
  localizador,
  valor,
  observacao,
  onSalvo,
}: {
  idPassagem: number;
  localizador?: string;
  valor: number;
  observacao?: string;
  onSalvo: (valor: number, observacao: string) => void;
}) {
  const salvarFn = useServerFn(passhubComissaoExtra);
  const [editando, setEditando] = useState(false);
  const [campo, setCampo] = useState(valor ? String(valor).replace(".", ",") : "");
  const [obs, setObs] = useState(observacao ?? "");

  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          id: idPassagem,
          localizador: localizador || undefined,
          comissaoExtra: Number(campo.replace(/\./g, "").replace(",", ".")) || 0,
          observacao: obs || undefined,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.erro);
      onSalvo(res.comissaoExtra, res.observacao);
      setEditando(false);
      toast.success("Comissão extra atualizada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  if (!editando) {
    return (
      <div className="flex items-center justify-between border-b border-dotted border-white/10 py-2 text-[13px]">
        <span className="cons-muted">Comissão extra {observacao ? `· ${observacao}` : ""}</span>
        <span className="flex items-center gap-2">
          <b>{brl(valor || 0)}</b>
          <button
            type="button"
            className="cons-btn !px-2 !py-1"
            onClick={() => setEditando(true)}
            title="Editar comissão"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-b border-dotted border-white/10 py-2">
      <div className="cons-lab">Editar comissão extra</div>
      <input
        className="cons-field w-full"
        inputMode="decimal"
        placeholder="0,00"
        value={campo}
        autoFocus
        onChange={(e) => setCampo(e.target.value)}
      />
      <input
        className="cons-field w-full"
        placeholder="Observação interna (opcional)"
        value={obs}
        onChange={(e) => setObs(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="cons-btn cons-btn-primary"
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending}
        >
          {salvar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Salvar
        </button>
        <button type="button" className="cons-btn" onClick={() => setEditando(false)}>
          <X className="h-4 w-4" /> Cancelar
        </button>
      </div>
    </div>
  );
}
