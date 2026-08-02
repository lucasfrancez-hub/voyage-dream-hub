import { describe, it, expect } from "vitest";
import {
  resolveOptionReference, detectSearchFilterIntent, detectResendIntent, detectComparisonIntent,
} from "@/lib/whatsapp/flight-quote-memory.server";

const op = (i: number, cia: string, saida: string, chegada: string, dur: string, valor: number) => ({
  quote_id: "q1", option_index: i, companhia: cia, saida, chegada, data_ida: "2026-09-10",
  volta_saida: null, volta_chegada: null, paradas: i === 1 ? 0 : 1, duracao: dur,
  bagagem_despachada: false, valor, valor_formatado: `R$ ${valor}`, destaque: "",
  enviada_em: "2026-08-01T10:00:00Z", agente: "Bruno", opcao: {} as never,
});
const mem = [{
  quote_id: "q1", criada_em: "2026-08-02T10:00:00Z", atual: true, cancelada: false,
  escolha_option_index: null, rota: "CWB → REC", origem_termos: ["Curitiba"], destino_termos: ["Recife"],
  idade_horas: 1, data_ida: "2026-09-10", data_volta: null, passageiros: "1 adulto",
  agente_slug: "bruno", agente_nome: "Bruno", filtros: null,
  opcoes: [op(1, "LATAM", "08:10", "12:20", "4h10"), op(2, "Azul", "14:00", "17:30", "3h30", 1200)].map((o, i) => i === 0 ? { ...o, valor: 900, valor_formatado: "R$ 900" } : o) as never[],
  pendentes: [],
}] as never[];
const last = { quote_id: "q1", option_index: 2 };

describe("referências", () => {
  it("aquela → última referenciada", () => {
    expect(resolveOptionReference(mem, "Pode mandar novamente aquela opção?", last)?.option_index).toBe(2);
  });
  it("a de antes", () => expect(resolveOptionReference(mem, "Manda a de antes novamente", last)?.option_index).toBe(2));
  it("reenvia aquela da Azul", () => expect(resolveOptionReference(mem, "Reenvia aquela da Azul", last)?.option_index).toBe(2));
  it("continuidade sem pronome", () => {
    expect(resolveOptionReference(mem, "Essa tem bagagem?", last)?.option_index).toBe(2);
    const r = resolveOptionReference(mem, "Quanto fica com bagagem?", last);
    expect(r?.match).toBe("continuidade");
  });
  it("conexão é longa → continuidade", () => expect(resolveOptionReference(mem, "A conexão é longa?", last)?.match).toBe("continuidade"));
  it("Latam chega antes → opção da Latam", () => {
    const r = resolveOptionReference(mem, "A Latam chega antes?", last);
    expect(r?.option_index).toBe(1); expect(r?.match).toBe("comparacao");
  });
  it("Azul é mais rápida → opção da Azul", () => expect(resolveOptionReference(mem, "A Azul é mais rápida?", last)?.option_index).toBe(2));
  it("sem conexão é filtro, não referência", () => {
    expect(detectSearchFilterIntent("Tem alguma sem conexão?")).toEqual({ somente_voo_direto: true });
    expect(resolveOptionReference(mem, "Tem alguma sem conexão?", last)).toBeNull();
  });
  it("conexão rápida", () => expect(detectSearchFilterIntent("Se não tiver direto, pode ser uma conexão rápida")).toEqual({ maximo_conexoes: 1, preferir_conexao_curta: true }));
  it("reenvio detectado", () => {
    for (const t of ["Pode mandar novamente aquela opção?", "Manda a de antes novamente", "Reenvia aquela da Azul", "Manda essa de novo", "Quero ver essa novamente", "Pode reenviar a primeira?"])
      expect(detectResendIntent(t), t).toBe(true);
  });
  it("manda novamente a segunda de Recife", () => expect(resolveOptionReference(mem, "Manda novamente a segunda de Recife", last)?.option_index).toBe(2));
  it("comparação ainda funciona", () => expect(detectComparisonIntent("qual chega primeiro?")).toBe("chegada_mais_cedo"));
});
