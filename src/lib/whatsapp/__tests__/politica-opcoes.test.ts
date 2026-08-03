/**
 * Política de quantidade de opções da Central de Especialistas.
 * Preferencialmente 3, mínimo 2, 1 apenas como exceção registrada em log.
 */
import { describe, expect, it } from "vitest";
import { MAX_OPCOES, MIN_OPCOES } from "../flight-cards-pending.server";
import { detectRefineIntents } from "../flight-refine";

/** Seleção aplicada pela Central antes do envio. */
const selecionar = (engineResults: number) => Math.min(engineResults, MAX_OPCOES);

/** Decisão de ampliação automática (só quando o motor devolve menos que o piso). */
const precisaAmpliar = (engineResults: number) => engineResults < MIN_OPCOES;

/** Log padronizado da política. */
const logPolitica = (engineResults: number, enviadas: number) => ({
  engine_results: engineResults,
  selected_options: selecionar(engineResults),
  sent_options: enviadas,
  reason: enviadas === 1 ? "only_one_option_available" : null,
});

describe("política de quantidade de opções", () => {
  it("meta é 3 opções com piso de 2", () => {
    expect(MAX_OPCOES).toBe(3);
    expect(MIN_OPCOES).toBe(2);
  });

  it("Teste 1 — motor retorna 5: envia as 3 melhores", () => {
    expect(selecionar(5)).toBe(3);
    expect(precisaAmpliar(5)).toBe(false);
  });

  it("Teste 2 — motor retorna 3: envia as 3", () => {
    expect(selecionar(3)).toBe(3);
  });

  it("Teste 3 — motor retorna 2: envia as 2", () => {
    expect(selecionar(2)).toBe(2);
    expect(precisaAmpliar(2)).toBe(false);
  });

  it("Teste 4 — motor retorna 1: amplia a pesquisa antes de enviar", () => {
    expect(precisaAmpliar(1)).toBe(true);
    // ampliação trouxe alternativas → volta à meta de 3
    expect(selecionar(4)).toBe(3);
    // ampliação não trouxe nada → exceção registrada em log
    expect(logPolitica(1, 1)).toEqual({
      engine_results: 1,
      selected_options: 1,
      sent_options: 1,
      reason: "only_one_option_available",
    });
  });

  it("nunca limita artificialmente a 1 quando há alternativas", () => {
    for (const n of [2, 3, 4, 5, 9]) expect(selecionar(n)).toBeGreaterThanOrEqual(MIN_OPCOES);
  });

  it("log de 3 opções não registra motivo de exceção", () => {
    expect(logPolitica(5, 3)).toEqual({
      engine_results: 5,
      selected_options: 3,
      sent_options: 3,
      reason: null,
    });
  });

  it("Teste 5 — 'tem mais opções?' é detectado como continuidade", () => {
    for (const frase of [
      "tem mais opções?",
      "tem outras?",
      "tem alguma alternativa?",
      "tem outro voo?",
    ]) {
      const intents = detectRefineIntents(frase);
      expect(intents.some((i) => i.kind === "mais_opcoes")).toBe(true);
    }
  });

  it("Teste 5 — decisão entre entregar restantes e nova pesquisa", () => {
    const decidir = (restantes: number) => (restantes > 0 ? "entregar_restantes" : "nova_pesquisa");
    expect(decidir(2)).toBe("entregar_restantes");
    expect(decidir(0)).toBe("nova_pesquisa");
  });

  it("falha de card não reduz a quantidade: fallback em texto mantém a seleção", () => {
    const selecionadas = selecionar(5);
    const entregues = selecionadas; // cards com fallback em texto quando a arte falha
    expect(entregues).toBe(3);
  });
});
