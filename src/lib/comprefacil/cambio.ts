/**
 * Conversão de moeda dos retornos da CompreFácil.
 *
 * Regra de negócio: na pesquisa, se o valor vier em moeda estrangeira (USD, EUR
 * etc.) usamos o câmbio que a própria operadora devolve no payload (`Taxa`) para
 * converter em reais. Se já vier em BRL, não convertemos nada.
 */

/** Lê a sigla de uma moeda em qualquer formato que a operadora devolva. */
export function sigla(m: unknown): string {
  if (!m) return "";
  if (typeof m === "string") return m.trim().toUpperCase();
  const o = m as any;
  return String(o?.Sigla ?? o?.Codigo ?? o?.Nome ?? "").trim().toUpperCase();
}

/** true quando a moeda é (ou é assumida como) real. */
export function ehReal(m: unknown, idMoeda?: unknown): boolean {
  const s = sigla(m);
  if (s) return s === "BRL" || s === "R$" || s === "REAL";
  const id = Number(idMoeda);
  return !Number.isFinite(id) || id === 1; // 1 = BRL na CompreFácil
}

/** Primeiro número finito e positivo da lista, senão 0. */
export function num(...v: unknown[]): number {
  for (const x of v) {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export type ContextoCambio = {
  /** moeda do valor bruto (MoedaNet) */
  moedaNet?: unknown;
  moedaNetId?: unknown;
  /** moeda de exibição (MoedaListagem) — normalmente BRL */
  moedaListagem?: unknown;
  moedaListagemId?: unknown;
  /** câmbio do dia devolvido pela operadora */
  taxa?: unknown;
};

/** Contexto de câmbio a partir de um nó cru da CompreFácil. */
export function contexto(no: any): ContextoCambio {
  return {
    moedaNet: no?.MoedaNet ?? no?.MoedaNetSigla,
    moedaNetId: no?.MoedaNetId,
    moedaListagem: no?.MoedaListagem ?? no?.MoedaListagemSigla,
    moedaListagemId: no?.MoedaListagemId,
    taxa: no?.Taxa ?? no?.TaxaCambio ?? no?.Cambio,
  };
}

/**
 * Converte um valor bruto para BRL usando o câmbio do payload.
 * Valor já em real volta intacto.
 */
export function paraBRL(valor: number, ctx: ContextoCambio): number {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  const netEhReal = ehReal(ctx.moedaNet, ctx.moedaNetId);
  const listagemEhReal = ehReal(ctx.moedaListagem, ctx.moedaListagemId);
  if (netEhReal || !listagemEhReal) return arred(valor);
  const cambio = Number(ctx.taxa);
  if (!Number.isFinite(cambio) || cambio <= 0) return arred(valor);
  return arred(valor * cambio);
}

/**
 * Valor em BRL de um nó: prefere os campos "Listagem" (que a operadora já
 * devolve convertidos) e, na falta deles, converte o bruto pelo câmbio.
 */
export function valorBRL(
  no: any,
  campos: { listagem?: unknown[]; bruto?: unknown[] },
  ctx: ContextoCambio = contexto(no),
): number {
  const jaEmReal = num(...(campos.listagem ?? []));
  if (jaEmReal > 0) return arred(jaEmReal);
  return paraBRL(num(...(campos.bruto ?? [])), ctx);
}

function arred(n: number) {
  return Number(n.toFixed(2));
}
