import { useState } from "react";

/**
 * Logo da companhia aérea. Usa o CDN público de logos por IATA e, se a imagem
 * não existir, cai no bloco com a sigla (comportamento anterior).
 */
export function LogoCia({ iata, nome, size = 38 }: { iata?: string | null; nome?: string | null; size?: number }) {
  const code = (iata ?? "").trim().toUpperCase();
  const [falhou, setFalhou] = useState(false);

  if (!code || falhou) {
    return (
      <span className="airlogo" style={{ width: size, height: size }}>
        {code || "VA"}
      </span>
    );
  }

  return (
    <span className="airlogo img" style={{ width: size, height: size }}>
      <img
        src={`https://images.kiwi.com/airlines/64/${code}.png`}
        alt={nome ? `Logo ${nome}` : `Logo ${code}`}
        loading="lazy"
        onError={() => setFalhou(true)}
      />
    </span>
  );
}
