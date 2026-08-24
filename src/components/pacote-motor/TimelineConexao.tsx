import { hora } from "@/lib/pacote-motor/mapear";
import type { PassHubVoo } from "@/lib/passhub/types";

/**
 * Detalhes da conexão — bloco `.connection-box` do modelo aprovado.
 * Mostra os segmentos reais devolvidos pelo fornecedor.
 */
export function TimelineConexao({ titulo, voo }: { titulo: string; voo: PassHubVoo }) {
  const conexoes = voo.conexoes ?? [];
  const cia = `${voo.companhia || voo.companhiaIata} ${voo.numeroVoo}`.trim();

  return (
    <>
      <p className="conn-title">{titulo}</p>

      <div className="conn-step">
        <div className="conn-time">
          {hora(voo.partida)}
          <small>{voo.origem}</small>
        </div>
        <div className="conn-dot" />
        <div className="conn-box">
          <b>
            {cia} · {voo.origem} → {conexoes[0]?.aeroporto ?? voo.destino}
          </b>
          <span>
            {[
              `Saída ${hora(voo.partida)}`,
              conexoes[0] ? `Chegada ${hora(conexoes[0].chegada)}` : `Chegada ${hora(voo.chegada)}`,
              voo.familiaTarifaria ? `Tarifa ${voo.familiaTarifaria}` : null,
              voo.classe ? `Classe ${voo.classe}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      </div>

      {conexoes.map((c, i) => (
        <div key={`${c.aeroporto}-${i}`}>
          <div className="layover">
            Conexão em {c.aeroporto} · {c.duracao} de espera
            {c.mudancaAeroporto ? " · troca de aeroporto" : ""}
          </div>
          <div className="conn-step">
            <div className="conn-time">
              {hora(c.saida)}
              <small>{c.aeroporto}</small>
            </div>
            <div className="conn-dot" />
            <div className="conn-box">
              <b>
                {cia} · {c.aeroporto} → {conexoes[i + 1]?.aeroporto ?? voo.destino}
              </b>
              <span>
                Saída {hora(c.saida)} · Chegada{" "}
                {conexoes[i + 1] ? hora(conexoes[i + 1].chegada) : hora(voo.chegada)}
                {voo.bagagemDespachada
                  ? ` · ${voo.bagagemDespachadaQtd || 1} bagagem despachada`
                  : voo.bagagemMao
                    ? " · bagagem de mão"
                    : ""}
              </span>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
