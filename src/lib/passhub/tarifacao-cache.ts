/**
 * Cache único de tarifação da PassHub (preço líquido + comissão real).
 *
 * Regra do negócio: o valor de venda NUNCA é calculado localmente. Ele é
 * sempre o que a PassHub devolve na tarifação com o percentual configurado
 * (o incentivo já está embutido no preço; somente a RAV é adicional). Este cache garante que a lista, o
 * detalhamento, o resumo e a tela de reserva mostrem exatamente o mesmo valor.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { passhubTarifarOferta } from "@/lib/passhub/passhub.functions";

export type TarifacaoCache = { preco: number; comissao: number; total: number };

const cache = new Map<string, TarifacaoCache>();
const emAndamento = new Set<string>();
const ouvintes = new Set<() => void>();
let versao = 0;

function avisar() {
  versao += 1;
  for (const o of ouvintes) o();
}

function assinar(fn: () => void) {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

export function chaveTarifacao(tokens: string[], pct: number): string {
  return `${pct}|${[...new Set(tokens.filter(Boolean))].join("~")}`;
}

export function lerTarifacao(chave: string): TarifacaoCache | null {
  return cache.get(chave) ?? null;
}

/** Grava uma tarifação já feita (ex.: tela de reserva) no cache comum. */
export function salvarTarifacao(chave: string, preco: number, comissao: number) {
  // Confirmado no contrato da PassHub: `preco` é sempre o líquido (tarifa +
  // taxas) e NÃO muda com a RAV enviada. A comissão efetiva volta separada em
  // rav_amount_brl_efetivo — o valor de venda é preço líquido + comissão.
  cache.set(chave, { preco, comissao, total: Math.round((preco + comissao) * 100) / 100 });
  avisar();
}

/** Re-renderiza quando qualquer tarifação nova chega ao cache. */
export function useVersaoTarifacao(): number {
  const snap = useCallback(() => versao, []);
  return useSyncExternalStore(assinar, snap, snap);
}

/* ------------------------------- fila (8 por vez) ------------------------------- */

type Tarefa = () => Promise<void>;
const fila: Tarefa[] = [];
let ativos = 0;
const LIMITE = 8;

function girar() {
  while (ativos < LIMITE && fila.length) {
    const t = fila.shift()!;
    ativos += 1;
    void t().finally(() => {
      ativos -= 1;
      girar();
    });
  }
}

/** Zera a fila (nova busca): resultados antigos não valem mais. */
export function limparFilaTarifacao() {
  fila.length = 0;
}

/**
 * Assina a tarifação real de um conjunto de tokens. Devolve null enquanto a
 * PassHub não responde.
 */
export function useTarifacaoPassHub(
  tokens: (string | undefined | null)[],
  provedor: string,
  precoEsperado: number,
  pct: number,
  ativo = true,
): TarifacaoCache | null {
  const tarifarFn = useServerFn(passhubTarifarOferta);
  const limpos = tokens.filter((t): t is string => Boolean(t));
  const chave = chaveTarifacao(limpos, pct);

  const snapshot = useCallback(() => versao, []);
  useSyncExternalStore(assinar, snapshot, snapshot);

  useEffect(() => {
    if (!ativo || !limpos.length) return;
    if (cache.has(chave) || emAndamento.has(chave)) return;
    emAndamento.add(chave);
    fila.push(async () => {
      try {
        const r = await tarifarFn({
          data: {
            rateTokens: [...new Set(limpos)],
            provedor: provedor || "CVC",
            precoEsperado,
            ravPercentual: pct || null,
          },
        });
        if (r.ok) {
          const preco = r.tarifacao.preco || 0;
          const comissao = r.tarifacao.ravValor || 0;
          cache.set(chave, {
            preco,
            comissao,
            total: Math.round((preco + comissao) * 100) / 100,
          });
          avisar();
        }
      } catch {
        /* mantém o valor líquido da busca */
      } finally {
        emAndamento.delete(chave);
      }
    });
    girar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ativo, precoEsperado, provedor]);

  return cache.get(chave) ?? null;
}

/**
 * Força uma nova tarifação (botão "Tarifar"): descarta o valor em cache e
 * consulta a PassHub outra vez, devolvendo o resultado já atualizado.
 */
export async function forcarTarifacao(
  tarifarFn: (arg: {
    data: {
      rateTokens: string[];
      provedor: string;
      precoEsperado: number;
      ravPercentual: number | null;
    };
  }) => Promise<any>,
  tokens: (string | undefined | null)[],
  provedor: string,
  precoEsperado: number,
  pct: number,
): Promise<TarifacaoCache | null> {
  const limpos = [...new Set(tokens.filter((t): t is string => Boolean(t)))];
  if (!limpos.length) return null;
  const chave = chaveTarifacao(limpos, pct);
  cache.delete(chave);
  avisar();
  const r = await tarifarFn({
    data: {
      rateTokens: limpos,
      provedor: provedor || "CVC",
      precoEsperado,
      ravPercentual: pct || null,
    },
  });
  if (!r?.ok) throw new Error(r?.erro || "Falha ao tarifar");
  const preco = r.tarifacao.preco || 0;
  const comissao = r.tarifacao.ravValor || 0;
  const valor: TarifacaoCache = {
    preco,
    comissao,
    total: Math.round((preco + comissao) * 100) / 100,
  };
  cache.set(chave, valor);
  avisar();
  return valor;
}

