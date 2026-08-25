import { Backpack, Briefcase, Luggage, X } from "lucide-react";
import type { PassHubVoo } from "@/lib/passhub/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  mostrarTexto = false,
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
    <TooltipProvider delayDuration={150}>
      <div className="flight-baggage">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`bag-icon${temMochila ? " on" : " off"}`}>
              <Backpack size={tamanho} />
              {!temMochila && <X size={cruz} className="bag-x" />}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Item pessoal (mochila)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`bag-icon${temMao ? " on" : " off"}`}>
              <Briefcase size={tamanho} />
              {!temMao && <X size={cruz} className="bag-x" />}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Bagagem de mão (10kg)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`bag-icon${temDespachada ? " on" : " off"}`}>
              <Luggage size={tamanho} />
              {!temDespachada && <X size={cruz} className="bag-x" />}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>
              {temDespachada
                ? `${qtdDespachada}x ${peso}kg despachada`
                : `Sem bagagem de ${peso}kg`}
            </p>
          </TooltipContent>
        </Tooltip>

        {mostrarTexto && <small className="bag-label">{texto}</small>}
      </div>
    </TooltipProvider>
  );
}
