import { Briefcase, Luggage, X } from "lucide-react";
import type { PassHubVoo } from "@/lib/passhub/types";

export function IconeBagagem({
  voo,
  tamanho = 16,
  mostrarTexto = true,
}: {
  voo: PassHubVoo;
  tamanho?: number;
  mostrarTexto?: boolean;
}) {
  const temMao = voo.bagagemMao;
  const temDespachada = voo.bagagemDespachada;
  const qtdDespachada = voo.bagagemDespachadaQtd || 1;

  const texto = temDespachada
    ? `${qtdDespachada} despachada${qtdDespachada > 1 ? "s" : ""}`
    : temMao
      ? "Bagagem de mão"
      : "Sem bagagem";

  return (
    <div className="flight-baggage" title={texto}>
      <span className={`bag-icon${temMao ? " on" : " off"}`}>
        <Briefcase size={tamanho} />
        {!temMao && <X size={Math.max(8, Math.round(tamanho * 0.55))} className="bag-x" />}
      </span>
      <span className={`bag-icon${temDespachada ? " on" : " off"}`}>
        <Luggage size={tamanho} />
        {!temDespachada && <X size={Math.max(8, Math.round(tamanho * 0.55))} className="bag-x" />}
      </span>
      {mostrarTexto && <small className="bag-label">{texto}</small>}
    </div>
  );
}
