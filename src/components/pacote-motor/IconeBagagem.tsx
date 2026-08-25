import { Backpack, Briefcase, Luggage, X } from "lucide-react";
import type { PassHubVoo } from "@/lib/passhub/types";

/**
 * Ícones de bagagem do voo.
 *
 * Os dados vêm do retorno da operadora (FRT/CompreFácil), no seguimento aéreo:
 * `Mochila` (item pessoal), `BagagemDeBordo` (mão, 10kg),
 * `BagagemQuantidade` + `BagagemPeso` (despachada, normalmente 23kg).
 * Quando não incluída, o ícone fica apagado com um "x".
 */
export function IconeBagagem({
  voo,
  tamanho = 16,
  mostrarTexto = true,
}: {
  voo: PassHubVoo;
  tamanho?: number;
  mostrarTexto?: boolean;
}) {
  const temMochila = voo.mochila !== false;
  const temMao = voo.bagagemMao;
  const temDespachada = voo.bagagemDespachada;
  const qtdDespachada = voo.bagagemDespachadaQtd || 1;
  const peso = voo.bagagemPeso && voo.bagagemPeso > 0 ? voo.bagagemPeso : 23;

  const texto = temDespachada
    ? `${qtdDespachada}x ${peso}kg despachada${qtdDespachada > 1 ? "s" : ""}`
    : temMao
      ? "Só bagagem de mão"
      : temMochila
        ? "Só item pessoal"
        : "Sem bagagem";

  const cruz = Math.max(8, Math.round(tamanho * 0.55));

  return (
    <div className="flight-baggage" title={texto}>
      <span
        className={`bag-icon${temMochila ? " on" : " off"}`}
        title="Item pessoal (mochila)"
      >
        <Backpack size={tamanho} />
        {!temMochila && <X size={cruz} className="bag-x" />}
      </span>
      <span className={`bag-icon${temMao ? " on" : " off"}`} title="Bagagem de mão (10kg)">
        <Briefcase size={tamanho} />
        {!temMao && <X size={cruz} className="bag-x" />}
      </span>
      <span
        className={`bag-icon${temDespachada ? " on" : " off"}`}
        title={temDespachada ? `${qtdDespachada}x ${peso}kg despachada` : `Sem bagagem de ${peso}kg`}
      >
        <Luggage size={tamanho} />
        {!temDespachada && <X size={cruz} className="bag-x" />}
      </span>
      {mostrarTexto && <small className="bag-label">{texto}</small>}
    </div>
  );
}
