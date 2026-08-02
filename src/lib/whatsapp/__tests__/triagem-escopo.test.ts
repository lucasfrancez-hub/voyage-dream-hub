import { describe, it, expect } from "vitest";
import { heuristicaAereo } from "../triage.server";

/**
 * Roteamento de escopo: só passagem aérea avulsa fica na Central
 * (Paula/Bruno). Todo o resto segue com a consultora, que encaminha
 * ao Comercial conforme as regras do prompt.
 */
describe("roteamento — fica na Central de Especialistas", () => {
  const aereo = [
    "Quero uma passagem para Recife",
    "Quero um voo para Recife",
    "Quero ida e volta",
    "Quero só ida",
    "Tem voo para Salvador?",
    "quero cotar uma pasagem pra Lisboa",
    "preciso ir e voltar no mesmo dia",
  ];
  for (const t of aereo) {
    it(`aéreo: ${t}`, () => expect(heuristicaAereo(t)).toBe(true));
  }
});

describe("roteamento — NÃO é Central (vai para consultora/Comercial)", () => {
  const fora = [
    "Quero um pacote para Porto Seguro",
    "Quero um pacote para Aruba",
    "Gostei desse pacote, mas quero outro hotel",
    "Quero um hotel em Natal",
    "Quanto custa um hotel em Gramado?",
    "Quero alugar um carro em Orlando",
    "Quero locação em Lisboa",
    "Quero voo e hotel para Maceió",
    "Quero contratar seguro viagem",
    "Quero remarcar minha passagem",
    "Quero cancelar minha reserva",
    "Quero fazer um cruzeiro",
    "Preciso de transfer do aeroporto",
    "Quero viajar",
    "oi boa tarde",
  ];
  for (const t of fora) {
    it(`fora do escopo: ${t}`, () => expect(heuristicaAereo(t)).toBe(false));
  }
});
