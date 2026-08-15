/**
 * DETECÇÃO DA PERGUNTA PENDENTE (aéreo).
 *
 * O resolvedor determinístico de respostas curtas (`resolvePendingFlightAnswer`)
 * só funciona quando a solicitação aérea sabe QUAL pergunta acabou de ser feita.
 * Como o texto é gerado pelo modelo, inferimos a pergunta pelo próprio texto
 * enviado ao cliente — assim "sim", "2", "com bagagem" são resolvidos sem
 * depender de o modelo reler o histórico (origem das perguntas repetidas).
 *
 * Puro e testável: sem I/O.
 */
import type { PendingQuestion } from "./short-answer";

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const REGRAS: Array<{ q: PendingQuestion; rx: RegExp[] }> = [
  {
    q: "ask_origin",
    rx: [
      /de qual (cidade|aeroporto)[^?]*\b(sai|parte|embarc)/,
      /(de onde|donde)[^?]*\b(vc|voce|ce|voces)?[^?]*\b(sai|parte|embarc)/,
      /qual (a )?(cidade|aeroporto) de (embarque|origem)/,
      /qual (a )?origem (do voo|da viagem)/,
    ],
  },
  {
    q: "ask_baggage",
    rx: [/bagagem despachada/, /(com|precisa de|vai levar).{0,20}(mala|bagagem)/, /\bbagagem\b[^?]*\?/],
  },
  {
    q: "ask_passengers",
    rx: [
      /quantas? pessoas?[^?]*\?/,
      /quantos? (passageiros|adultos)[^?]*\?/,
      /vai viajar (sozinho|sozinha|com mais alguem)/,
    ],
  },
  {
    q: "ask_trip_type",
    rx: [/(so ida|somente ida|apenas ida).{0,25}(ou|e).{0,25}(ida e volta)/, /ida e volta.{0,25}ou.{0,25}(so|somente) ida/],
  },
  {
    q: "ask_direct_flight",
    rx: [/voo direto/, /(aceita|pode ter|tudo bem com).{0,20}(escala|conexao)/],
  },
  {
    q: "ask_dates",
    rx: [/qual (a )?data[^?]*\?/, /que dia (vc|voce|ce)?[^?]*\b(vai|pretende|quer)\b/, /datas? de (ida|volta)/],
  },
];

/** Retorna a pergunta pendente inferida do texto enviado, ou null. */
export function detectPendingQuestion(texto: string): PendingQuestion | null {
  const t = normalizar(texto);
  if (!t.includes("?")) return null;
  for (const regra of REGRAS) {
    if (regra.rx.some((rx) => rx.test(t))) return regra.q;
  }
  return null;
}
