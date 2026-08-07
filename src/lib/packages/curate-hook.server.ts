/** Sorteia o estilo do gancho de abertura para evitar textos repetitivos da IA. */

export const HOOK_STYLES: { nome: string; instrucao: string; exemplo: string }[] = [
  {
    nome: "Cena viva",
    instrucao:
      "Descreva uma CENA concreta em 3 imagens curtas separadas por vírgula, sem pergunta e sem verbo no imperativo.",
    exemplo: "Areia fina, vento morno, o dia inteiro sem hora marcada.",
  },
  {
    nome: "Fato do destino",
    instrucao:
      "Traga um FATO real e específico do destino (geografia, cultura, gastronomia, clima) em tom de descoberta. Nada de pergunta.",
    exemplo: "São 90 km de praia — a gente escolheu justamente a mais tranquila.",
  },
  {
    nome: "Provocação",
    instrucao: "Comece com uma provocação/curiosidade que quebre uma expectativa. Frase afirmativa.",
    exemplo: "Tem um jeito de conhecer a Patagônia gastando menos do que parece.",
  },
  {
    nome: "Convite curto",
    instrucao: "Convite direto, informal e curtíssimo (até 8 palavras), com verbo no imperativo.",
    exemplo: "Bora tirar esse destino da lista de uma vez.",
  },
  {
    nome: "Contraste",
    instrucao:
      "Monte um contraste entre a rotina de agora e o destino, em uma frase só, sem pergunta.",
    exemplo: "Enquanto aqui é só segunda-feira, lá é verão o ano todo.",
  },
  {
    nome: "Timing",
    instrucao:
      "Fale do MOMENTO certo de ir (estação, temporada, evento) com urgência sutil e sem clichê comercial.",
    exemplo: "É justamente nesse mês que a cidade fica vazia e barata.",
  },
  {
    nome: "Detalhe sensorial",
    instrucao:
      "Escolha UM detalhe sensorial inesperado do destino (cheiro, som, sabor, temperatura) e escreva em tom de memória.",
    exemplo: "O cheiro de pão quente às seis da manhã ainda é a melhor lembrança de lá.",
  },
  {
    nome: "Pergunta sensorial",
    instrucao:
      "Uma pergunta sensorial, MAS proibido usar 'Que tal acordar' e 'Já imaginou'. Varie o verbo e o enquadramento.",
    exemplo: "Sente o cheiro do mar chegando antes mesmo de descer do avião?",
  },
  {
    nome: "Micro-história",
    instrucao:
      "Comece como se fosse o começo de uma história curta em primeira ou terceira pessoa.",
    exemplo: "Quem vai uma vez sempre volta falando da mesma esquina.",
  },
  {
    nome: "Número/dado",
    instrucao: "Abra com um NÚMERO concreto ligado ao destino ou à viagem, e feche a frase com sentido.",
    exemplo: "Sete noites bastam pra conhecer o melhor da ilha sem correria.",
  },
];

/** Aberturas queimadas — a IA não pode usar nenhuma delas. */
export const HOOK_BANNED_OPENERS = [
  "Que tal acordar",
  "Que tal",
  "Já imaginou",
  "Imagina só",
  "Prepare-se para",
  "Venha viver",
  "Descubra",
  "Oportunidade imperdível",
  "Não perca",
  "Sonho de",
];

export function pickHookStyle(seed?: string) {
  const idx =
    seed && seed.length
      ? [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100000, 7) % HOOK_STYLES.length
      : Math.floor(Math.random() * HOOK_STYLES.length);
  // mistura com aleatoriedade real para não repetir sempre o mesmo estilo no mesmo pacote
  const jitter = Math.floor(Math.random() * HOOK_STYLES.length);
  return HOOK_STYLES[(idx + jitter) % HOOK_STYLES.length];
}

export function buildHookDirective(seed?: string) {
  const style = pickHookStyle(seed);
  return `ESTILO OBRIGATÓRIO DO GANCHO DESTA VEZ: "${style.nome}". ${style.instrucao}
Exemplo APENAS de ritmo/tom (NÃO copie o conteúdo): "${style.exemplo}"
ABERTURAS PROIBIDAS (não pode começar com nenhuma delas, nem variação próxima): ${HOOK_BANNED_OPENERS.map((o) => `"${o}"`).join(", ")}.
O gancho tem que ser inédito, específico do destino real e nunca soar como template.`;
}
