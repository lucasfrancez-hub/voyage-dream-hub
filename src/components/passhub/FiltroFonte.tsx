/** Filtro de origem das reservas/bilhetes: consolidadora x pedidos. */
import { Building2, ShoppingBag } from "lucide-react";

export type FonteReserva = "todas" | "consolidadora" | "pedidos";

export function BadgeFonte({ tipo }: { tipo: "consolidadora" | "pedidos" }) {
  const consolidadora = tipo === "consolidadora";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
      style={{
        background: consolidadora ? "rgba(56,189,248,.14)" : "rgba(242,107,31,.16)",
        color: consolidadora ? "#7dd3fc" : "#ffb27a",
        border: `1px solid ${consolidadora ? "rgba(56,189,248,.3)" : "rgba(242,107,31,.35)"}`,
      }}
    >
      {consolidadora ? <Building2 className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
      {consolidadora ? "Consolidadora" : "Pedido"}
    </span>
  );
}

export function FiltroFonte({
  valor,
  onChange,
  contagens,
}: {
  valor: FonteReserva;
  onChange: (v: FonteReserva) => void;
  contagens: { consolidadora: number; pedidos: number };
}) {
  const opcoes: { id: FonteReserva; label: string; qtd: number }[] = [
    { id: "todas", label: "Todas", qtd: contagens.consolidadora + contagens.pedidos },
    { id: "consolidadora", label: "Consolidadora", qtd: contagens.consolidadora },
    { id: "pedidos", label: "Pedidos", qtd: contagens.pedidos },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="cons-lab">Origem</span>
      {opcoes.map((o) => {
        const ativo = valor === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="rounded-full px-3.5 py-1.5 text-[12px] font-bold transition"
            style={{
              background: ativo ? "rgba(242,107,31,.18)" : "rgba(255,255,255,.04)",
              color: ativo ? "#ffb27a" : "rgba(255,255,255,.62)",
              border: `1px solid ${ativo ? "rgba(242,107,31,.4)" : "rgba(255,255,255,.08)"}`,
            }}
          >
            {o.label}
            <span className="ml-1.5 opacity-70">{o.qtd}</span>
          </button>
        );
      })}
    </div>
  );
}
