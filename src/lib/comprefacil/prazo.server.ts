/**
 * Prazo de pagamento do orçamento na operadora CompreFácil/FRT.
 *
 * A operadora devolve esse dado com nomes diferentes conforme o produto
 * (PrazoPagamento, DataLimitePagamento, PrazoPagamentoIntegral, TimeLimit…),
 * às vezes só dentro do aéreo/hotel. Por isso varremos o objeto e ficamos
 * com a data mais próxima — que é o prazo real que o cliente precisa honrar.
 */


function ehChavePrazo(chave: string): boolean {
  const k = chave.replace(/[\s_-]/g, "").toLowerCase();
  if (k.includes("cancelamento") || k.includes("emissao")) return false;
  if (k === "timelimit" || k === "ticketingtimelimit") return true;
  return (k.includes("pagamento") || k.includes("pgto")) && (k.includes("prazo") || k.includes("limite") || k.includes("data") || k.includes("venciment"));
}

function dataValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || /^0001-01-01/.test(s)) return null;
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;
  return s;
}

/** Varre o orçamento (recursivo) e devolve o prazo de pagamento mais próximo. */
export function extrairPrazoPagamento(raiz: unknown): string | null {
  const achados: string[] = [];
  const visto = new Set<unknown>();

  const anda = (no: unknown, prof: number) => {
    if (!no || typeof no !== "object" || prof > 6 || visto.has(no)) return;
    visto.add(no);
    if (Array.isArray(no)) {
      for (const item of no) anda(item, prof + 1);
      return;
    }
    for (const [chave, valor] of Object.entries(no as Record<string, unknown>)) {
      if (ehChavePrazo(chave)) {
        const d = dataValida(valor);
        if (d) achados.push(d);
      }
      anda(valor, prof + 1);
    }
  };

  anda(raiz, 0);
  if (!achados.length) return null;
  return achados.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]!;
}

/** Formata para exibição no padrão do portal: 25/08/2026 22:00:00. */
export function formatarPrazoPagamento(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
