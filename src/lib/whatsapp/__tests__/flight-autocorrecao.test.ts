import { describe, expect, it } from "vitest";
import {
  MAX_TENTATIVAS,
  RECUPERACAO_FORCADA_MS,
  claimExpirado,
  cotacaoConcluida,
  detectarInconsistencias,
  ehTerminal,
  emAndamento,
  opcaoDisponivel,
  quoteStatus,
  statusAposFalha,
} from "../flight-delivery";

const AGORA = Date.UTC(2026, 7, 3, 12, 0, 0);
const iso = (deltaMs: number) => new Date(AGORA + deltaMs).toISOString();

const opt = (o: Partial<Parameters<typeof detectarInconsistencias>[1][number]> = {}) => ({
  option_index: 0,
  delivery_status: "pending",
  claim_expires_at: null,
  next_run_at: null,
  last_attempt_at: iso(-1000),
  provider_message_id: null,
  attempt_count: 0,
  ...o,
});

const quote = (q: Partial<Parameters<typeof detectarInconsistencias>[0]> = {}) => ({
  created_at: iso(-30_000),
  delivery_status: "processing",
  delivered_options_count: 0,
  expected_options: 3,
  next_run_at: iso(30_000),
  ...q,
});

describe("estados terminais", () => {
  it("entregue, cancelado e failed_final não voltam pra fila", () => {
    for (const s of ["delivered_card", "delivered_text", "cancelled", "failed_final"]) {
      expect(ehTerminal(s)).toBe(true);
      expect(opcaoDisponivel({ delivery_status: s }, AGORA)).toBe(false);
    }
  });

  it("falha recuperável e retry_scheduled voltam pra fila", () => {
    expect(opcaoDisponivel({ delivery_status: "failed_recoverable" }, AGORA)).toBe(true);
    expect(opcaoDisponivel({ delivery_status: "retry_scheduled" }, AGORA)).toBe(true);
  });

  it("estados de meio de tentativa só liberam com claim expirado", () => {
    for (const s of ["claimed", "rendering", "card_generated", "sending_card"]) {
      expect(emAndamento(s)).toBe(true);
      expect(opcaoDisponivel({ delivery_status: s, claim_expires_at: iso(20_000) }, AGORA)).toBe(false);
      expect(opcaoDisponivel({ delivery_status: s, claim_expires_at: iso(-1) }, AGORA)).toBe(true);
    }
  });

  it("vira failed_final só depois do limite de tentativas", () => {
    expect(statusAposFalha(1)).toBe("failed_recoverable");
    expect(statusAposFalha(MAX_TENTATIVAS)).toBe("failed_final");
  });
});

describe("detecção de inconsistências", () => {
  it("cotação saudável em andamento não acusa nada", () => {
    expect(
      detectarInconsistencias(
        quote({ delivery_status: "pending" }),
        [opt(), opt({ option_index: 1 }), opt({ option_index: 2 })],
        AGORA,
      ),
    ).toEqual([]);
  });

  it("claim órfão de render é detectado", () => {
    const r = detectarInconsistencias(
      quote(),
      [opt({ delivery_status: "rendering", claim_expires_at: iso(-5_000) })],
      AGORA,
    );
    expect(r.map((x) => x.tipo)).toContain("claim_orfao");
  });

  it("card gerado e não enviado tem tipo próprio", () => {
    const r = detectarInconsistencias(
      quote(),
      [opt({ delivery_status: "card_generated", claim_expires_at: iso(-1) })],
      AGORA,
    );
    expect(r[0].tipo).toBe("card_gerado_nao_enviado");
  });

  it("envio no provedor sem baixa no banco é reconciliável", () => {
    const r = detectarInconsistencias(
      quote(),
      [opt({ delivery_status: "pending", provider_message_id: "wamid.X" })],
      AGORA,
    );
    expect(r[0].tipo).toBe("envio_nao_reconciliado");
  });

  it("opção parada além do limite exige recuperação forçada", () => {
    const r = detectarInconsistencias(
      quote(),
      [opt({ last_attempt_at: iso(-RECUPERACAO_FORCADA_MS - 1000) })],
      AGORA,
    );
    expect(r.map((x) => x.tipo)).toContain("opcao_parada");
  });

  it("faltando opção sem next_run_at acusa rodada não encadeada", () => {
    const r = detectarInconsistencias(
      quote({ next_run_at: null, delivered_options_count: 1, delivery_status: "partially_delivered" }),
      [opt({ delivery_status: "delivered_card" }), opt({ option_index: 1 })],
      AGORA,
    );
    expect(r.map((x) => x.tipo)).toContain("rodada_nao_agendada");
  });

  it("contador divergente das opções reais acusa status incorreto", () => {
    const r = detectarInconsistencias(
      quote({ delivered_options_count: 0, delivery_status: "pending" }),
      [opt({ delivery_status: "delivered_text" }), opt({ option_index: 1 }), opt({ option_index: 2 })],
      AGORA,
    );
    expect(r.map((x) => x.tipo)).toContain("status_incorreto");
  });
});

describe("estado final da cotação", () => {
  it("só conclui com todas as previstas, misturando card e texto", () => {
    expect(cotacaoConcluida(3, 3)).toBe(true);
    expect(cotacaoConcluida(2, 3)).toBe(false);
    expect(quoteStatus(3, 3)).toBe("completed");
  });

  it("nada entregue e nada recuperável = failed (vai pro humano)", () => {
    expect(quoteStatus(0, 3, { allFinalFailed: true })).toBe("failed");
  });

  it("parcial nunca é considerado encerrado", () => {
    expect(quoteStatus(1, 3)).toBe("partially_delivered");
    expect(quoteStatus(1, 3, { recovering: true })).toBe("recovering");
  });

  it("claim sem data é considerado expirado", () => {
    expect(claimExpirado(null, AGORA)).toBe(true);
  });
});
