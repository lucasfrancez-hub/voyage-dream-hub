/**
 * Cesta de orçamento do motor interno.
 *
 * Cada voo escolhido no motor pode ser guardado aqui ("Salvar como orçamento").
 * No fim, todos os voos guardados viram OPÇÕES de um único orçamento — assim o
 * consultor monta múltiplas opções de voo em uma cotação só.
 */
import { useSyncExternalStore } from "react";
import type { QuoteFlight } from "@/lib/quote-flight";

export type QuoteBasketItem = {
  id: string;
  label: string;
  total: number;
  adults: number;
  children: number;
  origin: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Linhas do resumo (ida/volta) que viram itens inclusos da opção. */
  services: string[];
  /** Voos estruturados: aparecem no bloco aéreo do orçamento. */
  flights?: QuoteFlight[];
  notes: string | null;
};


const KEY = "viaair.quote-basket.v1";

let items: QuoteBasketItem[] = [];
let carregado = false;
const listeners = new Set<() => void>();

function carregar() {
  if (carregado || typeof window === "undefined") return;
  carregado = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) items = JSON.parse(raw) as QuoteBasketItem[];
  } catch {
    items = [];
  }
}

function salvar() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* sem persistência é aceitável */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  carregar();
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot(): QuoteBasketItem[] {
  carregar();
  return items;
}

const VAZIO: QuoteBasketItem[] = [];

export function useQuoteBasket(): QuoteBasketItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => VAZIO);
}

export function addToQuoteBasket(item: Omit<QuoteBasketItem, "id">): QuoteBasketItem {
  carregar();
  const novo: QuoteBasketItem = { ...item, id: crypto.randomUUID() };
  items = [...items, novo].slice(0, 6);
  salvar();
  return novo;
}

export function removeFromQuoteBasket(id: string) {
  carregar();
  items = items.filter((i) => i.id !== id);
  salvar();
}

export function clearQuoteBasket() {
  items = [];
  salvar();
}
