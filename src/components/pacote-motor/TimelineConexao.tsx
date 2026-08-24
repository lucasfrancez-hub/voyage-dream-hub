import { hora } from "@/lib/pacote-motor/mapear";
import type { PassHubVoo } from "@/lib/passhub/types";

/** Timeline vertical: cada trecho e cada conexão do voo, com os dados reais do fornecedor. */
export function TimelineConexao({ titulo, voo }: { titulo: string; voo: PassHubVoo }) {
  const conexoes = voo.conexoes ?? [];
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <p className="mb-3 text-xs font-bold text-foreground/80">{titulo}</p>

      <Trecho
        hora={hora(voo.partida)}
        local={voo.origem}
        titulo={`${voo.companhia || voo.companhiaIata} ${voo.numeroVoo}`.trim()}
        detalhe={[
          `${voo.origem} → ${voo.destino}`,
          voo.familiaTarifaria ? `Tarifa ${voo.familiaTarifaria}` : null,
          voo.classe ? `Classe ${voo.classe}` : null,
          voo.operadoPor ? `Operado por ${voo.operadoPor}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {conexoes.map((c, i) => (
        <div key={`${c.aeroporto}-${i}`} className="space-y-2">
          <div className="ml-0 rounded-lg border border-dashed border-brand-blue/40 bg-brand-blue/5 px-3 py-2 text-[11px] font-semibold text-brand-blue sm:ml-20">
            Conexão em {c.aeroporto} · {c.duracao} de espera
            {c.mudancaAeroporto ? " · troca de aeroporto" : ""}
          </div>
          <Trecho hora={hora(c.saida)} local={c.aeroporto} titulo={`Embarque em ${c.aeroporto}`} detalhe={`Chegada ${hora(c.chegada)}`} />
        </div>
      ))}

      <Trecho
        hora={hora(voo.chegada)}
        local={voo.destino}
        titulo={`Chegada em ${voo.destino}`}
        detalhe={[voo.duracao ? `Duração total ${voo.duracao}` : null, voo.bagagemDespachada ? `${voo.bagagemDespachadaQtd || 1} bagagem despachada` : voo.bagagemMao ? "Bagagem de mão" : null]
          .filter(Boolean)
          .join(" · ")}
        ultimo
      />
    </div>
  );
}

function Trecho({
  hora: h,
  local,
  titulo,
  detalhe,
  ultimo,
}: {
  hora: string;
  local: string;
  titulo: string;
  detalhe: string;
  ultimo?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr] gap-2 sm:grid-cols-[72px_14px_1fr]">
      <div className="text-xs font-bold text-foreground">
        {h}
        <small className="block text-[10px] font-semibold text-muted-foreground">{local}</small>
      </div>
      <div className="relative hidden h-11 sm:block">
        {!ultimo && <span className="absolute left-[5px] top-0 bottom-0 w-0.5 bg-border" />}
        <span className="absolute left-0 top-1 h-3 w-3 rounded-full bg-brand-blue" />
      </div>
      <div className="mb-2 rounded-lg border border-border/60 bg-card px-3 py-2">
        <b className="block text-xs">{titulo}</b>
        {detalhe ? <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">{detalhe}</span> : null}
      </div>
    </div>
  );
}
