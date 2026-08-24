import { useState } from "react";
import { brl } from "@/lib/pacote-motor/mapear";
import { grupoServico } from "@/lib/pacote-motor/categorias";
import { Lightbox } from "@/components/pacote-motor/Lightbox";
import type { ServicoDisponivel } from "@/lib/comprefacil/servicos.server";

/** Divide o texto da operadora em blocos legíveis (perguntas/bullets viram parágrafos). */
function blocos(texto: string): string[] {
  return texto
    .replace(/\s*•\s*/g, "\n• ")
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Detalhes do serviço adicional: capa, descrição completa, o que saber e política.
 * Mantém o texto original da operadora, só organizado.
 */
export function ServicoModal({
  servico,
  selecionado,
  onAlternar,
  onFechar,
}: {
  servico: ServicoDisponivel;
  selecionado: boolean;
  onAlternar: (s: ServicoDisponivel) => void;
  onFechar: () => void;
}) {
  const fotos = (servico.imagens?.length ? servico.imagens : servico.imagem ? [servico.imagem] : []).filter(Boolean);
  const [foto, setFoto] = useState<number | null>(null);
  const grupo = grupoServico(servico);
  const seguro = /seguro/i.test(grupo) || /seguro/i.test(servico.titulo);
  const partes = servico.descricao ? blocos(servico.descricao) : [];

  return (
    <div
      className="mkt-modal svc-modal"
      role="dialog"
      aria-modal="true"
      aria-label={servico.titulo}
      onClick={onFechar}
    >
      <div className="mkt-modal-card svc-card" onClick={(e) => e.stopPropagation()}>
        <div className={`svc-hero${fotos.length ? "" : " sem-foto"}`}>
          {fotos[0] ? (
            <img src={fotos[0]} alt={servico.titulo} loading="lazy" onClick={() => setFoto(0)} />
          ) : (
            <div className="svc-hero-ph" aria-hidden="true">
              <span>{seguro ? "🛡️" : /transfer/i.test(grupo) ? "🚐" : /ingresso/i.test(grupo) ? "🎟️" : "🌤️"}</span>
            </div>
          )}
          <button type="button" className="mkt-modal-close svc-close" onClick={onFechar} aria-label="Fechar">
            ✕
          </button>
          <div className="svc-hero-txt">
            <span className="svc-hero-cat">{grupo}</span>
            <h3>{servico.titulo}</h3>
            {servico.fornecedor ? <p>Operado por {servico.fornecedor}</p> : null}
          </div>
        </div>

        <div className="svc-body">
          <div className="svc-col">
            {partes.length ? (
              <>
                <h4>Sobre o serviço</h4>
                {partes.map((p, i) => (
                  <p key={i} className={p.startsWith("•") ? "svc-bullet" : undefined}>
                    {p}
                  </p>
                ))}
              </>
            ) : (
              <p>Detalhes completos deste serviço serão confirmados pela nossa equipe.</p>
            )}

            {servico.politica ? (
              <div className="svc-pol">
                <h4>Política de cancelamento</h4>
                <p>{servico.politica}</p>
              </div>
            ) : null}

            {fotos.length > 1 ? (
              <>
                <h4 style={{ marginTop: 16 }}>Fotos ({fotos.length})</h4>
                <div className="hotel-gallery">
                  {fotos.map((f, i) => (
                    <figure key={`${f}-${i}`}>
                      <img
                        src={f}
                        alt={`Foto ${i + 1} de ${servico.titulo}`}
                        loading="lazy"
                        style={{ cursor: "zoom-in" }}
                        onClick={() => setFoto(i)}
                      />
                    </figure>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <aside className="svc-aside">
            {servico.informacoes.length ? (
              <ul className="svc-facts">
                {servico.informacoes.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            ) : null}
            <span className="svc-aside-label">Valor para a sua viagem</span>
            <div className="svc-aside-val">{servico.valor != null ? brl(servico.valor, servico.moeda) : "Sob consulta"}</div>
            <button
              type="button"
              className={selecionado ? "svc-aside-btn ghost" : "svc-aside-btn"}
              disabled={servico.valor == null}
              onClick={() => {
                onAlternar(servico);
                onFechar();
              }}
            >
              {selecionado ? "Remover do pacote" : "Adicionar ao pacote"}
            </button>
            <small>Valor já somado ao total do pacote quando selecionado.</small>
          </aside>
        </div>
      </div>

      {foto !== null ? (
        <Lightbox fotos={fotos} indice={foto} titulo={servico.titulo} onIndice={setFoto} onFechar={() => setFoto(null)} />
      ) : null}
    </div>
  );
}
