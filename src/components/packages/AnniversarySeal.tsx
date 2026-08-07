/**
 * Selo "Promoções de Aniversário da VIA AIR" aplicado no canto superior
 * esquerdo das artes (feed, story e variantes de passeio/ingresso).
 * Fica ativo automaticamente até sexta-feira, 14/08/2026 (23:59 BRT).
 */
import seloAsset from "@/assets/selo-aniversario.png.asset.json";

/** Fim da campanha: sexta 14/08/2026 23:59:59 no horário de Brasília (UTC-3). */
export const SELO_ANIVERSARIO_ATE = new Date("2026-08-15T02:59:59Z");

export function seloAniversarioAtivo(now: Date = new Date()): boolean {
  return now.getTime() <= SELO_ANIVERSARIO_ATE.getTime();
}

export const SELO_ANIVERSARIO_CSS = `
.vsel-ani{position:absolute;top:18px;left:14px;z-index:5;pointer-events:none}
.vsel-ani img{display:block;width:100%;height:auto;filter:drop-shadow(0 10px 18px rgba(0,0,0,.55))}
`;

/** @param size largura do selo em px (coordenadas internas da arte) */
export function AnniversarySeal({ size = 190 }: { size?: number }) {
  if (!seloAniversarioAtivo()) return null;
  return (
    <div className="vsel-ani" style={{ width: size }}>
      <img src={seloAsset.url} alt="Promoções de aniversário da VIA AIR" crossOrigin="anonymous" />
    </div>
  );
}
