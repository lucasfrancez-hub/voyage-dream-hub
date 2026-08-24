import { brl } from "@/lib/pacote-motor/mapear";

export type LinhaResumo = { rotulo: string; valor: string };

/** Resumo do pacote — bloco `.summary-card` do modelo aprovado. */
export function ResumoPacote({
  titulo = "Resumo do pacote",
  destino,
  periodo,
  pax,
  noites,
  linhas,
  total,
  moeda = "BRL",
  rodape,
  acao,
}: {
  titulo?: string;
  destino: string;
  periodo: string;
  pax: string;
  noites: string | null;
  linhas: LinhaResumo[];
  total: number;
  moeda?: string;
  rodape?: string;
  acao?: React.ReactNode;
}) {
  return (
    <aside className="summary-card">
      <p className="mini">{titulo}</p>
      <h3>{destino}</h3>
      <p className="installment">{[noites, pax, periodo].filter(Boolean).join(" · ")}</p>

      {linhas.map((l) => (
        <div key={l.rotulo} className="summary-row">
          <span>{l.rotulo}</span>
          <b>{l.valor}</b>
        </div>
      ))}

      <div className="summary-total">
        <small>Valor total do pacote</small>
        <strong>{brl(total, moeda)}</strong>
        {rodape ? <small>{rodape}</small> : null}
      </div>

      {acao}
    </aside>
  );
}
