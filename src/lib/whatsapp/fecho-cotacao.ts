/**
 * FECHO DA COTAÇÃO — o "e aí, o que cê achou?" depois das artes.
 *
 * Antes era sempre a MESMA frase, com aviso de tarifas e taxas colado. Lendo no
 * WhatsApp, parecia aviso de sistema. Aqui o fecho é escrito como um consultor
 * humano escreve: curto, com opinião, puxando a decisão sem pressionar — e
 * SEMPRE variando, pra quem conversa duas vezes não receber o mesmo texto.
 *
 * Nada de markdown (WhatsApp), nada de "sistema/motor/cotação gerada".
 */

/** Reconhece qualquer fecho já enviado (dedupe), independente da variação. */
export const FECHO_RE =
  /(o que (cê|vc) achou|qual (delas|dessas) (te agradou|ficou melhor|faz mais sentido)|alguma dessas te atende|te agradou alguma|curtiu alguma|qual te chamou mais aten)/i;

/** Aberturas: reação humana ao que acabou de mandar. */
const ABERTURAS = [
  "e aí, o que cê achou?",
  "então, o que vc achou dessas?",
  "olha só e me diz o que cê achou",
  "dá uma olhada com calma e me fala o que achou",
  "e aí, alguma dessas te atende?",
];

/** Opinião de consultor — é o que tira a cara de robô. */
const OPINIOES = [
  "eu particularmente iria na primeira: o horário é bem mais tranquilo pra quem não gosta de correria",
  "se fosse pra mim, eu ficaria com a primeira — sai melhor no custo-benefício",
  "na minha experiência, quem viaja nesse trecho costuma preferir a primeira, o horário rende mais o dia",
  "a primeira é a que eu recomendaria: melhor combinação de horário e preço",
  "entre elas, a primeira é a que eu acho mais equilibrada pro seu caso",
];

/** Empurrãozinho comercial, sem pressão de vendedor chato. */
const FECHAMENTOS = [
  "se quiser eu já seguro a tarifa e te passo as formas de pagamento",
  "me diz qual vc prefere que eu já verifico a disponibilidade e te passo o pagamento",
  "se alguma serviu, me fala que eu já dou sequência na emissão pra vc",
  "se quiser, eu já adianto o pagamento e garanto esse valor antes de mudar",
  "escolhendo uma, eu já cuido do resto e te mando tudo certinho",
];

/** Lembrete de que a tarifa é viva — urgência real, não invenção. */
const URGENCIAS = [
  "só lembrando que tarifa aérea muda rápido, o valor é o de agora",
  "esses valores são os de agora, aéreo costuma oscilar durante o dia",
  "vale decidir com um pouco de pressa porque o preço pode subir a qualquer momento",
];

const sorteia = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)]!;

/**
 * Monta o fecho em 2 balões curtos (jeito humano de escrever no WhatsApp).
 * @param nome primeiro nome do cliente (opcional)
 * @param qtdOpcoes quantas artes foram entregues
 */
export function montarFecho(nome: string | null, qtdOpcoes: number): string[] {
  const voc = nome ? `${nome}, ` : "";
  const abertura = sorteia(ABERTURAS);
  const primeiro =
    qtdOpcoes > 1
      ? `${voc}${abertura}`
      : `${voc}${abertura.replace(/dessas|delas/g, "dessa")}`;

  const meio = qtdOpcoes > 1 ? sorteia(OPINIOES) : sorteia(URGENCIAS);
  const fim = sorteia(FECHAMENTOS);

  return [
    primeiro.charAt(0).toUpperCase() + primeiro.slice(1),
    `${meio.charAt(0).toUpperCase() + meio.slice(1)}. ${fim}`,
  ];
}
