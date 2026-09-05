/**
 * Memória curta de qual fornecedor emitiu cada oferta. SERVER-ONLY.
 *
 * A PassHub exige o campo `provider` na tarifação e recusa com erro quando ele
 * não bate com o token ("Provider ... not supported" / "Deserialization rate
 * token error"). A tela nem sempre tem esse dado, então guardamos o fornecedor
 * de cada rateToken na hora da busca e usamos como rede de proteção.
 */

const mapa = new Map<string, string>();
const LIMITE = 4000;

const chave = (token: string) => token.slice(0, 96);

export function registraProvedor(token: string, provedor: string) {
  if (!token || !provedor) return;
  if (mapa.size > LIMITE) mapa.clear();
  mapa.set(chave(token), provedor.toUpperCase());
}

export function provedorDoToken(token: string): string | null {
  return mapa.get(chave(token ?? "")) ?? null;
}

/** Fornecedores conhecidos, usados como última tentativa. */
export const PROVEDORES_CONHECIDOS = ["SAKURA", "PATRIA", "CVC"];
